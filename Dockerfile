# Use Node.js LTS as base image
FROM node:20-slim

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code and config files
COPY tsconfig.json ./
COPY src/ ./src/

# Build the TypeScript code
RUN pnpm build

# Copy .env file at runtime (if exists)
COPY .env.example .env

# Set the command to run the application
CMD ["pnpm", "start"]
