# Explorer Links Consistency Plan

## Overview

Improve consistency in how transaction hashes and addresses are displayed as links throughout the application. Add "View in Blockchain Explorer" functionality when chain configuration includes block explorer URLs.

## Key Principle

- **External links** (to block explorers like Etherscan) ONLY appear in the page **header** via "View in Explorer" button
- **All other links** within explorer pages are **internal** navigation (e.g., `/explorer/address/0x...`)
- Links to internal explorer from **outside** explorer pages use internal navigation

## Current State

### Block Explorer Config
- Already exists in [`deployments.ts`](../web/src/lib/deployments.ts:17-23) for Sepolia:
  ```typescript
  "blockExplorers": {
    "default": {
      "name": "Etherscan",
      "url": "https://sepolia.etherscan.io",
      "apiUrl": "https://api-sepolia.etherscan.io/api"
    }
  }
  ```
- Local chain (Anvil) does not have blockExplorers defined

### Current Inconsistencies

| Component | Element | Current Behavior | Target Behavior |
|-----------|---------|------------------|-----------------|
| TransactionView | tx hash | Display only | Display + copy |
| TransactionView | from/to address | Display only | Clickable to internal explorer |
| TransactionView | header | No external link | "View in Explorer" button |
| AddressView | address | Display only | Display + copy |
| AddressView | header | No external link | "View in Explorer" button |
| TransactionItem | tx hash | Links to internal explorer | Keep + use new component |
| TransactionAttemptsList | tx hash | Display only | Clickable to internal explorer |
| OperationCard | tx hash | Manual truncation | Use TransactionHash component |

## Implementation Plan

### 1. Create Utility Functions

**File:** `web/src/routes/explorer/lib/utils.ts`

```typescript
/**
 * Get the block explorer URL for a transaction hash
 * Returns null if no block explorer is configured
 */
export function getBlockExplorerTxUrl(hash: string): string | null {
  const blockExplorers = deploymentsFromFiles.chain.blockExplorers;
  if (!blockExplorers?.default?.url) return null;
  return `${blockExplorers.default.url}/tx/${hash}`;
}

/**
 * Get the block explorer URL for an address
 * Returns null if no block explorer is configured
 */
export function getBlockExplorerAddressUrl(address: string): string | null {
  const blockExplorers = deploymentsFromFiles.chain.blockExplorers;
  if (!blockExplorers?.default?.url) return null;
  return `${blockExplorers.default.url}/address/${address}`;
}

/**
 * Get the block explorer name if configured
 */
export function getBlockExplorerName(): string | null {
  const blockExplorers = deploymentsFromFiles.chain.blockExplorers;
  return blockExplorers?.default?.name ?? null;
}

/**
 * Check if a block explorer is configured
 */
export function hasBlockExplorer(): boolean {
  return !!deploymentsFromFiles.chain.blockExplorers?.default?.url;
}
```

### 2. Create TransactionHash.svelte Component

**File:** `web/src/lib/core/ui/ethereum/TransactionHash.svelte`

Similar to Address.svelte but specifically for transaction hashes:

```svelte
<script lang="ts" module>
  export interface TransactionHashProps {
    value: `0x${string}`;
    truncate?: {start: number; end: number} | false;
    size?: 'xs' | 'sm' | 'default' | 'lg';
    mono?: boolean;
    showCopy?: boolean;
    linkTo?: 'internal' | 'external' | 'both' | false;
  }
</script>

<script lang="ts">
  // Similar implementation to Address.svelte
  // - Truncates hash by default
  // - Copy button
  // - Optional link to internal explorer (/explorer/tx/{hash})
  // - Optional link to external explorer (Etherscan, etc.)
</script>
```

**Key features:**
- `linkTo='internal'` - Links to `/explorer/tx/{hash}`
- `linkTo='external'` - Links to block explorer (only if blockExplorers configured)
- `linkTo='both'` - Shows both internal and external links
- `linkTo=false` - No links (display only)

### 3. Extend Address.svelte

**File:** `web/src/lib/core/ui/ethereum/Address.svelte`

Add optional `linkTo` prop:

```typescript
export interface AddressProps extends HTMLAttributes<HTMLSpanElement> {
  value: `0x${string}`;
  truncate?: {start: number; end: number} | false;
  size?: AddressSize;
  mono?: boolean;
  showCopy?: boolean;
  resolveENS?: boolean;
  linkTo?: 'internal' | 'external' | false; // NEW
  ref?: HTMLSpanElement | null;
}
```

When `linkTo='internal'`:
- Wraps the address text in a link to `/explorer/address/{address}`

When `linkTo='external'`:
- Adds small external link icon that links to the configured block explorer

Default: `false` (no links) - maintains backward compatibility

### 4. Update TransactionView.svelte

**Changes:**
1. Add "View in Explorer" button in header (only when blockExplorers configured):
   ```svelte
   {#if hasBlockExplorer()}
     <Button
       variant="outline"
       size="sm"
       href={getBlockExplorerTxUrl(txHash)}
       target="_blank"
     >
       <ExternalLinkIcon class="mr-2 h-4 w-4" />
       View in Explorer
     </Button>
   {/if}
   ```
   **Note:** This is the ONLY place for external links on the tx page. The header button links externally.

2. Make `from` and `to` addresses clickable to **internal** explorer:
   ```svelte
   <Address value={tx.from} linkTo="internal" />
   <Address value={tx.to} linkTo="internal" />
   ```
   These link to `/explorer/address/{address}` (internal navigation).

3. Replace tx hash display with TransactionHash component (no linking needed - already on tx page)

### 5. Update AddressView.svelte

**Changes:**
1. Add "View in Explorer" button in header (only when blockExplorers configured)
   **Note:** This is the ONLY place for external links on the address page. The header button links externally.
2. Keep the main address display as-is (it's already on the address page, no linking needed)

### 6. Update TransactionItem.svelte

**Changes:**
- Replace manual hash truncation with TransactionHash component:
  ```svelte
  <TransactionHash value={tx.hash} linkTo="internal" />
  ```

### 7. Update TransactionAttemptsList.svelte

**Changes:**
- Use TransactionHash component with internal linking:
  ```svelte
  <TransactionHash value={tx.hash} linkTo="internal" size="sm" />
  ```

### 8. Update OperationCard.svelte

**Changes:**
- Use TransactionHash component:
  ```svelte
  <TransactionHash value={txHash} linkTo="internal" />
  ```
- Keep existing "View" link for included transactions

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Explorer Pages                            │
├─────────────────────────────────────────────────────────────┤
│  TransactionView.svelte                                      │
│  ├── Header with "View in Explorer" button                  │
│  ├── TransactionHash (for tx hash)                          │
│  └── Address (with linkTo="internal" for from/to)           │
├─────────────────────────────────────────────────────────────┤
│  AddressView.svelte                                          │
│  ├── Header with "View in Explorer" button                  │
│  └── Address (display only - already on address page)       │
├─────────────────────────────────────────────────────────────┤
│  TransactionItem.svelte                                      │
│  ├── TransactionHash (linkTo="internal")                    │
│  └── Address (linkTo="internal" for from/to)                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Other Components                          │
├─────────────────────────────────────────────────────────────┤
│  Navbar / ConnectionFlow                                     │
│  └── Address (linkTo=false - just display)                  │
├─────────────────────────────────────────────────────────────┤
│  OperationCard.svelte                                        │
│  └── TransactionHash (linkTo="internal")                    │
├─────────────────────────────────────────────────────────────┤
│  TransactionAttemptsList.svelte                              │
│  └── TransactionHash (linkTo="internal")                    │
└─────────────────────────────────────────────────────────────┘
```

## Files to Modify

1. **Create new files:**
   - `web/src/lib/core/ui/ethereum/TransactionHash.svelte`

2. **Modify existing files:**
   - `web/src/routes/explorer/lib/utils.ts` - Add utility functions
   - `web/src/lib/core/ui/ethereum/Address.svelte` - Add linkTo prop
   - `web/src/routes/explorer/components/TransactionView.svelte` - Add external link button, use components
   - `web/src/routes/explorer/components/AddressView.svelte` - Add external link button
   - `web/src/routes/explorer/components/TransactionItem.svelte` - Use TransactionHash component
   - `web/src/lib/ui/pending-operation/TransactionAttemptsList.svelte` - Use TransactionHash component
   - `web/src/routes/transactions/components/OperationCard.svelte` - Use TransactionHash component

## Testing Considerations

1. **With blockExplorers configured (Sepolia):**
   - "View in Explorer" buttons should appear
   - External links should work correctly

2. **Without blockExplorers (local/Anvil):**
   - No "View in Explorer" buttons
   - No external link icons
   - Internal explorer links still work

3. **Backward compatibility:**
   - Existing Address usage without linkTo prop should work unchanged
   - No regressions in non-explorer pages

## Implementation Context for Code Mode

### Project Structure

```
web/src/
├── lib/
│   ├── deployments.ts              # Has chain.blockExplorers config (for Sepolia)
│   ├── index.ts                    # Has route() helper for internal URLs
│   └── core/ui/ethereum/
│       ├── Address.svelte          # Existing address display component
│       └── TransactionHash.svelte  # NEW - to be created
├── routes/
│   ├── explorer/
│   │   ├── lib/utils.ts            # Add utility functions here
│   │   └── components/
│   │       ├── TransactionView.svelte
│   │       ├── AddressView.svelte
│   │       └── TransactionItem.svelte
│   └── transactions/components/
│       └── OperationCard.svelte
└── lib/ui/pending-operation/
    └── TransactionAttemptsList.svelte
```

### Key Imports

For components needing block explorer utilities:
```typescript
import {
  getBlockExplorerTxUrl,
  getBlockExplorerAddressUrl,
  hasBlockExplorer,
} from '../lib/utils'; // or appropriate relative path
```

For components using internal routing:
```typescript
import {route} from '$lib';
// Usage: href={route(`/explorer/tx/${hash}`)}
```

For Address/TransactionHash components:
```typescript
import Address from '$lib/core/ui/ethereum/Address.svelte';
import TransactionHash from '$lib/core/ui/ethereum/TransactionHash.svelte';
```

### Existing Patterns to Follow

**Button with external link (from existing code patterns):**
```svelte
<Button
  variant="outline"
  size="sm"
  href={externalUrl}
  target="_blank"
>
  <ExternalLinkIcon class="mr-2 h-4 w-4" />
  View in Explorer
</Button>
```

**Address component current props:**
- `value: \`0x\${string}\``
- `truncate?: {start: number; end: number} | false` (default: `{start: 4, end: 4}`)
- `size?: 'xs' | 'sm' | 'default' | 'lg'`
- `mono?: boolean`
- `showCopy?: boolean` (default: true)
- `resolveENS?: boolean` (default: true)

### TypeScript Considerations

The `blockExplorers` field may not exist on all deployments (it's optional). Access it safely:
```typescript
const blockExplorers = deploymentsFromFiles.chain.blockExplorers;
// blockExplorers may be undefined for local chains
```

### Svelte 5 Patterns Used in Project

The project uses Svelte 5 runes:
```svelte
<script lang="ts">
  let {value, linkTo = false}: Props = $props();
  
  let derived = $derived(someComputation);
  
  $effect(() => {
    // side effects
  });
</script>
```

### ExternalLinkIcon Import

```typescript
import {ExternalLinkIcon} from '@lucide/svelte';
```
