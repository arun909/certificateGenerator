import os
import subprocess
import textwrap
import shutil
import json
import zipfile
import tempfile
from fastapi import FastAPI, HTTPException, Body, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the React app URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- START: Decryption Logic ---
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
    try:
        key_with_colon = f'{key}:'
        start_index = source_string.find(key_with_colon)
        if start_index == -1:
            return None
        substr = source_string[start_index + len(key_with_colon):]
        quote_start = substr.find('"')
        if quote_start == -1:
            return None
        quote_end = substr.find('"', quote_start + 1)
        if quote_end == -1:
            return None
        return substr[quote_start + 1:quote_end].strip()
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

async def cleanup_file(path: str):
    if os.path.exists(path):
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.remove(path)

@app.get("/")
async def root():
    return {"status": "ok", "message": "FastAPI Certificate Server is running"}

@app.get("/api/health")
async def health():
    return {"status": "ok", "ca_files": {
        "crt": os.path.exists(CA_CRT),
        "key": os.path.exists(CA_KEY)
    }}

@app.post("/api/generate-certificate")
async def generate_certificate(background_tasks: BackgroundTasks, payload: dict = Body(...)):
    print(f"Received request: {payload}")
    qr_data = payload.get("qrData")
    if not qr_data:
        raise HTTPException(status_code=400, detail="QR data is required")

    try:
        decrypted_string = decrypt(qr_data)
        device_name = extract_value(decrypted_string, "Device Name")
        device_id = extract_value(decrypted_string, "Device ID")
        device_token = extract_value(decrypted_string, "Device token")
        app_version = extract_value(decrypted_string, "Application Version")

        if not all([device_name, device_id, device_token, app_version]):
            raise HTTPException(status_code=400, detail="Could not extract all device details from QR")

        # Use a temporary directory for generation
        temp_dir = tempfile.mkdtemp()
        device_dir = os.path.join(temp_dir, device_name)
        os.makedirs(device_dir, exist_ok=True)

        # File paths
        client_key = os.path.join(device_dir, "client.key")
        client_csr = os.path.join(device_dir, "client.csr")
        client_crt = os.path.join(device_dir, "client.crt")
        ext_config_path = os.path.join(device_dir, "client_ext.cnf")
        json_path = os.path.join(device_dir, "device_details.json")

        # 1. Generate private key
        run_cmd(f"openssl genrsa -out {client_key} 2048")

        # 2. Generate CSR
        run_cmd(
            f'openssl req -new -key {client_key} -out {client_csr} '
            f'-subj "/C=IN/ST=Kerala/L=Trivandrum/O=MyOrg/OU=IoT/CN={device_name}"'
        )

        # 3. Create extension config
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

        # 4. Sign CSR
        run_cmd(
            f"openssl x509 -req -in {client_csr} -CA {CA_CRT} -CAkey {CA_KEY} "
            f"-CAcreateserial -out {client_crt} -days 365 -sha256 "
            f"-extfile {ext_config_path}"
        )

        # 5. Create JSON details
        info = {
            "device_name": device_name,
            "device_id": device_id,
            "endpoint_id": device_token,
            "app_version": app_version,
            "mqtt_broker": "192.168.0.23",
            "mqtt_port": 8883
        }
        with open(json_path, "w") as jf:
            json.dump(info, jf, indent=4)

        # 6. Create ZIP
        zip_filename = f"{device_name}_package.zip"
        zip_path = os.path.join(temp_dir, zip_filename)
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            zipf.write(client_key, arcname="client.key")
            zipf.write(client_crt, arcname="client.crt")
            zipf.write(CA_CRT, arcname="ca.crt")
            zipf.write(json_path, arcname="device_details.json")

        # Schedule cleanup of the entire temp directory
        background_tasks.add_task(cleanup_file, temp_dir)

        return FileResponse(
            zip_path, 
            media_type="application/zip", 
            filename=zip_filename
        )

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
