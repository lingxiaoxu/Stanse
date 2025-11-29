# Build stage
FROM rust:1.83-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests (not Cargo.lock - let Cargo generate version 3 compatible lock file)
COPY Cargo.toml ./

# Copy source code
COPY src ./src

# Build for release (Cargo will generate Cargo.lock compatible with version 1.75)
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy the binary from builder
COPY --from=builder /app/target/release/polis-protocol /app/polis-protocol

# Expose port (Cloud Run uses PORT environment variable)
ENV PORT=8080
EXPOSE 8080

# Run the binary
CMD ["/app/polis-protocol"]
