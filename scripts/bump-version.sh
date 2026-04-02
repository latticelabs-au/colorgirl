#!/bin/bash
# Version bump script for ColorGirl
# Usage: ./scripts/bump-version.sh [patch|minor|major]
# Default: patch (z in x.y.z)
#
# This script updates version numbers across:
#   - package.json (version)
#   - src/cli/app.tsx (VERSION)
#   - src/cli/args.ts (VERSION)

set -e

BUMP_TYPE="${1:-patch}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Read current version from package.json
CURRENT_VERSION=$(grep '"version"' "$ROOT_DIR/package.json" | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/')
if [ -z "$CURRENT_VERSION" ]; then
    echo "Error: Could not read current version"
    exit 1
fi

# Parse x.y.z
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Bump
case "$BUMP_TYPE" in
    patch)
        PATCH=$((PATCH + 1))
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    *)
        echo "Usage: $0 [patch|minor|major]"
        exit 1
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "Bumping version: $CURRENT_VERSION -> $NEW_VERSION ($BUMP_TYPE)"

# Update package.json
sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$ROOT_DIR/package.json"

# Update src/cli/args.ts (single source of truth for VERSION constant)
sed -i "s/const VERSION = \"$CURRENT_VERSION\"/const VERSION = \"$NEW_VERSION\"/" "$ROOT_DIR/src/cli/args.ts"

echo ""
echo "Version bumped to $NEW_VERSION"
echo "Files updated:"
echo "  - package.json"
echo "  - src/cli/args.ts"
echo ""
echo "$NEW_VERSION"
