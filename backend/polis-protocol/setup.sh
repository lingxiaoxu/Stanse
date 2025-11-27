#!/bin/bash
# Polis Protocol Setup and Testing Script
# Run this after installing Rust: https://rustup.rs/

set -e

echo "=========================================="
echo "🦀 Polis Protocol Setup"
echo "=========================================="
echo ""

# Check Rust installation
if ! command -v cargo &> /dev/null; then
    echo "❌ Cargo not found. Please install Rust first:"
    echo "   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

echo "✅ Rust found: $(rustc --version)"
echo "✅ Cargo found: $(cargo --version)"
echo ""

# Build the project
echo "📦 Building Polis Protocol..."
cargo build
echo "✅ Build successful!"
echo ""

# Run tests
echo "🧪 Running tests..."
cargo test
echo "✅ All tests passed!"
echo ""

# Build release version
echo "🚀 Building optimized release version..."
cargo build --release
echo "✅ Release build complete!"
echo ""

echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo ""
echo "To start the server:"
echo "  Development: RUST_LOG=info cargo run"
echo "  Production:  cargo run --release"
echo ""
echo "Server will run at: http://localhost:8080"
echo "API base URL: http://localhost:8080/api/v1"
echo ""
echo "Test the API:"
echo "  curl http://localhost:8080/api/v1/health"
echo ""
