from pymongo import MongoClient
import datetime
import sys

import bcrypt

def seed_database():
    try:
        # Use the local MongoDB instance
        connection_string = "mongodb://admin:password@127.0.0.1:27017/?authSource=admin"
        client = MongoClient(connection_string, serverSelectionTimeoutMS=5000)

        
        # Check connection
        client.admin.command('ping')
        print("Successfully connected to MongoDB.")

        db = client["certificate_generator"]

        # 1. Clear existing data in these collections for a clean seed (optional but good for 'dummy')
        db.customers.delete_many({})
        db.users.delete_many({})

        # 2. Create Customer
        customer = {
            "name": "TrizLabz Admin Org",
            "device_limit": 100,
            "app_limit": 50,
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }
        customer_result = db.customers.insert_one(customer)
        customer_id = customer_result.inserted_id
        print(f"Created customer: TrizLabz Admin Org ({customer_id})")

        # 3. Create Super Admin User 'trizlabz'
        username = "trizlabz"
        password = "trizlabz1234#"
        hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        user = {
            "email": username,
            "password_hash": hashed_pw,
            "role": "SUPER_ADMIN",
            "customer_id": customer_id,
            "customer_name": "TrizLabz Admin Org",
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }
        db.users.insert_one(user)
        print(f"Created super admin user: {username} (password: {password})")

        # 4. Create an additional test user for verification
        test_user_password = "password123"
        test_hashed_pw = bcrypt.hashpw(test_user_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        test_user = {
            "email": "testuser",
            "password_hash": test_hashed_pw,
            "role": "ADMIN",
            "customer_id": customer_id,
            "customer_name": "TrizLabz Admin Org",
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }
        db.users.insert_one(test_user)
        print(f"Created test user: testuser (password: {test_user_password})")

        # 5. Create admin user
        admin_username = "admin"
        admin_password = "admin"
        admin_hashed_pw = bcrypt.hashpw(admin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        admin_user = {
            "email": admin_username,
            "password_hash": admin_hashed_pw,
            "role": "SUPER_ADMIN",
            "customer_id": customer_id,
            "customer_name": "TrizLabz Admin Org",
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }
        db.users.insert_one(admin_user)
        print(f"Created super admin user: {admin_username} (password: {admin_password})")

        print("\nDatabase 'certificate_generator' seeded successfully.")

    except Exception as e:
        print(f"Error seeding database: {e}")
        sys.exit(1)

if __name__ == "__main__":
    seed_database()
