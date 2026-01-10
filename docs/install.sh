#!/bin/bash
set -e

# Bashlet installer script
# Usage: curl -fsSL https://raw.githubusercontent.com/ServiceWeave/bashlet/main/install.sh | bash

REPO="ServiceWeave/bashlet"
INSTALL_DIR="${BASHLET_INSTALL_DIR:-$HOME/.local/bin}"
GITHUB_API="https://api.github.com"

# Firecracker version to install
FIRECRACKER_VERSION="v1.10.1"

# Wasmer version to install
WASMER_VERSION="v5.0.4"

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

# Install Firecracker on Linux
install_firecracker() {
    local platform arch download_url temp_dir

    platform=$(uname -s | tr '[:upper:]' '[:lower:]')

    # Only install on Linux
    if [ "$platform" != "linux" ]; then
        info "Firecracker is only available on Linux. Skipping Firecracker installation."
        return 0
    fi

    # Check if Firecracker is already installed
    if command -v firecracker &> /dev/null; then
        local current_version
        current_version=$(firecracker --version 2>/dev/null | head -n1 | awk '{print $2}')
        info "Firecracker is already installed (version: $current_version)"
        return 0
    fi

    # Check if already installed in our install dir
    if [ -x "$INSTALL_DIR/firecracker" ]; then
        info "Firecracker is already installed at $INSTALL_DIR/firecracker"
        return 0
    fi

    arch=$(uname -m)
    case "$arch" in
        x86_64|amd64)
            arch="x86_64"
            ;;
        aarch64|arm64)
            arch="aarch64"
            ;;
        *)
            warn "Firecracker is not available for architecture: $arch"
            return 0
            ;;
    esac

    info "Installing Firecracker ${FIRECRACKER_VERSION} for ${arch}..."

    download_url="https://github.com/firecracker-microvm/firecracker/releases/download/${FIRECRACKER_VERSION}/firecracker-${FIRECRACKER_VERSION}-${arch}"

    # Create temporary directory
    temp_dir=$(mktemp -d)
    trap 'rm -rf "$temp_dir"' EXIT

    info "Downloading from $download_url..."

    if ! curl -fsSL "$download_url" -o "$temp_dir/firecracker"; then
        warn "Failed to download Firecracker. It will be downloaded automatically at runtime if needed."
        return 0
    fi

    # Make executable
    chmod +x "$temp_dir/firecracker"

    # Move to install directory
    mv "$temp_dir/firecracker" "$INSTALL_DIR/firecracker"

    info "Installed Firecracker to $INSTALL_DIR/firecracker"

    # Check KVM availability
    if [ -e "/dev/kvm" ]; then
        info "KVM is available. Firecracker backend is ready to use."
    else
        warn "KVM is not available (/dev/kvm not found)."
        echo ""
        echo "To use the Firecracker backend, ensure:"
        echo "  1. You're running on a system with hardware virtualization support"
        echo "  2. KVM kernel module is loaded: sudo modprobe kvm"
        echo "  3. You have access to /dev/kvm: sudo usermod -aG kvm \$USER"
        echo ""
    fi
}

# Install Wasmer
install_wasmer() {
    local os arch download_url temp_dir archive_name

    # Check if Wasmer is already installed in our install dir
    if [ -x "$INSTALL_DIR/wasmer" ]; then
        local current_version
        current_version=$("$INSTALL_DIR/wasmer" --version 2>/dev/null | awk '{print $2}')
        info "Wasmer is already installed at $INSTALL_DIR/wasmer (version: $current_version)"
        return 0
    fi

    # Check if Wasmer is already in PATH
    if command -v wasmer &> /dev/null; then
        local current_version
        current_version=$(wasmer --version 2>/dev/null | awk '{print $2}')
        info "Wasmer is already installed (version: $current_version)"
        return 0
    fi

    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)

    # Map OS names
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
            warn "Wasmer installation not supported for OS: $os"
            echo "Install manually: curl https://get.wasmer.io -sSfL | sh"
            return 0
            ;;
    esac

    # Map architecture names
    case "$arch" in
        x86_64|amd64)
            arch="amd64"
            ;;
        aarch64|arm64)
            arch="arm64"
            ;;
        *)
            warn "Wasmer is not available for architecture: $arch"
            return 0
            ;;
    esac

    info "Installing Wasmer ${WASMER_VERSION} for ${os}-${arch}..."

    # Construct download URL
    # Wasmer releases: wasmer-linux-amd64.tar.gz, wasmer-darwin-arm64.tar.gz, etc.
    archive_name="wasmer-${os}-${arch}.tar.gz"
    download_url="https://github.com/wasmerio/wasmer/releases/download/${WASMER_VERSION}/${archive_name}"

    # Create temporary directory
    temp_dir=$(mktemp -d)
    trap 'rm -rf "$temp_dir"' EXIT

    info "Downloading from $download_url..."

    if ! curl -fsSL "$download_url" -o "$temp_dir/$archive_name"; then
        warn "Failed to download Wasmer."
        echo "Install manually: curl https://get.wasmer.io -sSfL | sh"
        return 0
    fi

    # Extract the archive
    info "Extracting Wasmer..."
    if ! tar -xzf "$temp_dir/$archive_name" -C "$temp_dir"; then
        warn "Failed to extract Wasmer archive."
        return 0
    fi

    # The archive contains a 'bin' directory with wasmer binary
    if [ -f "$temp_dir/bin/wasmer" ]; then
        chmod +x "$temp_dir/bin/wasmer"
        mv "$temp_dir/bin/wasmer" "$INSTALL_DIR/wasmer"
        info "Installed Wasmer to $INSTALL_DIR/wasmer"
    elif [ -f "$temp_dir/wasmer" ]; then
        chmod +x "$temp_dir/wasmer"
        mv "$temp_dir/wasmer" "$INSTALL_DIR/wasmer"
        info "Installed Wasmer to $INSTALL_DIR/wasmer"
    else
        warn "Could not find wasmer binary in archive."
        echo "Install manually: curl https://get.wasmer.io -sSfL | sh"
        return 0
    fi

    # Verify installation
    if [ -x "$INSTALL_DIR/wasmer" ]; then
        local installed_version
        installed_version=$("$INSTALL_DIR/wasmer" --version 2>/dev/null | awk '{print $2}')
        info "Wasmer $installed_version installed successfully."
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
    install_wasmer
    install_firecracker
}

main "$@"
