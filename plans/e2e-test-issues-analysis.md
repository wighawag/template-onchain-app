# E2E Test Issues Analysis

This document captures the issues encountered while debugging GitHub Actions CI failures for E2E tests, for future reference and resolution.

## Original Issue

The GitHub Actions CI was failing during the "Install dependencies" step with the following error:

```
TypeError: this[#dependenciesMap].values(...).flatMap is not a function
    at DependencyGraphImplementation.getAllRemappings (hardhat/src/internal/builtin-plugins/solidity/build-system/dependency-graph.ts:210:8)
```

### Root Cause

**Hardhat 3.2.0 requires Node.js 22.10.0+** because it uses ES2024's `Iterator.prototype.flatMap` method. The CI was running Node.js 20.20.1.

### Fix Applied

Updated `.github/workflows/test.yml` to use Node.js 24:
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: "24"
```

---

## E2E Test Isolation Issues

After fixing the Node.js version, E2E tests encountered test isolation problems due to wallet auto-connection behavior.

### Problem: Wallet Auto-Connect

The application uses `@etherplay/connect` library with `autoConnect: true` (see `web/src/lib/core/connection/remote.ts:41`). This means:

1. If a user previously connected a wallet, the library stores the connection state in localStorage
2. On subsequent page loads, it automatically reconnects to the stored wallet
3. Tests running in sequence share browser state, causing unpredictable behavior

Additionally, `initBurnerWallet()` in `web/src/lib/context/index.ts:62-71` pre-configures impersonation for specific addresses:
```typescript
impersonateAddresses: [
    '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // Vitalik's address
    '0xF78cD306b23031dE9E739A5BcDE61764e82AD5eF',
],
```

### Test Behavior Inconsistencies

Tests expecting the wallet connection modal (with "Dev Mode" button) sometimes see:
1. **Insufficient Funds modal** - wallet auto-connected but has 0 ETH
2. **No modal at all** - wallet connected and funded from previous test

### Attempted Solutions

#### 1. Playwright `storageState` Configuration

Added to `web/playwright.config.ts`:
```typescript
use: {
    storageState: {cookies: [], origins: []},
}
```

**Result**: Partially effective. Forces empty localStorage but doesn't prevent the burner wallet from initializing with impersonated addresses.

#### 2. Clear Browser Storage via Init Script

```typescript
page: async ({browser}, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
    await use(page);
    await context.close();
},
```

**Result**: `addInitScript` runs on `about:blank` first, not on the target domain. The storage is cleared for the wrong origin.

#### 3. Fund Wallets via Hardhat RPC

Added `fundAddressViaHardhat()` function to use Hardhat's `hardhat_setBalance` RPC:
```typescript
async function fundAddressViaHardhat(address: string, amountInEth = '100'): Promise<void> {
    const weiAmount = BigInt(parseFloat(amountInEth) * 1e18);
    const hexAmount = '0x' + weiAmount.toString(16);
    
    await fetch(HARDHAT_RPC_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'hardhat_setBalance',
            params: [address, hexAmount],
            id: 1,
        }),
    });
}
```

**Result**: Works for funding. But doesn't solve the auto-connect behavior issue.

---

## Key Issues Requiring Resolution

### Issue 1: Inconsistent Wallet State

**Current behavior**: With `storageState: {cookies: [], origins: []}`, tests start with empty localStorage. This means:
- The wallet does NOT auto-connect
- Tests expecting the "Dev Mode" button in the connection modal should pass
- Tests expecting an already-connected state need to manually connect first

**Problem**: The `initBurnerWallet()` function may still register wallet providers that auto-connect independently of localStorage state.

**Investigation needed**: Verify whether `@etherplay/connect` with `autoConnect: true` only reads from localStorage OR also checks for available injected providers (like the burner wallet).

### Issue 2: Faucet Dependency

Tests that trigger transactions need ETH. The app uses a faucet configured via:
- `PUBLIC_FAUCET_LINK` (popup-based)
- `PUBLIC_FAUCET_API` (direct API call)

In `.env.localhost`:
```
PUBLIC_FAUCET_LINK="http://localhost:34010"
```

**Problem**: No faucet server is running during E2E tests. The "Get ETH" button opens a popup to a non-existent server.

**Solutions considered**:
1. Run a mock faucet server during tests
2. Use `hardhat_setBalance` RPC directly from tests (implemented)
3. Configure `PUBLIC_FAUCET_API` for direct API calls without popup

### Issue 3: Test Order Dependencies

When tests run in parallel (`fullyParallel: true` in playwright.config.ts):
- Each test gets its own browser context
- With proper `storageState`, each starts fresh
- The Hardhat node state is shared (transactions from one test affect others)

**Problem**: Tests may see messages from previous test runs in the messages list.

**Possible solutions**:
1. Snapshot/restore Hardhat state between tests
2. Use unique identifiers for test data and filter by them
3. Run tests serially for E2E (current `workers: 1` on CI)

---

## Recommended Next Steps

1. **Investigate auto-connect behavior**: Determine exactly when `@etherplay/connect` auto-connects and how to prevent it for test isolation

2. **Mock or disable burner wallet in tests**: Consider an environment variable to disable auto-impersonation during tests

3. **Set up proper test faucet**: Either:
   - Start a simple faucet server in the E2E test setup script
   - Or pre-fund wallets via `hardhat_setBalance` in a beforeAll hook

4. **Consider test fixtures that explicitly connect**: Instead of relying on auto-connect, have fixtures that explicitly trigger the connection flow and verify each step

---

## Files Modified

- `.github/workflows/test.yml` - Node.js 24
- `web/playwright.config.ts` - storageState configuration
- `web/e2e/fixtures/test.ts` - fundWallets fixture with hardhat_setBalance

## Related Files

- `web/src/lib/core/connection/remote.ts` - autoConnect: true
- `web/src/lib/context/index.ts` - initBurnerWallet() configuration
- `web/.env.localhost` - PUBLIC_FAUCET_LINK configuration
- `web/src/lib/core/ui/faucet/FaucetButton.svelte` - Faucet UI component
