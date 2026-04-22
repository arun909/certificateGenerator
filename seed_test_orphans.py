from pymongo import MongoClient
import uuid

client = MongoClient('mongodb://admin:admin123@localhost:27017/')
db = client['cert_dashboard']

customer = db.users.find_one({"username": "arun909"})
if not customer:
    customer = db.users.find_one({})

cid = customer['customer_id']

# Orphan with plant name
db.devices.insert_one({
    "customer_id": cid,
    "plant_name": "California Facility",
    "device_id": str(uuid.uuid4()),
    "device_id_string": "test_orphan_plant_1",
    "name": "Plant Level Orphan"
})

# Global orphan without plant name
db.devices.insert_one({
    "customer_id": cid,
    "device_id": str(uuid.uuid4()),
    "device_id_string": "test_global_orphan_1",
    "name": "Global Orphan"
})

print("Seeded test orphans!")
