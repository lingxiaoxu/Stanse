# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Build argument for API key
ARG GEMINI_API_KEY

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Create .env file with API key for build
RUN echo "GEMINI_API_KEY=${GEMINI_API_KEY}" > .env

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
