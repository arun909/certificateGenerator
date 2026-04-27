import os
import subprocess
import textwrap
import shutil
import json
import zipfile
import tempfile
import base64
import datetime
from typing import Optional
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from pymongo import MongoClient
from bson import ObjectId
import bcrypt

app = Flask(__name__)
CORS(app, supports_credentials=True)

# --- Database Setup ---
MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin:password@127.0.0.1:27017/?authSource=admin")
client = MongoClient(MONGO_URI)

db = client["certificate_generator"]

PRIMARY_SUPERADMIN_EMAIL = "trizlabz"
PRIMARY_SUPERADMIN_PASSWORD = "trizlabz1234#"

# --- Encryption Logic ---
ENCRYPTION_KEY = os.getenv(
    "ENCRYPTION_KEY",
    "qyeB8BbxKw9-D9DtxOtJ6sRouvgwfQcwFQ1ZBe8NcWg"
)

def normalize_key(key: str) -> bytes:
    key_bytes = key.encode()
    if len(key_bytes) == 32:
        return key_bytes
    normalized = bytearray(32)
    normalized[:min(len(key_bytes), 32)] = key_bytes[:32]
    return bytes(normalized)

def decrypt(encrypted_text: str) -> str:
    try:
        parts = encrypted_text.split(":")
        if len(parts) != 2:
            raise ValueError("Invalid encrypted text format.")
        iv = bytes.fromhex(parts[0])
        encrypted_data = bytes.fromhex(parts[1])
        cipher = Cipher(
            algorithms.AES(normalize_key(ENCRYPTION_KEY)),
            modes.CBC(iv),
            backend=default_backend()
        )
        decryptor = cipher.decryptor()
        decrypted_bytes = decryptor.update(encrypted_data) + decryptor.finalize()
        padding_len = decrypted_bytes[-1]
        decrypted_bytes = decrypted_bytes[:-padding_len]
        return decrypted_bytes.decode("utf-8")
    except Exception as e:
        print("Decryption failed:", e)
        raise RuntimeError("Failed to decrypt data.") from e

def extract_value(source_string, key):
    """Extract a value for 'key' from the decrypted QR string.
    Tries two formats:
      1. Colon + quoted:  Device Name:"MyDevice"
      2. JSON key:        {"Device Name": "MyDevice", ...}
    """
    try:
        # --- Format 1: key:"value" ---
        key_with_colon = f'{key}:'
        start_index = source_string.find(key_with_colon)
        if start_index != -1:
            substr = source_string[start_index + len(key_with_colon):]
            quote_start = substr.find('"')
            if quote_start != -1:
                quote_end = substr.find('"', quote_start + 1)
                if quote_end != -1:
                    return substr[quote_start + 1:quote_end].strip()

        # --- Format 2: JSON ---
        try:
            parsed = json.loads(source_string)
            # Try exact key first, then case-insensitive
            if key in parsed:
                return str(parsed[key])
            lower_key = key.lower().replace(" ", "_")
            for k, v in parsed.items():
                if k.lower().replace(" ", "_") == lower_key:
                    return str(v)
        except (json.JSONDecodeError, TypeError):
            pass

        return None
    except Exception:
        return None

# --- Paths ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CERTS_DIR = os.path.join(SCRIPT_DIR, "certs")
CA_KEY = os.path.join(CERTS_DIR, "ca.key")
CA_CRT = os.path.join(CERTS_DIR, "ca.crt")

def run_cmd(cmd):
    print(f"→ {cmd}")
    subprocess.check_call(cmd, shell=True)


def enforce_user_role_policy():
    """Keep only one SUPER_ADMIN and downgrade other elevated roles."""
    try:
        primary = db.users.find_one({"email": PRIMARY_SUPERADMIN_EMAIL})
        if primary:
            # Ensure the designated superadmin always has the expected role and password.
            primary_hash = bcrypt.hashpw(
                PRIMARY_SUPERADMIN_PASSWORD.encode('utf-8'),
                bcrypt.gensalt()
            ).decode('utf-8')
            db.users.update_one(
                {"_id": primary["_id"]},
                {"$set": {"role": "SUPER_ADMIN", "password_hash": primary_hash}}
            )

        # Everyone else must be a regular USER.
        db.users.update_many(
            {"email": {"$ne": PRIMARY_SUPERADMIN_EMAIL}, "role": {"$in": ["SUPER_ADMIN", "ADMIN"]}},
            {"$set": {"role": "USER"}}
        )
    except Exception as e:
        print(f"[startup] Failed to enforce role policy: {e}")


def is_duplicate_manual_id(customer_id: ObjectId, manual_id: str, excluding_app_id: Optional[str] = None) -> bool:
    cleaned = (manual_id or "").strip()
    if not cleaned:
        return False
    query = {"customer_id": customer_id, "manual_id": cleaned}
    if excluding_app_id:
        query["_id"] = {"$ne": ObjectId(excluding_app_id)}
    return db.applications.find_one(query) is not None


def is_primary_admin_customer(customer_id: ObjectId) -> bool:
    primary = db.users.find_one({"email": PRIMARY_SUPERADMIN_EMAIL}, {"customer_id": 1})
    return bool(primary and primary.get("customer_id") == customer_id)

# --- Authentication APIs ---

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.json
    email = data.get("email")
    password = data.get("password")
    
    print(f"Login attempt for: {email}, password provided? {'Yes' if password else 'No'}")
    
    user = db.users.find_one({"email": email})
    if not user:
        print(f"User not found: {email}")
    else:
        print(f"User found: {email}, comparing password...")
    if user and bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        effective_role = user.get("role", "USER")

        # Hard-enforce the designated superadmin identity at login time.
        if user.get("email") == PRIMARY_SUPERADMIN_EMAIL:
            effective_role = "SUPER_ADMIN"
            db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"role": "SUPER_ADMIN"}}
            )

        user_data = {
            "email": user["email"],
            "role": effective_role,
            "customer_id": str(user["customer_id"]),
            "customer_name": user.get("customer_name", "")
        }
        return jsonify({"success": True, "user": user_data})
    
    return jsonify({"error": "Invalid email or password"}), 401

@app.route("/api/users", methods=["GET"])
def get_users():
    customer_id = request.args.get("customer_id")
    query = {"customer_id": ObjectId(customer_id)} if customer_id else {}
    users = list(db.users.find(query))
    
    enriched_users = []
    for u in users:
        if u.get("email") == PRIMARY_SUPERADMIN_EMAIL:
            continue
        u["_id"] = str(u["_id"])
        c_id = u["customer_id"]
        u["customer_id"] = str(c_id)
        if "password_hash" in u: del u["password_hash"]
        
        # Add usage info
        customer = db.customers.find_one({"_id": c_id})
        if customer:
            u["device_limit"] = customer.get("device_limit", 10)
            u["device_count"] = db.devices.count_documents({"customer_id": c_id})
            u["customer_name"] = customer.get("name", "")
        
        enriched_users.append(u)
        
    return jsonify(enriched_users)

@app.route("/api/users/<user_id>", methods=["DELETE"])
def delete_user(user_id):
    try:
        db.users.delete_one({"_id": ObjectId(user_id)})
        return jsonify({"success": True, "message": "User deleted successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/update-plant-certs", methods=["POST"])
def update_plant_certs():
    try:
        # Expect FormData with 'customer_id', 'plant_name', and files
        customer_id = request.form.get("customer_id")
        plant_name = request.form.get("plant_name")
        old_plant_name = request.form.get("old_plant_name") or plant_name
        
        if not customer_id or not plant_name:
            return jsonify({"error": "Missing customer_id or plant_name"}), 400
        customer_oid = ObjectId(customer_id)
        if is_primary_admin_customer(customer_oid):
            return jsonify({"error": "Plant configuration is disabled for the system admin account"}), 403
            
        cert_paths = {}
        cert_contents = {}
        plant_dir = os.path.join(CERTS_DIR, "customers", str(customer_id), plant_name)
        os.makedirs(plant_dir, exist_ok=True)
        
        for ext in ["crt", "key", "srl"]:
            uploaded = request.files.get(ext)
            if uploaded:
                file_content = uploaded.read()
                cert_contents[ext] = base64.b64encode(file_content).decode('utf-8')
                uploaded.seek(0)
                dest = os.path.join(plant_dir, f"ca.{ext}")
                uploaded.save(dest)
                cert_paths[ext] = dest

        # Update the plant_certs array in customer document (supports rename-only and file updates)
        customer = db.customers.find_one({"_id": customer_oid})
        if customer:
            plant_certs = customer.get("plant_certs", [])
            updated = False
            for pc in plant_certs:
                if pc.get("plant_name") == old_plant_name:
                    pc["plant_name"] = plant_name  # Update name if changed
                    if cert_paths:
                        pc.setdefault("cert_paths", {}).update(cert_paths)
                    if cert_contents:
                        pc.setdefault("cert_contents", {}).update(cert_contents)
                    
                    if request.form.get("mqtt_broker"):
                        pc["mqtt_broker"] = request.form.get("mqtt_broker")
                    if request.form.get("mqtt_port"):
                        pc["mqtt_port"] = int(request.form.get("mqtt_port"))
                        
                    updated = True
                    break

            if not updated:
                plant_certs.append({
                    "plant_name": plant_name,
                    "cert_paths": cert_paths,
                    "cert_contents": cert_contents,
                    "mqtt_broker": request.form.get("mqtt_broker", "192.168.0.23"),
                    "mqtt_port": int(request.form.get("mqtt_port", 8883))
                })

            db.customers.update_one(
                {"_id": customer_oid},
                {"$set": {"plant_certs": plant_certs}}
            )

        # If plant name changed, update all applications belonging to this customer and old_plant_name
        if plant_name != old_plant_name:
            db.applications.update_many(
                {"customer_id": customer_oid, "plant_name": old_plant_name},
                {"$set": {"plant_name": plant_name}}
            )

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
@app.route("/api/admin/add-plant", methods=["POST"])
def add_plant():
    try:
        # Expect FormData with 'customer_id', 'plant_name', and files
        customer_id = request.form.get("customer_id")
        plant_name = request.form.get("plant_name")
        
        if not customer_id or not plant_name:
            return jsonify({"error": "Missing customer_id or plant_name"}), 400
        customer_oid = ObjectId(customer_id)
        if is_primary_admin_customer(customer_oid):
            return jsonify({"error": "Plant creation is disabled for the system admin account"}), 403
            
        # Check if plant already exists for this customer
        customer = db.customers.find_one({"_id": customer_oid})
        if not customer:
            return jsonify({"error": "Customer not found"}), 404
            
        plant_certs = customer.get("plant_certs", [])
        if any(pc.get("plant_name") == plant_name for pc in plant_certs):
            return jsonify({"error": f"Plant '{plant_name}' already exists"}), 400

        cert_paths = {}
        cert_contents = {}
        plant_dir = os.path.join(CERTS_DIR, "customers", str(customer_id), plant_name)
        os.makedirs(plant_dir, exist_ok=True)
        
        for ext in ["crt", "key", "srl"]:
            uploaded = request.files.get(ext)
            if uploaded:
                # Store content in DB
                file_content = uploaded.read()
                cert_contents[ext] = base64.b64encode(file_content).decode('utf-8')
                
                # Still save to disk for backup/compatibility
                uploaded.seek(0) # Reset file pointer after read()
                dest = os.path.join(plant_dir, f"ca.{ext}")
                uploaded.save(dest)
                cert_paths[ext] = dest
            else:
                return jsonify({"error": f"Missing required certificate file: .{ext}"}), 400
                
        # Add to plant_certs array
        plant_certs.append({
            "plant_name": plant_name, 
            "cert_paths": cert_paths,
            "cert_contents": cert_contents,
            "mqtt_broker": request.form.get("mqtt_broker", "192.168.0.23"),
            "mqtt_port": int(request.form.get("mqtt_port", 8883))
        })
        db.customers.update_one(
            {"_id": customer_oid},
            {"$set": {"plant_certs": plant_certs}}
        )
        
        return jsonify({"success": True, "message": f"Plant '{plant_name}' added successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Integrated user updates are handled via /api/admin/update-user
# Single field updates can still be added here if needed, but for now we favor the unified flow.

@app.route("/api/auth/register", methods=["POST"])
def register():
    try:
        data = request.json
        print(f"Registration request data: {data}")
        email = data.get("email")
        password = data.get("password")
        # Role is policy-controlled: only one fixed SUPER_ADMIN exists.
        role = "USER"
        customer_id_str = data.get("customer_id")
        customer_name = data.get("customer_name")

        missing = [f for f in ["email", "password", "customer_id"] if not data.get(f)]
        if missing:
            print(f"Missing required fields for registration: {', '.join(missing)}")
            return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

        try:
            customer_oid = ObjectId(customer_id_str)
        except Exception as e:
            print(f"Invalid customer_id format: {customer_id_str}")
            return jsonify({"error": f"Invalid customer ID: {str(e)}"}), 400

        hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        new_user = {
            "email": email,
            "password_hash": hashed_pw,
            "role": role,
            "customer_id": customer_oid,
            "customer_name": customer_name,
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }
        
        print(f"Inserting new user: {email}")
        result = db.users.insert_one(new_user)
        print(f"User created with ID: {result.inserted_id}")
        
        return jsonify({"success": True, "message": "User created successfully"})
    except Exception as e:
        print(f"Registration failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/onboard", methods=["POST"])
def onboard_system():
    try:
        # Support both JSON and FormData (multipart) requests
        if request.content_type and 'multipart/form-data' in request.content_type:
            data = json.loads(request.form.get("data", "{}"))
        else:
            data = request.json
        print(f"Onboarding request: {data}")
        
        org_name = data.get("organization")
        username = data.get("email") # mapped from 'email' state in frontend
        password = data.get("password")
        device_limit = data.get("device_limit", 10)
        
        if not all([org_name, username, password]):
            return jsonify({"error": "Missing required basic fields"}), 400
            
        # 1. Create Customer
        new_customer = {
            "name": org_name,
            "device_limit": int(device_limit),
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }
        cust_result = db.customers.insert_one(new_customer)
        customer_id = cust_result.inserted_id
        
        # 2. Create User
        hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        new_user = {
            "email": username,
            "password_hash": hashed_pw,
            "role": "USER",
            "customer_id": customer_id,
            "customer_name": org_name,
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }
        db.users.insert_one(new_user)
        
        # 3. Create Hierarchical Plants -> Apps -> Devices (Optional)
        plants_data = data.get("plants", [])
        for idx, plant_item in enumerate(plants_data):
            plant_name = plant_item.get("name")

            # Save cert files if present (from FormData)
            cert_paths = {}
            cert_contents = {}
            for ext in ["crt", "key", "srl"]:
                file_key = f"plant_{idx}_{ext}"
                uploaded = request.files.get(file_key)
                if uploaded:
                    file_content = uploaded.read()
                    cert_contents[ext] = base64.b64encode(file_content).decode('utf-8')
                    uploaded.seek(0)
                    plant_dir = os.path.join(CERTS_DIR, "customers", str(customer_id), plant_name or f"plant_{idx}")
                    os.makedirs(plant_dir, exist_ok=True)
                    dest = os.path.join(plant_dir, f"ca.{ext}")
                    uploaded.save(dest)
                    cert_paths[ext] = dest
                    print(f"Saved {ext} file for plant '{plant_name}' -> {dest}")

            # Store cert paths on the customer document if any files were saved
            if cert_paths:
                db.customers.update_one(
                    {"_id": customer_id},
                    {"$push": {"plant_certs": {
                        "plant_name": plant_name,
                        "cert_paths": cert_paths,
                        "cert_contents": cert_contents,
                        "mqtt_broker": plant_item.get("mqtt_broker", "192.168.0.23"),
                        "mqtt_port": int(plant_item.get("mqtt_port", 8883))
                    }}}
                )

            apps_data = plant_item.get("apps", [])
            for app_item in apps_data:
                app_name = app_item.get("name")
                if app_name:
                    app_manual_id = app_item.get("manual_id")
                    if is_duplicate_manual_id(customer_id, app_manual_id):
                        return jsonify({"error": f"Application ID '{app_manual_id}' already exists for this user"}), 400
                    new_app = {
                        "name": app_name,
                        "manual_id": app_manual_id,
                        "plant_name": plant_name,
                        "customer_id": customer_id,
                        "created_at": datetime.datetime.now(datetime.timezone.utc)
                    }
                    app_result = db.applications.insert_one(new_app)
                    app_id = app_result.inserted_id
                    
                    # Process Devices for this App
                    devices_data = app_item.get("devices", [])
                    for dev_item in devices_data:
                        dev_name = dev_item.get("name")
                        dev_id_manual = dev_item.get("device_id")
                        if dev_name or dev_id_manual:
                            new_device = {
                                "name": dev_name or "Gateway-01",
                                "device_id_string": dev_id_manual or f"DEV-{str(customer_id)[-6:]}",
                                "customer_id": customer_id,
                                "application_id": app_id,
                                "version": dev_item.get("version"),
                                "status": "PROVISIONED",
                                "created_at": datetime.datetime.now(datetime.timezone.utc)
                            }
                            db.devices.insert_one(new_device)
            
        return jsonify({
            "success": True, 
            "message": "Hierarchical onboarding completed successfully",
            "customer_id": str(customer_id)
        })
        
    except Exception as e:
        print(f"Onboarding error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/update-user", methods=["POST"])
def update_user_bundle():
    try:
        data = request.json
        user_id = data.get("user_id")
        customer_id = data.get("customer_id")
        
        if not user_id or not customer_id:
            return jsonify({"error": "Missing user_id or customer_id"}), 400
            
        # 1. Update User (check for password/email change)
        user_updates = {}
        if data.get("email"):
            user_updates["email"] = data["email"]
        if data.get("password"):
            user_updates["password_hash"] = bcrypt.hashpw(data["password"].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        if user_updates:
            db.users.update_one({"_id": ObjectId(user_id)}, {"$set": user_updates})
            
        # 2. Update Customer Limits
        customer_updates = {
            "device_limit": int(data.get("device_limit", 10))
        }
        db.customers.update_one({"_id": ObjectId(customer_id)}, {"$set": customer_updates})
        
        # 3. Update Application (first one)
        app_name = data.get("app_name")
        if app_name:
            db.applications.update_one(
                {"customer_id": ObjectId(customer_id)},
                {"$set": {"name": app_name, "manual_id": data.get("app_id")}}
            )
            
        # 4. Update Device (first one)
        device_name = data.get("device_name")
        if device_name:
            device_updates = {
                "name": device_name,
                "device_id_string": data.get("device_id"),
                "version": data.get("version")
            }
            db.devices.update_one(
                {"customer_id": ObjectId(customer_id)},
                {"$set": device_updates}
            )
            
        return jsonify({"success": True, "message": "User profile and configurations updated successfully"})
        
    except Exception as e:
        print(f"Update error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# --- Management APIs ---

@app.route("/api/customers", methods=["GET", "POST"])
def manage_customers():
    if request.method == "POST":
        data = request.json
        name = data.get("name")
        device_limit = data.get("device_limit", 10)
        app_limit = data.get("app_limit", 5)
        
        new_customer = {
            "name": name,
            "device_limit": int(device_limit),
            "app_limit": int(app_limit),
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }
        result = db.customers.insert_one(new_customer)
        print(f"Customer created with ID: {result.inserted_id}")
        return jsonify({"success": True, "_id": str(result.inserted_id)})

    # NEW: PUT /api/customers/<id> handled in a separate route for clarity or here
    
    customers = list(db.customers.find())
    for c in customers:
        c["_id"] = str(c["_id"])
    return jsonify(customers)

@app.route("/api/customers/<customer_id>", methods=["GET", "PUT", "DELETE"])
def handle_customer(customer_id):
    if request.method == "GET":
        customer = db.customers.find_one({"_id": ObjectId(customer_id)})
        if not customer:
            return jsonify({"error": "Customer not found"}), 404
        customer["_id"] = str(customer["_id"])
        return jsonify(customer)
        
    if request.method == "PUT":
        data = request.json
        update_fields = {}
        if "name" in data: update_fields["name"] = data["name"]
        if "device_limit" in data: update_fields["device_limit"] = int(data["device_limit"])
        if "app_limit" in data: update_fields["app_limit"] = int(data["app_limit"])
        
        db.customers.update_one({"_id": ObjectId(customer_id)}, {"$set": update_fields})
        return jsonify({"success": True})
    
    if request.method == "DELETE":
        db.customers.delete_one({"_id": ObjectId(customer_id)})
        return jsonify({"success": True})

@app.route("/api/customers/<customer_id>/stats", methods=["GET"])
def get_customer_stats(customer_id):
    oid = ObjectId(customer_id)
    customer = db.customers.find_one({"_id": oid})
    if not customer:
        return jsonify({"error": "Customer not found"}), 404
    app_count = db.applications.count_documents({"customer_id": oid})
    device_count = db.devices.count_documents({"customer_id": oid})
    return jsonify({
        "app_count": app_count,
        "device_count": device_count,
        "device_limit": customer.get("device_limit", 10),
        "plant_certs": customer.get("plant_certs", [])
    })

@app.route("/api/applications", methods=["GET", "POST"])
def manage_applications():
    if request.method == "POST":
        data = request.json
        customer_id = ObjectId(data.get("customer_id"))
        if is_primary_admin_customer(customer_id):
            return jsonify({"error": "Application creation is disabled for the system admin account"}), 403
        manual_id = (data.get("manual_id") or "").strip()
        if manual_id and is_duplicate_manual_id(customer_id, manual_id):
            return jsonify({"error": f"Application ID '{manual_id}' already exists for this user"}), 400
            
        new_app = {
            "name": data.get("name"),
            "description": data.get("description"),
            "manual_id": manual_id,
            "plant_name": data.get("plant_name"),
            "customer_id": customer_id,
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }
        result = db.applications.insert_one(new_app)
        return jsonify({"success": True, "_id": str(result.inserted_id)})
    
    customer_id = request.args.get("customer_id")
    query = {"customer_id": ObjectId(customer_id)} if customer_id else {}
    apps = list(db.applications.find(query))
    for a in apps:
        a["_id"] = str(a["_id"])
        a["customer_id"] = str(a["customer_id"])
        
        # Embed related devices
        app_devices = list(db.devices.find({"application_id": ObjectId(a["_id"])}))
        for d in app_devices:
            d["_id"] = str(d["_id"])
            d["application_id"] = str(d["application_id"])
            if "customer_id" in d: d["customer_id"] = str(d["customer_id"])
            
        a["devices"] = app_devices
        a["device_count"] = len(app_devices)
        
    return jsonify(apps)

@app.route("/api/applications/<app_id>", methods=["PUT", "DELETE"])
def update_application(app_id):
    if request.method == "PUT":
        data = request.json
        existing_app = db.applications.find_one({"_id": ObjectId(app_id)})
        if not existing_app:
            return jsonify({"error": "Application not found"}), 404
        if is_primary_admin_customer(existing_app["customer_id"]):
            return jsonify({"error": "Application updates are disabled for the system admin account"}), 403

        manual_id = (data.get("manual_id") or "").strip() if "manual_id" in data else None
        if manual_id is not None and manual_id and is_duplicate_manual_id(existing_app["customer_id"], manual_id, excluding_app_id=app_id):
            return jsonify({"error": f"Application ID '{manual_id}' already exists for this user"}), 400

        update_fields = {}
        if "name" in data: update_fields["name"] = data["name"]
        if "description" in data: update_fields["description"] = data["description"]
        if "manual_id" in data: update_fields["manual_id"] = manual_id
        if "plant_name" in data: update_fields["plant_name"] = data["plant_name"]
        
        db.applications.update_one({"_id": ObjectId(app_id)}, {"$set": update_fields})
        return jsonify({"success": True})
    
    if request.method == "DELETE":
        existing_app = db.applications.find_one({"_id": ObjectId(app_id)}, {"customer_id": 1})
        if existing_app and is_primary_admin_customer(existing_app["customer_id"]):
            return jsonify({"error": "Application deletion is disabled for the system admin account"}), 403
        db.applications.delete_one({"_id": ObjectId(app_id)})
        deleted_devices = db.devices.delete_many({"application_id": ObjectId(app_id)})
        return jsonify({"success": True, "devices_deleted": deleted_devices.deleted_count})

@app.route("/api/devices", methods=["GET", "POST"])
def manage_devices():
    if request.method == "POST":
        data = request.json
        app_id_str = data.get("application_id")
        app_oid = ObjectId(app_id_str) if app_id_str else None
        customer_id_str = data.get("customer_id")
        
        if customer_id_str:
            customer_id = ObjectId(customer_id_str)
            if is_primary_admin_customer(customer_id):
                return jsonify({"error": "Device creation is disabled for the system admin account"}), 403
            device_count = db.devices.count_documents({"customer_id": customer_id})
            customer = db.customers.find_one({"_id": customer_id})
            if customer and device_count >= customer.get("device_limit", 10):
                return jsonify({"error": f"Device limit ({customer['device_limit']}) reached for this customer"}), 403
        else:
            return jsonify({"error": "customer_id is required"}), 400
        
        new_device = {
            "name": data.get("name"),
            "device_id_string": data.get("device_id_string"),
            "endpoint_id": data.get("endpoint_id"),
            "customer_id": customer_id,
            "application_id": app_oid,
            "status": data.get("status", "OFFLINE"),
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }
        db.devices.insert_one(new_device)
        return jsonify({"success": True})

    app_id = request.args.get("application_id")
    cust_id = request.args.get("customer_id")
    
    query = {}
    if app_id: query["application_id"] = ObjectId(app_id)
    if cust_id: query["customer_id"] = ObjectId(cust_id)
    
    devices = list(db.devices.find(query))
    for d in devices:
        d["_id"] = str(d["_id"])
        if "application_id" in d and d["application_id"] is not None:
            d["application_id"] = str(d["application_id"])
        else:
            d["application_id"] = None
        if "customer_id" in d: d["customer_id"] = str(d["customer_id"])
    return jsonify(devices)

@app.route("/api/devices/<device_id>", methods=["PUT", "DELETE"])
def update_device(device_id):
    if request.method == "PUT":
        data = request.json
        update_fields = {}
        if "name" in data: update_fields["name"] = data["name"]
        if "status" in data: update_fields["status"] = data["status"]
        if "device_id_string" in data: update_fields["device_id_string"] = data["device_id_string"]
        if "version" in data: update_fields["version"] = data["version"]
        
        db.devices.update_one({"_id": ObjectId(device_id)}, {"$set": update_fields})
        return jsonify({"success": True})
    
    if request.method == "DELETE":
        db.devices.delete_one({"_id": ObjectId(device_id)})
        return jsonify({"success": True})

# --- Certificate Generation with Limit Checks ---

@app.route("/api/generate-certificate", methods=["POST"])
def generate_certificate():
    data = request.json
    print(f"[generate-certificate] Received payload keys: {list(data.keys()) if data else 'None'}")

    qr_data = data.get("qrData")
    user_context = data.get("userContext") or {}

    print(f"[generate-certificate] userContext: {user_context}")
    print(f"[generate-certificate] qrData present: {bool(qr_data)}, length: {len(qr_data) if qr_data else 0}")

    # customer_id is optional — skip DB checks if not present
    customer_id_str = user_context.get("customer_id")
    has_customer = bool(customer_id_str) and customer_id_str not in ('undefined', 'null', 'None')
    customer_id = ObjectId(customer_id_str) if has_customer else None

    if not qr_data:
        return jsonify({"error": "QR data is required"}), 400

    try:
        # Check limits only when customer context is available
        if has_customer and customer_id:
            customer = db.customers.find_one({"_id": customer_id})
            if customer:
                device_count = db.devices.count_documents({"customer_id": customer_id})
                if device_count >= customer.get("device_limit", 10):
                    return jsonify({"error": f"Device limit ({customer['device_limit']}) reached. Cannot provision more devices."}), 403
                    
                app_count = db.applications.count_documents({"customer_id": customer_id})
                if app_count >= customer.get("app_limit", 5):
                    return jsonify({"error": f"Application limit ({customer['app_limit']}) reached. Cannot provision more devices without available application slots."}), 403

        decrypted_string = decrypt(qr_data)
        print(f"[generate-certificate] Decrypted QR string (first 200 chars): {decrypted_string[:200]}")
        
        # Prioritize plant_name from request body (explicit selection)
        plant_name = data.get("plant_name") or extract_value(decrypted_string, "Plant Name")
        
        # Optional application_id selection
        app_id_str = data.get("application_id")
        app_oid = ObjectId(app_id_str) if app_id_str else None
        
        device_name = extract_value(decrypted_string, "Device Name")
        device_id_str = extract_value(decrypted_string, "Device ID")
        device_token = extract_value(decrypted_string, "Device token")
        app_version = extract_value(decrypted_string, "Application Version")
        
        print(f"[generate-certificate] Extracted -> name={device_name}, id={device_id_str}, token={device_token}, version={app_version}, plant={plant_name}")

        if not all([device_name, device_id_str, device_token, app_version]):
            missing = [k for k, v in {"Device Name": device_name, "Device ID": device_id_str, "Device token": device_token, "Application Version": app_version}.items() if not v]
            return jsonify({
                "error": f"Could not extract device details from QR. Missing fields: {', '.join(missing)}. Decrypted content (preview): {decrypted_string[:150]}"
            }), 400

        details = {
            "device_name": device_name,
            "device_id": device_id_str,
            "endpoint_id": device_token,
            "app_version": app_version,
            "mqtt_broker": "192.168.0.23", # Default
            "mqtt_port": 8883               # Default
        }

        # Preparation
        temp_dir = tempfile.mkdtemp()
        
        # Plant-specific CA lookup
        active_ca_crt = CA_CRT
        active_ca_key = CA_KEY
        
        if plant_name and customer_id:
            customer = db.customers.find_one({"_id": customer_id})
            if customer:
                plant_certs = customer.get("plant_certs", [])
                for pc in plant_certs:
                    if pc.get("plant_name") == plant_name:
                        cert_contents = pc.get("cert_contents", {})
                        if cert_contents.get("crt") and cert_contents.get("key"):
                            temp_ca_crt = os.path.join(temp_dir, "ca_from_db.crt")
                            temp_ca_key = os.path.join(temp_dir, "ca_from_db.key")
                            with open(temp_ca_crt, "wb") as f:
                                f.write(base64.b64decode(cert_contents["crt"]))
                            with open(temp_ca_key, "wb") as f:
                                f.write(base64.b64decode(cert_contents["key"]))
                            active_ca_crt = temp_ca_crt
                            active_ca_key = temp_ca_key
                            print(f"[generate-certificate] Using DB-stored certs for plant {plant_name}")
                        elif pc.get("cert_paths", {}).get("crt"):
                            active_ca_crt = pc["cert_paths"]["crt"]
                            active_ca_key = pc["cert_paths"]["key"]
                            print(f"[generate-certificate] Falling back to file-path certs for plant {plant_name}")
                        
                        # Use stored MQTT details if available
                        if pc.get("mqtt_broker"):
                            details["mqtt_broker"] = pc["mqtt_broker"]
                        if pc.get("mqtt_port"):
                            details["mqtt_port"] = pc["mqtt_port"]
                        
                        break

        try:
            device_dir = os.path.join(temp_dir, device_name)
            os.makedirs(device_dir, exist_ok=True)
            
            client_key = os.path.join(device_dir, "client.key")
            client_csr = os.path.join(device_dir, "client.csr")
            client_crt = os.path.join(device_dir, "client.crt")
            ext_config_path = os.path.join(device_dir, "client_ext.cnf")
            json_path = os.path.join(device_dir, "device_details.json")

            run_cmd(f"openssl genrsa -out {client_key} 2048")
            run_cmd(
                f'openssl req -new -key {client_key} -out {client_csr} '
                f'-subj "/C=IN/ST=Kerala/L=Trivandrum/O=MyOrg/OU=IoT/CN={device_name}"'
            )

            ext_config_content = f"""
            authorityKeyIdentifier=keyid,issuer
            basicConstraints=CA:FALSE
            keyUsage = digitalSignature, keyEncipherment
            extendedKeyUsage = clientAuth
            subjectAltName = @alt_names
            [alt_names]
            DNS.1 = {device_name}
            """
            with open(ext_config_path, "w") as f:
                f.write(textwrap.dedent(ext_config_content))

            run_cmd(
                f"openssl x509 -req -in {client_csr} -CA {active_ca_crt} -CAkey {active_ca_key} "
                f"-CAcreateserial -out {client_crt} -days 365 -sha256 "
                f"-extfile {ext_config_path}"
            )

            with open(json_path, "w") as jf:
                json.dump(details, jf, indent=4)

            zip_filename = f"{device_name}_package.zip"
            zip_path = os.path.join(temp_dir, zip_filename)
            with zipfile.ZipFile(zip_path, 'w') as zipf:
                zipf.write(client_key, arcname="client.key")
                zipf.write(client_crt, arcname="client.crt")
                zipf.write(active_ca_crt, arcname="ca.crt")
                zipf.write(json_path, arcname="device_details.json")

            with open(zip_path, "rb") as zf:
                zip_binary = zf.read()
                zip_base64 = base64.b64encode(zip_binary).decode('utf-8')

            # --- RECORD or UPDATE in DB (only when customer context available) ---
            if has_customer and customer_id:
                existing_device = db.devices.find_one({"device_id_string": device_id_str, "customer_id": customer_id})
                if existing_device:
                    db.devices.update_one(
                        {"_id": existing_device["_id"]},
                        {"$set": {
                            "name": device_name,
                            "endpoint_id": device_token,
                            "application_id": app_oid,
                            "plant_name": plant_name,
                            "status": "PROVISIONED",
                            "app_version": app_version,
                            "updated_at": datetime.datetime.now(datetime.timezone.utc)
                        }}
                    )
                else:
                    new_device = {
                        "name": device_name,
                        "device_id_string": device_id_str,
                        "endpoint_id": device_token,
                        "customer_id": customer_id,
                        "application_id": app_oid,
                        "plant_name": plant_name,
                        "app_version": app_version,
                        "status": "PROVISIONED",
                        "created_at": datetime.datetime.now(datetime.timezone.utc)
                    }
                    db.devices.insert_one(new_device)

                # Record log
                log = {
                    "device_id_string": device_id_str,
                    "device_name": device_name,
                    "filename": zip_filename,
                    "customer_id": customer_id,
                    "plant_name": plant_name,
                    "application_id": app_oid,
                    "endpoint_id": device_token,
                    "app_version": app_version,
                    "zip_data": zip_base64,
                    "generated_by": user_context.get("email"),
                    "created_at": datetime.datetime.now(datetime.timezone.utc)
                }
                db.certificates.insert_one(log)
            else:
                print(f"[generate-certificate] Skipping DB record — no customer context")

            return jsonify({
                "success": True,
                "details": details,
                "zip_data": zip_base64,
                "filename": zip_filename
            })
        finally:
            shutil.rmtree(temp_dir)

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/generate-certificate-manual", methods=["POST"])
def generate_certificate_manual():
    data = request.json
    print(f"[generate-certificate-manual] Received payload: {data}")

    customer_id_str = data.get("customer_id")
    plant_name = data.get("plant_name")
    application_id_str = data.get("application_id")
    
    device_name = data.get("device_name")
    device_id_str = data.get("device_id_string")
    device_token = data.get("endpoint_id")
    app_version = data.get("app_version", "1.0")
    
    if not all([customer_id_str, plant_name, application_id_str, device_name, device_id_str]):
        return jsonify({"error": "Missing required fields."}), 400

    try:
        customer_id = ObjectId(customer_id_str)
        app_oid = ObjectId(application_id_str)
        
        customer = db.customers.find_one({"_id": customer_id})
        if not customer:
            return jsonify({"error": "Customer not found."}), 404
            
        application = db.applications.find_one({"_id": app_oid})
        if not application:
            return jsonify({"error": "Application not found."}), 404
            
        device_count = db.devices.count_documents({"customer_id": customer_id})
        if device_count >= customer.get("device_limit", 10):
            return jsonify({"error": f"Device limit ({customer['device_limit']}) reached. Cannot provision more devices."}), 403
            
        # Find matching plant CA
        plant_certs = customer.get("plant_certs", [])
        active_pc = None
        for pc in plant_certs:
            if pc.get("plant_name") == plant_name:
                active_pc = pc
                break
                
        if not active_pc:
            return jsonify({"error": f"Configuration for plant '{plant_name}' not found."}), 400

        # Preparation
        temp_dir = tempfile.mkdtemp()
        
        plant_ca_crt = active_pc.get("cert_paths", {}).get("crt")
        plant_ca_key = active_pc.get("cert_paths", {}).get("key")
        
        # If we have content in DB, prioritize it by writing to temp files
        cert_contents = active_pc.get("cert_contents", {})
        if cert_contents.get("crt") and cert_contents.get("key"):
            temp_ca_crt = os.path.join(temp_dir, "ca_from_db.crt")
            temp_ca_key = os.path.join(temp_dir, "ca_from_db.key")
            
            with open(temp_ca_crt, "wb") as f:
                f.write(base64.b64decode(cert_contents["crt"]))
            with open(temp_ca_key, "wb") as f:
                f.write(base64.b64decode(cert_contents["key"]))
                
            plant_ca_crt = temp_ca_crt
            plant_ca_key = temp_ca_key
            print(f"[generate-certificate-manual] Using CA certs from Database content for plant {plant_name}")

        if not plant_ca_crt or not plant_ca_key or not os.path.exists(plant_ca_crt):
            return jsonify({"error": f"CA certificates for plant '{plant_name}' not found or inaccessible."}), 400

        details = {
            "device_name": device_name,
            "device_id": device_id_str,
            "endpoint_id": device_token,
            "app_version": app_version,
            "application_name": application.get("name"),
            "application_id": str(application.get("_id")),
            "plant_name": plant_name,
            "mqtt_broker": active_pc.get("mqtt_broker", "192.168.0.23"),
            "mqtt_port": active_pc.get("mqtt_port", 8883)
        }
        try:
            device_dir = os.path.join(temp_dir, device_name)
            os.makedirs(device_dir, exist_ok=True)
            
            client_key = os.path.join(device_dir, "client.key")
            client_csr = os.path.join(device_dir, "client.csr")
            client_crt = os.path.join(device_dir, "client.crt")
            ext_config_path = os.path.join(device_dir, "client_ext.cnf")
            json_path = os.path.join(device_dir, "device_details.json")

            run_cmd(f"openssl genrsa -out {client_key} 2048")
            run_cmd(
                f'openssl req -new -key {client_key} -out {client_csr} '
                f'-subj "/C=IN/ST=Kerala/L=Trivandrum/O=MyOrg/OU=IoT/CN={device_name}"'
            )

            ext_config_content = f"""
            authorityKeyIdentifier=keyid,issuer
            basicConstraints=CA:FALSE
            keyUsage = digitalSignature, keyEncipherment
            extendedKeyUsage = clientAuth
            subjectAltName = @alt_names
            [alt_names]
            DNS.1 = {device_name}
            """
            with open(ext_config_path, "w") as f:
                f.write(textwrap.dedent(ext_config_content))

            run_cmd(
                f"openssl x509 -req -in {client_csr} -CA {plant_ca_crt} -CAkey {plant_ca_key} "
                f"-CAcreateserial -out {client_crt} -days 365 -sha256 "
                f"-extfile {ext_config_path}"
            )

            with open(json_path, "w") as jf:
                json.dump(details, jf, indent=4)

            zip_filename = f"{device_name}_package.zip"
            zip_path = os.path.join(temp_dir, zip_filename)
            with zipfile.ZipFile(zip_path, 'w') as zipf:
                zipf.write(client_key, arcname="client.key")
                zipf.write(client_crt, arcname="client.crt")
                zipf.write(plant_ca_crt, arcname="ca.crt")
                zipf.write(json_path, arcname="device_details.json")

            with open(zip_path, "rb") as zf:
                zip_binary = zf.read()
                zip_base64 = base64.b64encode(zip_binary).decode('utf-8')

            # Record log & save zip
            log = {
                "device_id_string": device_id_str,
                "device_name": device_name,
                "filename": zip_filename,
                "customer_id": customer_id,
                "plant_name": plant_name,
                "application_id": app_oid,
                "zip_data": zip_base64,
                "created_at": datetime.datetime.now(datetime.timezone.utc)
            }
            db.certificates.insert_one(log)

            # Update or create the actual device
            existing_device = db.devices.find_one({"device_id_string": device_id_str, "customer_id": customer_id})
            if existing_device:
                db.devices.update_one(
                    {"_id": existing_device["_id"]},
                    {"$set": {
                        "name": device_name,
                        "endpoint_id": device_token,
                        "application_id": app_oid,
                        "plant_name": plant_name,
                        "status": "PROVISIONED",
                        "app_version": app_version,
                        "updated_at": datetime.datetime.now(datetime.timezone.utc)
                    }}
                )
            else:
                new_device = {
                    "name": device_name,
                    "device_id_string": device_id_str,
                    "endpoint_id": device_token,
                    "customer_id": customer_id,
                    "application_id": app_oid,
                    "plant_name": plant_name,
                    "app_version": app_version,
                    "status": "PROVISIONED",
                    "created_at": datetime.datetime.now(datetime.timezone.utc)
                }
                db.devices.insert_one(new_device)

            return jsonify({
                "success": True,
                "details": details,
                "zip_data": zip_base64,
                "filename": zip_filename
            })
        finally:
            shutil.rmtree(temp_dir)

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/certificates", methods=["GET"])
def get_certificates():
    customer_id = request.args.get("customer_id")
    query = {}
    if customer_id:
        query["customer_id"] = ObjectId(customer_id)
        
    certs = list(db.certificates.find(query, {"zip_data": 0}).sort("created_at", -1))
    for c in certs:
        c["_id"] = str(c["_id"])
        if "customer_id" in c: c["customer_id"] = str(c["customer_id"])
        if "application_id" in c: c["application_id"] = str(c["application_id"])
        # Check if zip_data actually exists in this record (query without zip_data means we need a separate check)
        cert_with_flag = db.certificates.find_one({"_id": ObjectId(c["_id"])}, {"zip_data": 1, "zip_path": 1})
        has_zip = bool(cert_with_flag and cert_with_flag.get("zip_data"))
        # Also check legacy filesystem path
        if not has_zip and cert_with_flag and cert_with_flag.get("zip_path"):
            has_zip = os.path.exists(cert_with_flag["zip_path"])
        c["has_zip_data"] = has_zip
        # Return ISO string for created_at
        if c.get("created_at"):
            c["created_at_iso"] = c["created_at"].isoformat() + "Z"
    return jsonify(certs)

@app.route("/api/admin/certificates/<cert_id>/download", methods=["GET"])
def download_certificate(cert_id):
    try:
        cert = db.certificates.find_one({"_id": ObjectId(cert_id)})
        if not cert:
            return jsonify({"error": "Certificate not found"}), 404
            
        zip_data = cert.get("zip_data")
        
        # Legacy support for certs stored on disk
        if not zip_data and "zip_path" in cert:
            zip_path = cert["zip_path"]
            if os.path.exists(zip_path):
                with open(zip_path, "rb") as zf:
                    zip_data = base64.b64encode(zf.read()).decode('utf-8')
        
        if not zip_data:
            return jsonify({"error": "Certificate file data is missing or corrupted"}), 404
            
        return jsonify({
            "success": True, 
            "zip_data": zip_data, 
            "filename": cert.get("filename", "certificate_package.zip")
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    enforce_user_role_policy()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
