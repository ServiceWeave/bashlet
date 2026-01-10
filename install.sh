#!/bin/bash
set -e

# Bashlet installer script
# Usage: curl -fsSL https://raw.githubusercontent.com/ServiceWeave/bashlet/main/install.sh | bash

REPO="ServiceWeave/bashlet"
INSTALL_DIR="${BASHLET_INSTALL_DIR:-$HOME/.local/bin}"
GITHUB_API="https://api.github.com"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Detect OS and architecture
detect_platform() {
    local os arch

    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)

    case "$os" in
        linux)
            os="linux"
            ;;
        darwin)
            os="darwin"
            ;;
        mingw*|msys*|cygwin*)
            os="windows"
            ;;
        *)
            error "Unsupported operating system: $os"
            ;;
    esac

    case "$arch" in
        x86_64|amd64)
            arch="x86_64"
            ;;
        aarch64|arm64)
            arch="aarch64"
            ;;
        *)
            error "Unsupported architecture: $arch"
            ;;
    esac

    echo "${os}-${arch}"
}

# Get the latest release version
get_latest_version() {
    local version
    version=$(curl -sL "${GITHUB_API}/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

    if [ -z "$version" ]; then
        error "Failed to get latest version. Check your internet connection."
    fi

    echo "$version"
}

# Download and install bashlet
install_bashlet() {
    local platform version binary_name download_url temp_dir

    platform=$(detect_platform)
    version="${1:-$(get_latest_version)}"

    info "Installing bashlet $version for $platform..."

    # Construct binary name
    case "$platform" in
        windows-*)
            binary_name="bashlet-${platform}.exe"
            ;;
        *)
            binary_name="bashlet-${platform}"
            ;;
    esac

    download_url="https://github.com/${REPO}/releases/download/${version}/${binary_name}"

    # Create install directory if it doesn't exist
    mkdir -p "$INSTALL_DIR"

    # Create temporary directory
    temp_dir=$(mktemp -d)
    trap 'rm -rf "$temp_dir"' EXIT

    info "Downloading from $download_url..."

    if ! curl -fsSL "$download_url" -o "$temp_dir/bashlet"; then
        error "Failed to download bashlet. The release might not exist for your platform."
    fi

    # Make executable
    chmod +x "$temp_dir/bashlet"

    # Move to install directory
    mv "$temp_dir/bashlet" "$INSTALL_DIR/bashlet"

    info "Installed bashlet to $INSTALL_DIR/bashlet"

    # Check if install directory is in PATH
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        warn "$INSTALL_DIR is not in your PATH."
        echo ""
        echo "Add this to your shell profile (.bashrc, .zshrc, etc.):"
        echo ""
        echo "  export PATH=\"\$PATH:$INSTALL_DIR\""
        echo ""
    fi

    # Verify installation
    if command -v bashlet &> /dev/null || [ -x "$INSTALL_DIR/bashlet" ]; then
        info "Installation complete!"
        echo ""
        "$INSTALL_DIR/bashlet" --version
        echo ""
        echo "Get started:"
        echo "  bashlet --help"
        echo "  bashlet exec --mount ./src:/workspace \"ls -la\""
    else
        warn "bashlet was installed but may not be in your PATH yet."
    fi
}

# Show help
show_help() {
    cat << EOF
Bashlet Installer

Usage:
  curl -fsSL https://raw.githubusercontent.com/ServiceWeave/bashlet/main/install.sh | bash

  # Or with a specific version:
  curl -fsSL https://raw.githubusercontent.com/ServiceWeave/bashlet/main/install.sh | bash -s -- v0.1.0

Options:
  -h, --help     Show this help message
  -v, --version  Install a specific version (e.g., v0.1.0)

Environment Variables:
  BASHLET_INSTALL_DIR  Installation directory (default: ~/.local/bin)

EOF
}

# Parse arguments
main() {
    local version=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--version)
                version="$2"
                shift 2
                ;;
            v*)
                version="$1"
                shift
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done

    install_bashlet "$version"
}

main "$@"
