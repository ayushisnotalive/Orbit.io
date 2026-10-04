#!/bin/sh
set -e

# OrbitPing CLI Installer
# Usage: curl -fsSL https://orbitping.example/install.sh | sh

TARGET_DIR="/usr/local/bin"
if [ ! -w "$TARGET_DIR" ]; then
  TARGET_DIR="$HOME/.local/bin"
  mkdir -p "$TARGET_DIR"
fi

DEST="$TARGET_DIR/orbitping"
URL="${ORBITPING_INSTALL_URL:-https://orbitping.example/cli/orbitping.sh}"

echo "==> Installing OrbitPing CLI to $DEST..."
curl -fsSL "$URL" -o "$DEST"
chmod +x "$DEST"

echo "==> OrbitPing CLI successfully installed!"
echo "Run 'orbitping --help' or 'orbitping install <UUID>' to get started."
