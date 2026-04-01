# Meaningful E2E Tests Plan

## Problem Statement

The current e2e tests contain many brittle assertions that check for specific text content, such as:
- `"Greetings Registry"` heading text
- `"Interact with deployed smart contracts"` description
- `"Build"`, `"Deploy"`, `"Eternity"` tagline words
- `"Loading messages..."` or `"No messages yet"` states

These tests provide minimal value because:
1. They break when copy/text changes (even minor wording updates)
2. They don't verify actual functionality
3. They test implementation details rather than user behavior
4. They don't catch real bugs

## E2E Testing Best Practices

### Focus on User Behavior, Not Implementation

Good e2e tests should verify:
- **User flows complete successfully** - Can users accomplish their goals?
- **Edge cases are handled** - What happens when things go wrong?
- **Critical functionality works** - Do transactions actually execute?
- **Error states are communicated** - Does the user understand what happened?

### Use Data Attributes for Test Selectors

Instead of relying on text content, use `data-testid` attributes:
```svelte
<!-- Instead of checking text "Insufficient Funds" -->
<div data-testid="insufficient-funds-modal">...</div>
```

### Test States, Not Text

Instead of checking if specific error text appears, verify:
- A modal/toast IS visible
- The modal has the correct type (error, success, warning)
- The correct actions are available (retry, dismiss, etc.)

---

## Current Tests to Refactor/Remove

### Tests to Remove (Text-Based Brittle Tests)

| File | Test Name | Reason |
|------|-----------|--------|
| [`home.e2e.ts`](web/e2e/tests/home.e2e.ts:4) | `should display the Jolly Roger branding` | Checks specific heading text |
| [`home.e2e.ts`](web/e2e/tests/home.e2e.ts:13) | `should display the tagline` | Checks Build/Deploy/Eternity text |
| [`home.e2e.ts`](web/e2e/tests/home.e2e.ts:42) | `should have rotating words animation` | Checks Idea/Game/App text |
| [`demo.e2e.ts`](web/e2e/tests/demo.e2e.ts:4) | `should display the page title and description` | Checks specific text |
| [`demo.e2e.ts`](web/e2e/tests/demo.e2e.ts:111) | `should display loading state while fetching messages` | Checks text states |
| [`contracts.e2e.ts`](web/e2e/tests/contracts.e2e.ts:4) | `should display the contracts page title` | Checks title text |

### Tests to Keep/Refactor

| File | Test Name | Keep Because |
|------|-----------|--------------|
| [`demo.e2e.ts`](web/e2e/tests/demo.e2e.ts:85) | `should submit a greeting and see it in the list` | Tests actual functionality |
| [`demo.e2e.ts`](web/e2e/tests/demo.e2e.ts:171) | `should clear input after successful submission` | Tests behavior |
| [`contracts.e2e.ts`](web/e2e/tests/contracts.e2e.ts:161) | `should execute write function after connecting` | Tests actual tx |

---

## New Meaningful Test Scenarios

### 1. Insufficient Funds Modal Tests

**Context**: When a user attempts to execute a transaction without enough ETH to cover gas + value, an [`InsufficientFundsModal`](web/src/lib/core/transaction/InsufficientFundsModal.svelte) should appear.

```typescript
// web/e2e/tests/insufficient-funds.e2e.ts

describe('Insufficient Funds Handling', () => {
  test('should show insufficient funds modal when balance is too low', async ({
    page,
    connectWallet
  }) => {
    // Setup: Create a wallet with zero balance
    // This requires a new fixture that can create wallets with specific balances

    await page.goto('/demo');
    
    // Trigger connection with an empty wallet
    await page.getByPlaceholder('Enter your greeting...').fill('Test');
    await page.getByRole('button', { name: /send/i }).click();
    await connectWallet(page); // Connect with zero-balance wallet
    
    // Assert: Insufficient funds modal appears
    const modal = page.getByTestId('insufficient-funds-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });
    
    // Assert: Modal shows balance vs estimated cost
    await expect(page.getByTestId('current-balance')).toBeVisible();
    await expect(page.getByTestId('estimated-cost')).toBeVisible();
    await expect(page.getByTestId('shortfall-amount')).toBeVisible();
    
    // Assert: Dismiss button is available
    await expect(page.getByRole('button', { name: /dismiss/i })).toBeVisible();
  });

  test('should allow continuing when funds arrive', async ({
    page,
    connectWallet,
    fundWallet
  }) => {
    // Similar setup with zero balance wallet
    
    // Trigger insufficient funds modal
    // ...modal appears...
    
    // Send funds to the wallet externally
    await fundWallet('1.0'); // Add 1 ETH
    
    // Assert: Modal updates to show "Funds Available"
    await expect(page.getByTestId('funds-available-indicator')).toBeVisible();
    
    // Assert: Continue button appears
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeVisible();
    
    // Click continue and verify transaction proceeds
    await continueBtn.click();
    await expect(page.getByTestId('insufficient-funds-modal')).not.toBeVisible();
  });

  test('should show faucet link when available', async ({
    page,
    connectWallet
  }) => {
    // On localhost/testnet, faucet should be available
    
    // Trigger insufficient funds modal
    // Assert: Faucet button is visible
    await expect(page.getByTestId('faucet-button')).toBeVisible();
  });
});
```

**Required Component Changes**:
Add data-testid attributes to [`InsufficientFundsModal.svelte`](web/src/lib/core/transaction/InsufficientFundsModal.svelte):
- `data-testid="insufficient-funds-modal"` on the modal root
- `data-testid="current-balance"` on balance display
- `data-testid="estimated-cost"` on cost display
- `data-testid="shortfall-amount"` on shortfall display
- `data-testid="funds-available-indicator"` when funds sufficient
- `data-testid="faucet-button"` on faucet button

**Required Fixture Changes**:
- Add `createWalletWithBalance(amount: string)` fixture
- Add `fundWallet(amount: string)` fixture using hardhat_setBalance

---

### 2. Transaction Failure Toast Tests

**Context**: When a transaction fails, is dropped, or not found, an error toast should appear via [`toastConnector.ts`](web/src/lib/account/toastConnector.ts).

```typescript
// web/e2e/tests/transaction-errors.e2e.ts

describe('Transaction Error Handling', () => {
  test('should show error toast when transaction reverts', async ({
    connectedPage,
    mockContractRevert
  }) => {
    const page = connectedPage;
    
    // Setup: Make the contract revert
    await mockContractRevert('setMessage'); // e.g., via custom contract or mock
    
    // Attempt transaction
    await page.getByPlaceholder('Enter your greeting...').fill('Test');
    await page.getByRole('button', { name: /send/i }).click();
    
    // Assert: Error toast appears
    const toast = page.locator('[data-sonner-toast][data-type="error"]');
    await expect(toast).toBeVisible({ timeout: 30000 });
    
    // Assert: Toast has Inspect action
    await expect(toast.getByRole('button', { name: /inspect/i })).toBeVisible();
  });

  test('should show error toast when transaction is dropped', async ({
    connectedPage,
    dropTransaction
  }) => {
    const page = connectedPage;
    
    // Submit transaction
    await page.getByPlaceholder('Enter your greeting...').fill('Test');
    await page.getByRole('button', { name: /send/i }).click();
    
    // Simulate transaction being dropped
    await dropTransaction(); // Custom fixture to manipulate tx state
    
    // Assert: Error toast with "dropped" message appears
    const toast = page.locator('[data-sonner-toast][data-type="error"]');
    await expect(toast).toBeVisible({ timeout: 30000 });
  });

  test('should allow dismissing failed transaction', async ({
    connectedPage
  }) => {
    const page = connectedPage;
    
    // Trigger a failed transaction
    // ...
    
    // Wait for error toast
    const toast = page.locator('[data-sonner-toast][data-type="error"]');
    await expect(toast).toBeVisible();
    
    // Click dismiss
    await toast.getByRole('button', { name: /dismiss/i }).click();
    
    // Assert: Toast dismissed, operation cleaned up
    await expect(toast).not.toBeVisible();
  });

  test('should show pending toast while transaction is in mempool', async ({
    connectedPage,
    pauseMining
  }) => {
    const page = connectedPage;
    
    // Pause mining to keep tx pending
    await pauseMining();
    
    // Submit transaction
    await page.getByPlaceholder('Enter your greeting...').fill('Test');
    await page.getByRole('button', { name: /send/i }).click();
    
    // Assert: Loading/pending toast appears
    const toast = page.locator('[data-sonner-toast][data-type="loading"]');
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test('should update toast from pending to success', async ({
    connectedPage,
    waitForTransaction
  }) => {
    const page = connectedPage;
    
    // Submit transaction
    await page.getByPlaceholder('Enter your greeting...').fill('Test');
    await page.getByRole('button', { name: /send/i }).click();
    
    // First: pending toast appears
    const pendingToast = page.locator('[data-sonner-toast][data-type="loading"]');
    await expect(pendingToast).toBeVisible({ timeout: 10000 });
    
    // Wait for transaction
    await waitForTransaction(page);
    
    // Then: success toast appears
    const successToast = page.locator('[data-sonner-toast][data-type="success"]');
    await expect(successToast).toBeVisible({ timeout: 10000 });
  });
});
```

**Required Fixture Changes**:
- Add `pauseMining()` / `resumeMining()` fixtures using `evm_setAutomine`
- Add `mockContractRevert(functionName)` fixture
- Add `dropTransaction()` fixture (more complex - may need to manipulate txpool)

---

### 3. Network Switch Modal Tests

**Context**: When a user's wallet is connected to a different chain than the app expects, a network switch modal should appear via [`ConnectionFlow.svelte`](web/src/lib/core/connection/ConnectionFlow.svelte:244-366).

```typescript
// web/e2e/tests/network-switch.e2e.ts

describe('Network Switch Handling', () => {
  test('should show network switch modal when wallet is on wrong chain', async ({
    page,
    connectWalletOnWrongNetwork
  }) => {
    await page.goto('/demo');
    
    // Connect with a wallet configured for a different chain
    await page.getByPlaceholder('Enter your greeting...').fill('Test');
    await page.getByRole('button', { name: /send/i }).click();
    await connectWalletOnWrongNetwork(page, { chainId: 1 }); // Mainnet instead of localhost
    
    // Assert: Network switch modal appears
    const modal = page.getByTestId('network-switch-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Assert: Shows target network name
    await expect(page.getByTestId('target-network-name')).toBeVisible();
    
    // Assert: Switch Network button is available
    await expect(page.getByRole('button', { name: /switch network/i })).toBeVisible();
    
    // Assert: Cancel button is available
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('should close modal after successful network switch', async ({
    page,
    connectWalletOnWrongNetwork,
    approveNetworkSwitch
  }) => {
    await page.goto('/demo');
    
    // Connect on wrong network
    await connectWalletOnWrongNetwork(page, { chainId: 1 });
    
    // Wait for modal
    await expect(page.getByTestId('network-switch-modal')).toBeVisible();
    
    // Click switch network
    await page.getByRole('button', { name: /switch network/i }).click();
    
    // Approve in wallet (simulated)
    await approveNetworkSwitch();
    
    // Assert: Modal closes
    await expect(page.getByTestId('network-switch-modal')).not.toBeVisible();
    
    // Assert: User can now interact with the app
    await expect(page.getByRole('button', { name: /send/i })).toBeEnabled();
  });

  test('should show switching indicator while waiting for wallet', async ({
    page,
    connectWalletOnWrongNetwork
  }) => {
    await page.goto('/demo');
    await connectWalletOnWrongNetwork(page, { chainId: 1 });
    
    // Click switch but don't approve yet
    await page.getByRole('button', { name: /switch network/i }).click();
    
    // Assert: Button shows switching state
    await expect(page.getByRole('button', { name: /switching/i })).toBeVisible();
    
    // Assert: Cancel button is disabled during switch
    await expect(page.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  test('should allow canceling network switch', async ({
    page,
    connectWalletOnWrongNetwork
  }) => {
    await page.goto('/demo');
    await connectWalletOnWrongNetwork(page, { chainId: 1 });
    
    // Wait for modal and cancel
    await expect(page.getByTestId('network-switch-modal')).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();
    
    // Assert: Modal closes, but user is disconnected or flow is cancelled
    await expect(page.getByTestId('network-switch-modal')).not.toBeVisible();
  });
});
```

**Required Component Changes**:
Add data-testid attributes to [`ConnectionFlow.svelte`](web/src/lib/core/connection/ConnectionFlow.svelte):
- `data-testid="network-switch-modal"` on the network switch modal
- `data-testid="target-network-name"` on the chain name display

**Required Fixture Changes**:
- Add `connectWalletOnWrongNetwork(page, { chainId })` fixture
- Add `approveNetworkSwitch()` fixture
- This is complex and may require a mock wallet or custom wallet provider

---

### 4. Additional Valuable Test Scenarios

#### 4.1 Wallet Connection Flow

```typescript
describe('Wallet Connection Flow', () => {
  test('should show connection modal when action requires wallet', async ({ page }) => {
    await page.goto('/demo');
    
    // Try to send without connecting
    await page.getByPlaceholder('Enter your greeting...').fill('Test');
    await page.getByRole('button', { name: /send/i }).click();
    
    // Assert: Connection modal appears
    await expect(page.getByTestId('wallet-connection-modal')).toBeVisible();
  });

  test('should persist connection across page navigations', async ({
    connectedPage
  }) => {
    // Navigate away and back
    await connectedPage.goto('/contracts');
    await connectedPage.goto('/demo');
    
    // Should still be connected (no modal on action)
    await connectedPage.getByPlaceholder('Enter your greeting...').fill('Test');
    await connectedPage.getByRole('button', { name: /send/i }).click();
    
    // Should NOT show connection modal
    await expect(
      connectedPage.getByTestId('wallet-connection-modal')
    ).not.toBeVisible({ timeout: 2000 });
  });

  test('should show wallet action required modal during signing', async ({
    connectedPage
  }) => {
    // Submit transaction
    await connectedPage.getByPlaceholder('Enter your greeting...').fill('Test');
    await connectedPage.getByRole('button', { name: /send/i }).click();
    
    // During wallet confirmation, should show pending indicator
    const pendingModal = connectedPage.getByTestId('wallet-action-required');
    // This may be visible very briefly depending on wallet auto-sign
  });
});
```

#### 4.2 Transaction Lifecycle

```typescript
describe('Transaction Lifecycle', () => {
  test('should complete full greeting submission flow', async ({
    connectedPage,
    waitForTransaction
  }) => {
    const uniqueGreeting = `E2E Test ${Date.now()}`;
    
    // Fill and submit
    await connectedPage.getByPlaceholder('Enter your greeting...').fill(uniqueGreeting);
    await connectedPage.getByRole('button', { name: /send/i }).click();
    
    // Wait for confirmation
    await waitForTransaction(connectedPage);
    
    // Verify the greeting appears in the list
    await expect(connectedPage.getByText(uniqueGreeting)).toBeVisible({
      timeout: 30000
    });
    
    // Verify input is cleared
    await expect(
      connectedPage.getByPlaceholder('Enter your greeting...')
    ).toHaveValue('');
  });

  test('should disable send button while transaction is pending', async ({
    connectedPage,
    pauseMining
  }) => {
    await pauseMining();
    
    await connectedPage.getByPlaceholder('Enter your greeting...').fill('Test');
    await connectedPage.getByRole('button', { name: /send/i }).click();
    
    // Send button should be disabled while pending
    await expect(
      connectedPage.getByRole('button', { name: /send/i })
    ).toBeDisabled();
  });
});
```

#### 4.3 User Rejection Handling

```typescript
describe('User Rejection Handling', () => {
  test('should handle user rejecting wallet connection', async ({
    page,
    rejectWalletConnection
  }) => {
    await page.goto('/demo');
    
    await page.getByPlaceholder('Enter your greeting...').fill('Test');
    await page.getByRole('button', { name: /send/i }).click();
    
    // Connection modal appears
    await expect(page.getByTestId('wallet-connection-modal')).toBeVisible();
    
    // User rejects
    await rejectWalletConnection();
    
    // Modal should close, app should remain usable
    await expect(page.getByTestId('wallet-connection-modal')).not.toBeVisible();
    await expect(page.getByRole('button', { name: /send/i })).toBeEnabled();
  });

  test('should handle user rejecting transaction', async ({
    connectedPage,
    rejectTransaction
  }) => {
    await connectedPage.getByPlaceholder('Enter your greeting...').fill('Test');
    await connectedPage.getByRole('button', { name: /send/i }).click();
    
    // User rejects in wallet
    await rejectTransaction();
    
    // Should NOT show error toast for user rejection
    const errorToast = connectedPage.locator('[data-sonner-toast][data-type="error"]');
    await expect(errorToast).not.toBeVisible({ timeout: 2000 });
    
    // App should remain usable
    await expect(
      connectedPage.getByRole('button', { name: /send/i })
    ).toBeEnabled();
  });
});
```

---

## Implementation Roadmap

### Phase 1: Add Data Attributes to Components

Add `data-testid` attributes to make elements reliably selectable:

1. [`InsufficientFundsModal.svelte`](web/src/lib/core/transaction/InsufficientFundsModal.svelte)
2. [`ConnectionFlow.svelte`](web/src/lib/core/connection/ConnectionFlow.svelte)
3. Toast components (if using custom sonner wrapper)

### Phase 2: Create New Test Fixtures

Extend [`web/e2e/fixtures/test.ts`](web/e2e/fixtures/test.ts):

```typescript
export interface AdvancedWalletFixtures {
  // Existing
  connectedPage: Page;
  connectWallet: (page: Page) => Promise<void>;
  waitForTransaction: (page: Page) => Promise<void>;
  
  // New fixtures
  createWalletWithBalance: (balance: string) => Promise<WalletInfo>;
  fundWallet: (amount: string) => Promise<void>;
  pauseMining: () => Promise<void>;
  resumeMining: () => Promise<void>;
  connectWalletOnWrongNetwork: (page: Page, opts: { chainId: number }) => Promise<void>;
  rejectTransaction: () => Promise<void>;
  rejectWalletConnection: () => Promise<void>;
}
```

### Phase 3: Write New Test Files

1. `web/e2e/tests/insufficient-funds.e2e.ts`
2. `web/e2e/tests/transaction-errors.e2e.ts`
3. `web/e2e/tests/network-switch.e2e.ts`
4. `web/e2e/tests/wallet-connection.e2e.ts`

### Phase 4: Refactor Existing Tests

1. Remove text-based assertions from existing tests
2. Keep behavioral tests that verify actual functionality
3. Update selectors to use data-testid where appropriate

### Phase 5: Clean Up

1. Remove or archive tests that provide no value
2. Update [`TESTING.md`](web/TESTING.md) with new test patterns
3. Add examples of good vs bad test patterns

---

## Fixture Implementation Notes

### Hardhat JSON-RPC Methods for Testing

The local Hardhat node supports special methods useful for testing:

```typescript
// Pause automatic mining
await page.evaluate(async () => {
  await fetch('http://localhost:8545', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'evm_setAutomine',
      params: [false],
      id: 1
    })
  });
});

// Set account balance
await page.evaluate(async (address, balance) => {
  await fetch('http://localhost:8545', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'hardhat_setBalance',
      params: [address, balance], // balance in hex wei
      id: 1
    })
  });
}, walletAddress, '0x0'); // Zero balance

// Mine a block manually
await page.evaluate(async () => {
  await fetch('http://localhost:8545', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'evm_mine',
      params: [],
      id: 1
    })
  });
});
```

### Network Switching Challenge

Testing network switching is complex because:
1. The burner wallet auto-accepts chain switches
2. Real wallets require user interaction
3. May need a custom mock wallet provider for full control

**Possible approaches**:
1. Use window injection to override wallet behavior
2. Create a test-mode in the connection library
3. Test at the unit level instead of e2e

---

## Summary

| Category | Current State | Target State |
|----------|--------------|--------------|
| Text-based tests | ~15 brittle tests | Remove or refactor |
| Behavioral tests | ~5 good tests | Keep and enhance |
| Error handling | 1 network error test | 10+ error scenarios |
| Edge cases | None | Insufficient funds, wrong network, user rejection |
| Fixtures | Basic (connect, wait) | Advanced (balance control, mining control) |

The focus should be on testing **what happens** when things work and when they don't, not on **what text appears** on the screen.
