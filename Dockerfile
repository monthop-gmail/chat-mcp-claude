FROM node:20-slim

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source
COPY src ./src

# Create data directory
RUN mkdir -p /app/data /app/db

# Default command
CMD ["node", "src/index.js"]
