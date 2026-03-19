<script lang="ts">
	import Address from '$lib/core/ui/ethereum/Address.svelte';
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
	openWhen={$connection.step == 'ChooseWalletAccount'}
	onCancel={() => connection.back('Idle')}
>
	<Modal.Title>Choose Wallet Account</Modal.Title>
	{#if $connection.step == 'ChooseWalletAccount'}
		<!-- ASSERT ChooseWalletAccount -->
		{#each $connection.wallet.accounts as account}
			<Button onclick={() => connection.connectToAddress(account)}
				>{account}</Button
			>
		{/each}
	{/if}
</Modal.Root>

<Modal.Root
	openWhen={$connection.step == 'WalletToChoose' ||
		$connection.step == 'MechanismToChoose'}
	onCancel={() => connection.cancel()}
	elementToFocus={emailInput}
	><Modal.Title>Choose Connection Type...</Modal.Title>
	{#if connection.targetStep == 'SignedIn' && !connection.walletOnly}
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
		<div class="mb-6 flex flex-col gap-2">
			{#each $connection.wallets as wallet}
				<Button
					class="rounded bg-zinc-700 px-4 py-2 text-zinc-100 transition hover:bg-zinc-600"
					onclick={() =>
						connection.connect({
							type: 'wallet',
							name: wallet.info.name,
						})}
				>
					<img
						src={wallet.info.icon}
						alt={wallet.info.name}
						class="mr-2 ml-2 inline-block h-5 w-5"
					/>
					{wallet.info.name}
				</Button>
			{/each}
		</div>
	{:else}
		<div class="mb-6 flex flex-col gap-2">
			<p class="mb-2 text-sm text-zinc-400">
				You need a web3 wallet to continue
			</p>
			<a
				href="https://metamask.io/download/"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium text-white transition-colors hover:opacity-90"
				style="background-color: #FF5C16;"
			>
				<img
					src="/wallets/metamask/MetaMask-icon-fox.svg"
					alt="MetaMask"
					class="h-6 w-6"
				/>
				Download MetaMask
			</a>
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
	<Modal.Title>Choose Wallet Account</Modal.Title>
	{#if $connection.step == 'ChooseWalletAccount'}
		<!-- ASSERT ChooseWalletAccount -->
		{#each $connection.wallet.accounts as account}
			<Button onclick={() => connection.connectToAddress(account)}
				><Address value={account} /></Button
			>
		{/each}
	{/if}
	<!-- TODO : cancel Button -->
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

<!-- TODO not a Modal -->
<BasicModal
	openWhen={(connection.isTargetStepReached($connection) &&
		$connection.mechanism.type === 'wallet' &&
		$connection.wallet?.invalidChainId) ||
		false}
	title={`Require Connection to ${connection.chainInfo.name || `network with chainId: ${connection.chainId}`}`}
	cancel={true}
	confirm={{
		label: 'Switch',
		onclick: () => connection.switchWalletChain(),
		disabled: !!$connection.wallet?.switchingChain,
	}}
	onCancel={() => connection.cancel()}
>
	<p>
		Switch to {connection.chainInfo.name ||
			`network with chainId: ${connection.chainId}`} to continue.
	</p>
</BasicModal>
