-- Certificate Generator Database Schema
-- Database: cert_gen_db

-- Enums for user roles
CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'ADMIN', 'USER');

-- 1. Customers Table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role user_role DEFAULT 'USER',
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Applications Table
CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Devices Table
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    device_id_string VARCHAR(255) UNIQUE NOT NULL, -- The unique ID from the QR code
    endpoint_id VARCHAR(255),                      -- The Device Token/Token ID
    application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    app_version VARCHAR(50),
    status VARCHAR(50) DEFAULT 'OFFLINE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Certificate Logs Table
CREATE TABLE certificate_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    zip_data_base64 TEXT, -- Storing as base64 for simplicity, or use BYTEA
    generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_customer_id ON users(customer_id);
CREATE INDEX idx_applications_customer_id ON applications(customer_id);
CREATE INDEX idx_devices_application_id ON devices(application_id);
CREATE INDEX idx_devices_customer_id ON devices(customer_id);
CREATE INDEX idx_cert_logs_device_id ON certificate_logs(device_id);
