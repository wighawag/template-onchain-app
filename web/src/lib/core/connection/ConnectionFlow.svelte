<script lang="ts">
	import Address from '$lib/core/ui/ethereum/Address.svelte';
	import BlockieAvatar from '$lib/core/ui/ethereum/BlockieAvatar.svelte';
	import {Button} from '$lib/shadcn/ui/button';
	import type {
		AnyConnectionStore,
		UnderlyingEthereumProvider,
	} from '@etherplay/connect';
	import * as Modal from '$lib/core/ui/modal/index.js';
	import BasicModal from '../ui/modal/basic-modal.svelte';

	interface Props {
		connection: AnyConnectionStore<UnderlyingEthereumProvider>;
	}

	let {connection}: Props = $props();

	let email: string = $state('');
	let emailInput: HTMLInputElement | undefined = $state(undefined);
</script>

<Modal.Root
	openWhen={$connection.step == 'WaitingForWalletConnection'}
	onCancel={() => connection.back('Idle')}
>
	<Modal.Title>Waiting for Wallet Connection...</Modal.Title>
	Please Accept Connection Request...
</Modal.Root>

<Modal.Root
	openWhen={$connection.step == 'WalletToChoose' ||
		$connection.step == 'MechanismToChoose'}
	onCancel={() => connection.cancel()}
	elementToFocus={emailInput}
>
	{#if connection.targetStep == 'SignedIn' && !connection.walletOnly}
		<Modal.Title>Choose Connection Type...</Modal.Title>
		<!-- Email option first -->
		<div class="mb-6 flex flex-col gap-2">
			<input
				bind:this={emailInput}
				bind:value={email}
				placeholder="Enter your email"
				class="w-full rounded-md border border-zinc-700 bg-zinc-800 p-2 text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-zinc-500 focus:outline-none"
			/>
			<Button
				class="rounded bg-zinc-700 px-4 py-2 text-zinc-100 transition hover:bg-zinc-600"
				onclick={() =>
					connection.connect({
						type: 'email',
						mode: 'otp',
						email,
					})}
			>
				Sign in with Email
			</Button>
		</div>
	{/if}

	<!-- Wallet options -->
	{#if $connection.wallets.length > 0}
		{#if !(connection.targetStep == 'SignedIn' && !connection.walletOnly)}
			<Modal.Title>
				{$connection.wallets.length} wallet{$connection.wallets.length > 1
					? 's'
					: ''} available, choose one
			</Modal.Title>
		{/if}
		<div class="flex flex-col gap-3 py-2">
			<div
				class="flex max-h-[50vh] flex-col gap-2 overflow-y-auto rounded-md border border-input bg-muted/50 p-2"
			>
				{#each $connection.wallets as wallet}
					<button
						class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
						onclick={() =>
							connection.connect({
								type: 'wallet',
								name: wallet.info.name,
							})}
					>
						<div class="h-6 w-6 shrink-0 overflow-hidden rounded-full">
							<img
								src={wallet.info.icon}
								alt={wallet.info.name}
								class="h-full w-full object-contain"
							/>
						</div>
						<span class="text-sm font-medium">{wallet.info.name}</span>
					</button>
				{/each}
			</div>
			<Button
				variant="outline"
				class="w-full"
				onclick={() => connection.cancel()}
			>
				Cancel
			</Button>
		</div>
	{:else}
		{#if !(connection.targetStep == 'SignedIn' && !connection.walletOnly)}
			<Modal.Title>No Wallet Detected</Modal.Title>
		{/if}
		<div class="flex flex-col gap-3 py-2">
			<div
				class="flex flex-col gap-2 rounded-md border border-input bg-muted/50 p-2"
			>
				<p class="px-3 py-2 text-sm text-muted-foreground">
					You need a web3 wallet to continue
				</p>
				<a
					href="https://metamask.io/download/"
					target="_blank"
					rel="noopener noreferrer"
					class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
				>
					<div class="h-6 w-6 shrink-0 overflow-hidden rounded-full">
						<img
							src="/wallets/metamask/MetaMask-icon-fox.svg"
							alt="MetaMask"
							class="h-full w-full object-contain"
						/>
					</div>
					<span class="text-sm font-medium">Download MetaMask</span>
				</a>
			</div>
			<Button
				variant="outline"
				class="w-full"
				onclick={() => connection.cancel()}
			>
				Cancel
			</Button>
		</div>
	{/if}

	{#if connection.targetStep == 'SignedIn' && !connection.walletOnly}
		<!-- Dev option -->
		<Button
			class="rounded bg-zinc-700 px-4 py-2 text-zinc-100 transition hover:bg-zinc-600"
			onclick={() =>
				connection.connect({
					type: 'mnemonic',
					mnemonic:
						'test test test test test test test test test test test junk',
					index: undefined,
				})}
		>
			Dev
		</Button>
	{/if}
</Modal.Root>

<!-- TODO? not a modal -->
<Modal.Root
	openWhen={connection.targetStep !== 'WalletConnected' &&
		$connection.step === 'WalletConnected'}
	onCancel={() => connection.cancel()}
>
	<Modal.Title>Wallet Connected</Modal.Title>
	<Button onclick={() => connection.requestSignature()}>sign-in</Button>
</Modal.Root>

<Modal.Root
	openWhen={$connection.step === 'ChooseWalletAccount'}
	onCancel={() => connection.cancel()}
>
	{#if $connection.step == 'ChooseWalletAccount'}
		<!-- ASSERT ChooseWalletAccount -->
		<Modal.Title>
			{$connection.wallet.accounts.length} account{$connection.wallet.accounts
				.length > 1
				? 's'
				: ''} available, choose one
		</Modal.Title>
		<div class="flex flex-col gap-3 py-2">
			<div
				class="flex max-h-[50vh] flex-col gap-2 overflow-y-auto rounded-md border border-input bg-muted/50 p-2"
			>
				{#each $connection.wallet.accounts as account}
					<button
						class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
						onclick={() => connection.connectToAddress(account)}
					>
						<div
							class="h-6 w-6 shrink-0 overflow-hidden rounded-full *:h-full *:w-full"
						>
							<BlockieAvatar address={account} />
						</div>
						<Address value={account} />
					</button>
				{/each}
			</div>

			<Button
				variant="outline"
				class="w-full"
				onclick={() => connection.cancel()}
			>
				Cancel
			</Button>
		</div>
	{/if}
</Modal.Root>

<BasicModal
	openWhen={$connection.step === 'WaitingForSignature'}
	title="Please sign"
	onCancel={() => connection.cancel()}
>
	<p>Please accept the signature request...</p>
</BasicModal>

<BasicModal
	title="Please wait..."
	openWhen={$connection.step === 'PopupLaunched'}
>
	{#if $connection.step === 'PopupLaunched'}
		<!-- ASSERT PopupLaunched -->
		{#if $connection.popupClosed}
			<p>Popup seems to be closed without giving response.</p>
			<Button class="btn btn-primary" onclick={() => connection.cancel()}
				>abort</Button
			>
		{:else}
			<p>please follow instruction...</p>
		{/if}
	{/if}
</BasicModal>

<!-- Network Switch Modal -->
<Modal.Root
	openWhen={(connection.isTargetStepReached($connection) &&
		$connection.mechanism.type === 'wallet' &&
		$connection.wallet?.invalidChainId) ||
		false}
	onCancel={() => connection.cancel()}
>
	<Modal.Title>Switch Network Required</Modal.Title>
	<Modal.Description>
		This app requires connection to a different network
	</Modal.Description>

	<div class="my-6 flex flex-col items-center gap-4">
		<!-- Network Switch Visual -->
		<div class="flex w-full items-center justify-center gap-3">
			<!-- Current Network -->
			<div class="flex flex-col items-center gap-2">
				<div
					class="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50 ring-2 ring-destructive/50"
				>
					<svg
						class="h-7 w-7 text-muted-foreground"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
						/>
					</svg>
				</div>
				<span class="text-xs text-muted-foreground">Current</span>
			</div>

			<!-- Arrow -->
			<div class="flex flex-col items-center">
				<svg
					class="h-6 w-6 text-primary {$connection.wallet?.switchingChain
						? 'animate-pulse'
						: ''}"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
					/>
				</svg>
			</div>

			<!-- Target Network -->
			<div class="flex flex-col items-center gap-2">
				<div
					class="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary"
				>
					<svg
						class="h-7 w-7 text-primary"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
						/>
					</svg>
				</div>
				<span class="text-xs font-medium text-primary"
					>{connection.chainInfo.name || `Chain ${connection.chainId}`}</span
				>
			</div>
		</div>

		<!-- Info Text -->
		<p class="text-center text-sm text-muted-foreground">
			Your wallet might prompt you to approve the network switch
		</p>
	</div>

	<Modal.Footer>
		<Button
			variant="outline"
			onclick={() => connection.cancel()}
			disabled={!!$connection.wallet?.switchingChain}
		>
			Cancel
		</Button>
		<Button
			onclick={() => connection.switchWalletChain()}
			disabled={!!$connection.wallet?.switchingChain}
		>
			{#if $connection.wallet?.switchingChain}
				<svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
					<circle
						class="opacity-25"
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						stroke-width="4"
					/>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					/>
				</svg>
				Switching...
			{:else}
				Switch Network
			{/if}
		</Button>
	</Modal.Footer>
</Modal.Root>
