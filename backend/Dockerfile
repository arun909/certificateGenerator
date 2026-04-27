# Using Python 3.12 alpine for a small image size
FROM python:3.12-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for cryptography and bcrypt
RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directory for certificates
RUN mkdir -p certs

# Expose port 5000 as requested
EXPOSE 5000

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Run the application
CMD ["python", "app.py"]
