FROM node:20-slim

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build || true 

# If you don't have a build script yet, we'll just use ts-node-esm for now
# but ideally you should compile to JS for production.
# CMD ["node", "dist/index.js"]

# Dev mode (default for now since we are still building)
CMD ["npm", "run", "dev"]
