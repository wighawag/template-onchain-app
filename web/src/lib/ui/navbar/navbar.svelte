<script lang="ts">
	import {getUserContext, route} from '$lib';
	import Button, {buttonVariants} from '$lib/shadcn/ui/button/button.svelte';
	import BlockieAvatar from '../../core/ui/ethereum/BlockieAvatar.svelte';
	import {Spinner} from '$lib/shadcn/ui/spinner/index.js';
	import * as Drawer from '$lib/shadcn/ui/drawer/index.js';
	import * as Collapsible from '$lib/shadcn/ui/collapsible/index.js';
	import Address from '../../core/ui/ethereum/Address.svelte';
	import Badge from '$lib/shadcn/ui/badge/badge.svelte';
	import {formatBalance} from '$lib/core/utils/format/balance';
	import {
		MenuIcon,
		GithubIcon,
		MessageCircleIcon,
		ChevronDownIcon,
	} from '@lucide/svelte';
	import {page} from '$app/state';

	let {
		githubUrl,
		communityUrl,
	}: {
		githubUrl?: string;
		communityUrl?: string;
	} = $props();

	const {connection, accountData, balance} = getUserContext();

	let showMenu = $state(false);
	let accountsOpen = $state(false);

	let hasMultipleAccounts = $derived(
		$connection.wallet?.accounts && $connection.wallet.accounts.length > 1,
	);

	// Use the elegant API pattern: watchItemIds returns a reactive store
	let operationIds = $derived(accountData.watchItemIds('operations'));
	let transactionCount = $derived($operationIds.length);

	// Derive formatted balance
	let formattedBalance = $derived.by(() => {
		if ($balance.step === 'Loaded') {
			return formatBalance($balance.value, 18, 6);
		}
		return null;
	});

	function toggleMenu() {
		showMenu = !showMenu;
	}

	function isActive(path: string): boolean {
		const currentPath = String(page.url.pathname);
		if (path === '/') {
			return currentPath === '/';
		}
		return currentPath.startsWith(path);
	}
</script>

<!--navbar padding handled by scrollbar-gutter on desktop, needs-gutter-padding class adds padding on touch devices, see app.css-->
<nav
	class="needs-gutter-padding sticky top-0 left-0 z-50 flex h-12 w-full items-center justify-between bg-background py-4 shadow-md"
>
	<div class="m-1 flex h-full items-center space-x-4">
		<span class="inline-flex items-baseline gap-4">
			<a
				href={route('/')}
				class="rounded px-2 py-1 text-sm transition-colors {isActive('/')
					? 'bg-primary/20 font-semibold text-primary'
					: 'text-muted-foreground hover:text-foreground hover:underline'}"
			>
				Home
			</a>
			<a
				href={route('/demo/')}
				class="rounded px-2 py-1 text-sm transition-colors {isActive('/demo')
					? 'bg-primary/20 font-semibold text-primary'
					: 'text-muted-foreground hover:text-foreground hover:underline'}"
			>
				Demo
			</a>
			<a
				href={route('/about/')}
				class="rounded px-2 py-1 text-sm transition-colors {isActive('/about')
					? 'bg-primary/20 font-semibold text-primary'
					: 'text-muted-foreground hover:text-foreground hover:underline'}"
			>
				About
			</a>
		</span>
		<div class="flex items-center space-x-2">
			{#if githubUrl}
				<a
					href={githubUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted-foreground hover:text-foreground"
					aria-label="GitHub"
				>
					<GithubIcon class="h-5 w-5" />
				</a>
			{/if}
			{#if communityUrl}
				<a
					href={communityUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted-foreground hover:text-foreground"
					aria-label="Discord"
				>
					<MessageCircleIcon class="h-5 w-5" />
				</a>
			{/if}
		</div>
	</div>

	<div class="relative flex h-full items-center space-x-2">
		<!-- Connect Button / Connected Address -->
		{#if ($connection.step === 'Idle' && $connection.loading) || ($connection.step != 'Idle' && !connection.isTargetStepReached($connection))}
			<Button disabled class="m-1 flex h-8 items-center justify-center p-0">
				<Spinner /> Connect
			</Button>
		{:else if connection.isTargetStepReached($connection)}
			<div class="m-1 hidden h-8 items-center space-x-2 sm:flex">
				{#if formattedBalance !== null}
					<span class="text-sm text-muted-foreground"
						>{formattedBalance} ETH</span
					>
					<!-- {:else}
					<Address value={$connection.account.address} /> -->
				{/if}
			</div>
		{:else}
			<Button
				class="m-1 flex h-8 items-center justify-center p-0 px-3"
				onclick={() => connection.connect()}
			>
				Connect
			</Button>
		{/if}

		<!-- Drawer Button - Avatar when connected, Menu icon when disconnected -->
		<button
			class="relative m-1 flex h-8 w-8 items-center justify-center rounded-md focus:outline-none {$connection.step !==
			'SignedIn'
				? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
				: ''}"
			onclick={toggleMenu}
			aria-label="Open menu"
		>
			{#if connection.isTargetStepReached($connection)}
				<BlockieAvatar address={$connection.account.address} />
				{#if transactionCount > 0}
					<span
						class="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground"
					>
						{transactionCount > 99 ? '99+' : transactionCount}
					</span>
				{/if}
			{:else}
				<MenuIcon class="h-5 w-5" />
			{/if}
		</button>
	</div>
	<Drawer.Root bind:open={showMenu} direction="right">
		<Drawer.Portal to="#--layer-drawer" />
		<Drawer.Content>
			{#if connection.isTargetStepReached($connection)}
				<!-- Account Section -->
				<div class="flex flex-col gap-2 px-4 pt-4">
					<Collapsible.Root
						bind:open={accountsOpen}
						disabled={!hasMultipleAccounts}
					>
						<Collapsible.Trigger class="w-full" disabled={!hasMultipleAccounts}>
							<div
								class="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 {hasMultipleAccounts
									? 'cursor-pointer hover:bg-accent hover:text-accent-foreground'
									: 'cursor-default'}"
							>
								<div class="flex items-center gap-2">
									<div
										class="h-6 w-6 shrink-0 overflow-hidden rounded-full *:h-full *:w-full"
									>
										<BlockieAvatar address={$connection.account.address} />
									</div>
									<Address value={$connection.account.address} />
								</div>
								{#if hasMultipleAccounts}
									<ChevronDownIcon
										class="h-4 w-4 transition-transform {accountsOpen
											? 'rotate-180'
											: ''}"
									/>
								{/if}
							</div>
						</Collapsible.Trigger>
						{#if hasMultipleAccounts}
							<Collapsible.Content>
								<div
									class="mt-1 flex flex-col gap-1 rounded-md border border-input bg-muted/50 p-1"
								>
									{#each $connection.wallet.accounts as account}
										<button
											class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors {account ===
											$connection.account.address
												? 'bg-primary/20 text-primary'
												: 'hover:bg-accent hover:text-accent-foreground'}"
											onclick={() => {
												if (account !== $connection.account.address) {
													connection.connectToAddress(account);
													accountsOpen = false;
												}
											}}
										>
											<div
												class="h-5 w-5 shrink-0 overflow-hidden rounded-full *:h-full *:w-full"
											>
												<BlockieAvatar address={account} />
											</div>
											<Address value={account} />
											{#if account === $connection.account.address}
												<span class="ml-auto text-xs text-muted-foreground"
													>(current)</span
												>
											{/if}
										</button>
									{/each}
								</div>
							</Collapsible.Content>
						{/if}
					</Collapsible.Root>

					<Button
						class="w-full"
						variant="destructive"
						onclick={() => {
							connection.disconnect();
							showMenu = false;
						}}
					>
						Disconnect
					</Button>
				</div>

				<!-- Balance & Transactions Section -->
				<div class="mt-4 flex flex-col gap-2 border-t border-border px-4 pt-4">
					{#if formattedBalance !== null}
						<div class="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
							<span class="text-sm text-muted-foreground">Balance</span>
							<span class="font-medium">{formattedBalance} ETH</span>
						</div>
					{/if}
					<a
						href={route('/transactions/')}
						class="{buttonVariants({variant: 'outline'})} justify-between"
						onclick={() => (showMenu = false)}
					>
						<span>Your Transactions</span>
						{#if transactionCount > 0}
							<Badge variant="secondary" class="ml-2">{transactionCount}</Badge>
						{/if}
					</a>
				</div>
			{:else}
				<Drawer.Header class="text-start">
					<Drawer.Title>You are disconnected</Drawer.Title>
				</Drawer.Header>
				<div class="px-4">
					<Button class="w-full" onclick={() => connection.connect()}>
						Connect
					</Button>
				</div>
			{/if}

			<!-- Developer Links -->
			<div class="mt-4 flex flex-col gap-2 border-t border-border px-4 pt-4">
				<span class="text-xs tracking-wide text-muted-foreground uppercase"
					>Developer</span
				>
				<a
					href={route('/contracts/')}
					class={buttonVariants({variant: 'outline'})}
					onclick={() => (showMenu = false)}
				>
					Contracts
				</a>
				<a
					href={route('/explorer/')}
					class={buttonVariants({variant: 'outline'})}
					onclick={() => (showMenu = false)}
				>
					Explorer
				</a>
			</div>

			<Drawer.Footer class="pt-2">
				<Drawer.Close class={buttonVariants({variant: 'outline'})}
					>Cancel</Drawer.Close
				>
			</Drawer.Footer>
		</Drawer.Content>
	</Drawer.Root>
</nav>
