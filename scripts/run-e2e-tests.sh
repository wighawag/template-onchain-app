#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track PIDs for cleanup
NODE_PID=""
PREVIEW_PID=""

# Cleanup function to kill background processes
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
    
    # Kill the Hardhat node if we started it
    if [ -n "$NODE_PID" ] && kill -0 "$NODE_PID" 2>/dev/null; then
        echo "Stopping Hardhat node (PID: $NODE_PID)..."
        kill "$NODE_PID" 2>/dev/null || true
        wait "$NODE_PID" 2>/dev/null || true
    fi
    
    # Kill any preview server on port 4173
    if lsof -ti:4173 >/dev/null 2>&1; then
        echo "Stopping preview server on port 4173..."
        lsof -ti:4173 | xargs kill -9 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✓ Cleanup complete${NC}"
}

# Set up trap to ensure cleanup runs on exit (success or failure)
trap cleanup EXIT

echo -e "${GREEN}🚀 Starting E2E test setup...${NC}\n"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
WEB_DIR="$ROOT_DIR/web"

# Check if node is already running
if curl -s -X POST http://localhost:8545 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Hardhat node already running, using existing node${NC}"
else
    echo -e "${GREEN}📦 Starting Hardhat node...${NC}"
    cd "$CONTRACTS_DIR"
    pnpm run node:local &
    NODE_PID=$!
    
    # Wait for node to be ready
    echo "Waiting for Hardhat node to be ready..."
    for i in {1..30}; do
        if curl -s -X POST http://localhost:8545 \
            -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
            >/dev/null 2>&1; then
            echo -e "${GREEN}✓ Hardhat node is ready${NC}"
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}✗ Hardhat node failed to start${NC}"
            exit 1
        fi
        sleep 1
    done
fi

# Compile contracts
echo -e "\n${GREEN}📋 Compiling contracts...${NC}"
cd "$CONTRACTS_DIR"
pnpm compile

# Deploy contracts
echo -e "\n${GREEN}📋 Deploying contracts to localhost...${NC}"
cd "$CONTRACTS_DIR"
pnpm run deploy localhost --skip-prompts

# Export deployments
echo -e "\n${GREEN}📋 Exporting deployments...${NC}"
cd "$CONTRACTS_DIR"
pnpm export localhost --ts ../web/src/lib/deployments.ts
echo -e "${GREEN}✓ Contracts deployed and exported${NC}"

# Build web app
echo -e "\n${GREEN}🔨 Building web app...${NC}"
cd "$WEB_DIR"
pnpm build localhost
echo -e "${GREEN}✓ Web app built${NC}"

# Run Playwright tests
echo -e "\n${GREEN}🧪 Running E2E tests...${NC}"
cd "$WEB_DIR"

# Run playwright without global-setup (we've done everything already)
# The webServer in playwright.config.ts will start the preview server
pnpm exec playwright test

echo -e "\n${GREEN}✅ E2E tests complete!${NC}"
