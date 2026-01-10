#!/bin/bash
# Build script for bashlet-agent
#
# This script builds a static Linux binary that can run inside
# the Firecracker microVM.
#
# Prerequisites:
#   - Rust toolchain with musl target
#   - Install with: rustup target add x86_64-unknown-linux-musl
#
# Usage:
#   ./build.sh         # Build release binary
#   ./build.sh debug   # Build debug binary

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TARGET="x86_64-unknown-linux-musl"
PROFILE="${1:-release}"

echo "Building bashlet-agent for $TARGET ($PROFILE)..."

# Check if the target is installed
if ! rustup target list --installed | grep -q "$TARGET"; then
    echo "Installing $TARGET target..."
    rustup target add "$TARGET"
fi

# Build the binary
if [ "$PROFILE" = "debug" ]; then
    cargo build -p bashlet-agent --target "$TARGET"
    BINARY="target/$TARGET/debug/bashlet-agent"
else
    cargo build -p bashlet-agent --target "$TARGET" --profile release-agent
    BINARY="target/$TARGET/release-agent/bashlet-agent"
fi

# Check the binary
if [ -f "$BINARY" ]; then
    SIZE=$(ls -lh "$BINARY" | awk '{print $5}')
    echo ""
    echo "Build successful!"
    echo "Binary: $BINARY"
    echo "Size: $SIZE"
    echo ""
    echo "To install in a rootfs image:"
    echo "  sudo mount rootfs.ext4 /mnt"
    echo "  sudo cp $BINARY /mnt/usr/local/bin/"
    echo "  sudo chmod +x /mnt/usr/local/bin/bashlet-agent"
    echo "  sudo umount /mnt"
else
    echo "Build failed: binary not found"
    exit 1
fi
