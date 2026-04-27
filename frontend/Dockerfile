# Multi-stage build for React/Vite/Next.js
# Stage 1: Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Enable caching for node_modules
COPY package*.json ./
RUN npm install

# Build the application
COPY . .
RUN npm run build

# Stage 2: Serve stage
FROM nginx:stable-alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 3000 as requested
EXPOSE 3000

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
