#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track PIDs for cleanup
NODE_PID=""

# Cleanup function to kill background processes
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
    
    # Kill the Hardhat node if we started it
    if [ -n "$NODE_PID" ]; then
        echo "Stopping Hardhat node (PID: $NODE_PID)..."
        kill -9 "$NODE_PID" 2>/dev/null || true
    fi
    
    # Kill any preview server on port 4173
    PREVIEW_PIDS=$(lsof -ti:4173 2>/dev/null || true)
    if [ -n "$PREVIEW_PIDS" ]; then
        echo "Stopping preview server on port 4173 (PIDs: $PREVIEW_PIDS)..."
        echo "$PREVIEW_PIDS" | xargs kill -9 2>/dev/null || true
    fi
    
    # Kill any remaining hardhat node processes on port 8545
    NODE_PIDS=$(lsof -ti:8545 2>/dev/null || true)
    if [ -n "$NODE_PIDS" ]; then
        echo "Stopping Hardhat node on port 8545 (PIDs: $NODE_PIDS)..."
        echo "$NODE_PIDS" | xargs kill -9 2>/dev/null || true
    fi
    
    # Kill any orphaned processes from this script run
    pkill -9 -f "hardhat.*node.*local" 2>/dev/null || true
    pkill -9 -f "vite.*preview" 2>/dev/null || true
    pkill -9 -f "pnpm.*preview" 2>/dev/null || true
    
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

# Initial cleanup - ensure ports are free before starting
echo "Ensuring ports are free..."
lsof -ti:4173 | xargs kill -9 2>/dev/null || true
lsof -ti:8545 | xargs kill -9 2>/dev/null || true
pkill -9 -f "hardhat.*node.*local" 2>/dev/null || true
pkill -9 -f "vite.*preview" 2>/dev/null || true
pkill -9 -f "pnpm.*preview" 2>/dev/null || true
sleep 1

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
TEST_EXIT_CODE=$?

echo -e "\n${GREEN}✅ E2E tests complete!${NC}"

# Return the test exit code
exit $TEST_EXIT_CODE
