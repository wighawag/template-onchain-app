<script lang="ts">
	import Address from '$lib/core/ui/ethereum/Address.svelte';
	import BlockieAvatar from '$lib/core/ui/ethereum/BlockieAvatar.svelte';
	import {Button} from '$lib/shadcn/ui/button';
	import * as Collapsible from '$lib/shadcn/ui/collapsible/index.js';
	import {ChevronDownIcon} from '@lucide/svelte';
	import type {
		AnyConnectionStore,
		UnderlyingEthereumProvider,
	} from '@etherplay/connect';
	import * as Modal from '$lib/core/ui/modal/index.js';
	import BasicModal from '../ui/modal/basic-modal.svelte';

	let accountsOpen = $state(true);

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
		<div class="flex flex-col gap-3 py-2">
			<Collapsible.Root bind:open={accountsOpen}>
				<Collapsible.Trigger class="w-full">
					<div
						class="flex w-full cursor-pointer items-center justify-between rounded-md border border-input bg-background px-4 py-3 hover:bg-accent hover:text-accent-foreground"
					>
						<span class="text-sm text-muted-foreground">
							{$connection.wallet.accounts.length} account{$connection.wallet
								.accounts.length > 1
								? 's'
								: ''} available
						</span>
						<ChevronDownIcon
							class="h-4 w-4 transition-transform {accountsOpen
								? 'rotate-180'
								: ''}"
						/>
					</div>
				</Collapsible.Trigger>
				<Collapsible.Content>
					<div
						class="mt-2 flex max-h-[50vh] flex-col gap-2 overflow-y-auto rounded-md border border-input bg-muted/50 p-2"
					>
						{#each $connection.wallet.accounts as account}
							<button
								class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
								onclick={() => connection.connectToAddress(account)}
							>
								<div
									class="h-6 w-6 shrink-0 overflow-hidden rounded-full [&>*]:h-full [&>*]:w-full"
								>
									<BlockieAvatar address={account} />
								</div>
								<Address value={account} />
							</button>
						{/each}
					</div>
				</Collapsible.Content>
			</Collapsible.Root>

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
