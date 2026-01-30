# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files including lock file for reproducible builds
COPY package.json package-lock.json ./

# Install dependencies using lock file with ci for faster, deterministic builds
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Accept API keys and URLs as build arguments and write to .env
ARG GEMINI_API_KEY
ARG POLYGON_API_KEY
ARG NEXT_PUBLIC_EMBER_API_URL
ARG NEXT_PUBLIC_STANSEAGENT_API_URL
RUN echo "GEMINI_API_KEY=${GEMINI_API_KEY}" > .env && \
    echo "POLYGON_API_KEY=${POLYGON_API_KEY}" >> .env && \
    echo "NEXT_PUBLIC_EMBER_API_URL=${NEXT_PUBLIC_EMBER_API_URL}" >> .env && \
    echo "NEXT_PUBLIC_STANSEAGENT_API_URL=${NEXT_PUBLIC_STANSEAGENT_API_URL}" >> .env

# Build the app
RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 8080 (Cloud Run requirement)
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
