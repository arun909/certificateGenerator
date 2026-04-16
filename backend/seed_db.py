from pymongo import MongoClient
import datetime
import sys

def seed_database():
    try:
        # Use the local MongoDB instance
        connection_string = "mongodb://127.0.0.1:27017/"
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
            "name": "Test Customer",
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }
        customer_result = db.customers.insert_one(customer)
        customer_id = customer_result.inserted_id
        print(f"Created customer: Test Customer ({customer_id})")

        # 3. Create Dummy User 'test'
        user = {
            "email": "test",
            "password_hash": "password", # As discussed, a dummy password
            "role": "ADMIN",
            "customer_id": customer_id,
            "customer_name": "Test Customer",
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }
        db.users.insert_one(user)
        print("Created user: test (password: password)")

        print("\nDatabase 'certificate_generator' seeded successfully.")

    except Exception as e:
        print(f"Error seeding database: {e}")
        sys.exit(1)

if __name__ == "__main__":
    seed_database()
