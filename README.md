# Certificate Generator - Full Stack Application

A production-ready full-stack application for managing and generating certificates, featuring a React frontend, Python (Flask) backend, and MongoDB.

## 🚀 Setup Instructions for a New System

Follow these steps to get the project running on a fresh installation.

### 1. Prerequisites
Ensure the following are installed on your system:
- **Docker & Docker Compose**: To run the application containers.
- **MongoDB**: Installed and running locally on your host machine (listening on default port `27017`).

### 2. Clone the Repository
```bash
git clone <your-repository-url>
cd certficateGenerator
```

### 3. Environment Configuration
Verify that the following `.env` files exist in their respective directories. If they are missing (e.g., if ignored by git), create them based on these templates:

**Backend: `backend/.env`**
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/certificate_generator
ENCRYPTION_KEY=qyeB8BbxKw9-D9DtxOtJ6sRouvgwfQcwFQ1ZBe8NcWg
```

**Frontend: `frontend/.env`**
```env
VITE_API_URL=http://localhost:5000
```

### 4. Running the Application
The project uses Docker Compose to orchestrate both the frontend and backend. 

Run the following command in the root directory:
```bash
docker-compose up --build
```

- **Frontend**: Accessible at [http://localhost:3000](http://localhost:3000)
- **Backend API**: Accessible at [http://localhost:5000](http://localhost:5000)

### 5. Initial Database Seeding (First Time Only)
If you are starting with a fresh MongoDB, you need to seed the database with initial users and data.

While the Docker containers are running, execute the seeding script inside the backend container:
```bash
docker exec -it backend python seed_db.py
```

---

## 🛠 Project Structure
- **/frontend**: React + Vite + TypeScript application served via Nginx.
- **/backend**: Python Flask API with MongoDB integration.
- **docker-compose.yml**: Orchestrates the multi-container setup using host network mode.

## 📦 Troubleshooting
- **Connection Issues**: Ensure MongoDB on your host is configured to allow connections. On Linux, check `sudo systemctl status mongodb`.
- **Port Conflicts**: Ensure ports 3000 and 5000 are not being used by other applications on your system.
