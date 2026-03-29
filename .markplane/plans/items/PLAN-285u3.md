---
id: PLAN-285u3
title: Faucet Link Implementation Plan
status: done
implements:
- TASK-d8jdn
related: []
created: 2026-03-27
updated: 2026-03-27
---

# Faucet Link Implementation Plan

## Overview

Add a configurable faucet link button that opens in a popup window. The feature is controlled via `PUBLIC_FAUCET_LINK` environment variable and appears only in specific locations:
- Sidebar: below balance, only when balance is zero
- InsufficientFundsModal: always when modal is displayed

## Ground Truth

- `web/src/lib/ui/navbar/navbar.svelte:253-261` — Balance display in sidebar drawer
- `web/src/lib/core/transaction/InsufficientFundsModal.svelte` — Low balance modal
- `web/src/lib/core/connection/balance.ts` — BalanceStore type with `step: 'Loaded'` and `value: bigint`
- `web/.env` — Environment variable patterns using `PUBLIC_` prefix
- `web/src/lib/core/ens/index.ts:4` — Pattern for importing `$env/static/public`

## Approach

Create a reusable `FaucetButton` component that:
1. Self-hides when env var is empty/undefined
2. Opens link in popup window (not new tab)
3. Integrates cleanly into existing UI patterns

## Non-Goals / Out of Scope

- Chain-specific faucet URLs (single URL via env var)
- Faucet functionality in any location other than sidebar and InsufficientFundsModal

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Popup window vs new tab | Preserves app state, user requested |
| Visibility handled in parents | Simpler component, explicit visibility logic in each location |
| Zero balance check in sidebar only | User requirement - different from modal behavior |

## Phases

### Phase 1: Environment & Component Setup

- [ ] Add `PUBLIC_FAUCET_LINK=` to `web/.env`
- [ ] Create `web/src/lib/core/ui/faucet/FaucetButton.svelte` (simple button, no self-hiding)
- [ ] Create `web/src/lib/core/ui/faucet/index.ts`
- [ ] Export `hasFaucetLink` helper function

**Checkpoint**: FaucetButton component and helper exist and can be imported.

### Phase 2: Integration

- [ ] Update `web/src/lib/ui/navbar/navbar.svelte` - wrap faucet in conditional: `hasFaucetLink && balance === 0n`
- [ ] Update `web/src/lib/core/transaction/InsufficientFundsModal.svelte` - wrap faucet in conditional: `hasFaucetLink`

**Checkpoint**: Faucet button appears in correct locations with correct visibility rules.

### Phase 3: Testing

- [ ] Verify button hidden when `PUBLIC_FAUCET_LINK` is empty
- [ ] Verify button shows in sidebar only when balance is zero AND faucet link is set
- [ ] Verify button always shows in InsufficientFundsModal when faucet link is set
- [ ] Verify popup opens correctly

**Checkpoint**: All visibility and behavior requirements met.

## Component Code

```svelte
<!-- web/src/lib/core/ui/faucet/FaucetButton.svelte -->
<script lang="ts">
	import {PUBLIC_FAUCET_LINK} from '$env/static/public';
	import {Button} from '$lib/shadcn/ui/button/index.js';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

	function openFaucet() {
		window.open(PUBLIC_FAUCET_LINK, 'faucet', 'width=600,height=700,scrollbars=yes,resizable=yes');
	}
</script>

<Button variant="outline" onclick={openFaucet} class="w-full gap-2">
	<ExternalLinkIcon class="h-4 w-4" />
	Get Test ETH
</Button>
```

```typescript
// web/src/lib/core/ui/faucet/index.ts
import {PUBLIC_FAUCET_LINK} from '$env/static/public';
export {default as FaucetButton} from './FaucetButton.svelte';
export const hasFaucetLink = Boolean(PUBLIC_FAUCET_LINK && PUBLIC_FAUCET_LINK.trim());
```

## Integration Examples

**Navbar (sidebar) - show only when balance is zero:**
```svelte
import {FaucetButton, hasFaucetLink} from '$lib/core/ui/faucet/index.js';

<!-- In Balance & Transactions Section -->
{#if hasFaucetLink && $balance.step === 'Loaded' && $balance.value === 0n}
	<FaucetButton />
{/if}
```

**InsufficientFundsModal - show when faucet link is configured:**
```svelte
import {FaucetButton, hasFaucetLink} from '$lib/core/ui/faucet/index.js';

<!-- After shortfall display -->
{#if hasFaucetLink}
	<div class="pt-2">
		<FaucetButton />
	</div>
{/if}
```

## Testing Strategy

Manual testing:
1. Set `PUBLIC_FAUCET_LINK` to valid URL → verify button appears
2. Leave empty → verify button hidden everywhere
3. Test zero balance → sidebar shows button
4. Test non-zero balance → sidebar hides button
5. Trigger InsufficientFundsModal → button always visible
6. Click button → popup opens with correct dimensions

## Rollback Plan

Remove FaucetButton imports from navbar and modal, delete component files.

## References

- [[TASK-d8jdn]] - Parent task
