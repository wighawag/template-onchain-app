<script lang="ts">
	import {onMount} from 'svelte';
	import {Button} from '$lib/shadcn/ui/button';
	import * as Modal from '$lib/core/ui/modal/index.js';
	import BasicModal from '$lib/core/ui/modal/basic-modal.svelte';
	import {Download, ExternalLink, Smartphone, Copy, Check} from '@lucide/svelte';

	interface Props {
		onCancel?: () => void;
		/** When true, shows as a secondary option (no title, compact buttons) */
		secondary?: boolean;
	}

	let {onCancel, secondary = false}: Props = $props();

	let showDownloadModal = $state(false);
	let showMobileModal = $state(false);
	let isMobile = $state(false);
	let urlCopied = $state(false);

	onMount(() => {
		const ua = navigator.userAgent;
		const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
		const isSmallScreen = window.innerWidth <= 1024;
		const isMobileOS = /Android|iPhone|iPad|iPod/i.test(ua);

		// Check if already inside a Wallet (Injected Provider)
		const hasInjectedProvider =
			typeof window !== 'undefined' &&
			(window as Window & {ethereum?: unknown}).ethereum;

		// Show mobile option only if on mobile/tablet AND not already in a dApp browser
		isMobile = isSmallScreen && (hasTouch || isMobileOS) && !hasInjectedProvider;
	});

	const downloadWallets = [
		{
			name: 'MetaMask',
			description: 'Popular browser extension wallet',
			icon: '/wallets/metamask/MetaMask-icon-fox.svg',
			url: 'https://metamask.io/download/',
		},
		{
			name: 'Rainbow',
			description: 'Fun, simple, and secure',
			icon: undefined,
			url: 'https://rainbow.me/',
		},
		{
			name: 'Rabby',
			description: 'The game-changing wallet for Ethereum',
			icon: undefined,
			url: 'https://rabby.io/',
		},
		{
			name: 'Coinbase Wallet',
			description: 'Your key to the world of crypto',
			icon: undefined,
			url: 'https://www.coinbase.com/wallet',
		},
	];

	const mobileWallets = [
		{
			name: 'MetaMask',
			description: 'Open in MetaMask Browser',
			icon: '/wallets/metamask/MetaMask-icon-fox.svg',
			getLink: (url: string) =>
				`metamask://dapp/${url.replace(/^https?:\/\//, '')}`,
		},
		{
			name: 'Trust Wallet',
			description: 'Open in Trust Wallet',
			icon: undefined,
			getLink: (url: string) =>
				`https://link.trustwallet.com/open_url?url=${encodeURIComponent(url)}`,
		},
		{
			name: 'Coinbase Wallet',
			description: 'Open in Coinbase Wallet',
			icon: undefined,
			getLink: (url: string) =>
				`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
		},
		{
			name: 'Rainbow',
			description: 'Open in Rainbow',
			icon: undefined,
			getLink: (url: string) => `rainbow://dapp?url=${encodeURIComponent(url)}`,
		},
		{
			name: 'Rabby',
			description: 'Open in Rabby',
			icon: undefined,
			getLink: (url: string) => `rabby://dapp/${url.replace(/^https?:\/\//, '')}`,
		},
	];

	async function handleMobileRedirect(wallet: (typeof mobileWallets)[0]) {
		const currentUrl = window.location.href;

		// Copy URL to clipboard first (user already informed via modal text)
		try {
			await navigator.clipboard.writeText(currentUrl);
		} catch {
			// Clipboard API may fail on some browsers, continue anyway
		}

		const deepLink = wallet.getLink(currentUrl);
		window.location.href = deepLink;
	}

	async function handleCopyUrl() {
		const currentUrl = window.location.href;
		try {
			await navigator.clipboard.writeText(currentUrl);
			urlCopied = true;
			setTimeout(() => {
				urlCopied = false;
			}, 2000);
		} catch {
			// Clipboard API may fail on some browsers
		}
	}
</script>

<!-- Main content -->
{#if secondary}
	<!-- Secondary mode: divider + wallet options -->
	<div class="relative my-4">
		<div class="absolute inset-0 flex items-center">
			<span class="w-full border-t border-input"></span>
		</div>
		<div class="relative flex justify-center text-xs uppercase">
			<span class="bg-background px-2 text-muted-foreground">or use a wallet</span>
		</div>
	</div>
	<div class="flex flex-col gap-2">
		<Button
			variant="outline"
			class="w-full justify-start gap-3"
			onclick={() => (showDownloadModal = true)}
		>
			<Download class="h-4 w-4" />
			<span>Get a Wallet</span>
		</Button>
		{#if isMobile}
			<Button
				variant="outline"
				class="w-full justify-start gap-3"
				onclick={() => (showMobileModal = true)}
			>
				<Smartphone class="h-4 w-4" />
				<span>Open in Wallet App</span>
			</Button>
		{/if}
	</div>
{:else}
	<!-- Primary mode: full layout with title -->
	<Modal.Title>No Wallet Detected</Modal.Title>
	<div class="flex flex-col gap-3 py-2">
		<p class="text-sm text-muted-foreground">
			You need a web3 wallet to continue. Choose an option below:
		</p>
		<div class="flex flex-col gap-2">
			<Button
				variant="outline"
				class="h-14 justify-start gap-4 px-4"
				onclick={() => (showDownloadModal = true)}
			>
				<Download class="h-5 w-5" />
				<div class="flex-1 text-left">
					<div class="font-medium">Download a Wallet</div>
					<div class="text-xs text-muted-foreground font-normal">
						Install a browser extension
					</div>
				</div>
			</Button>
			{#if isMobile}
				<Button
					variant="outline"
					class="h-14 justify-start gap-4 px-4"
					onclick={() => (showMobileModal = true)}
				>
					<Smartphone class="h-5 w-5" />
					<div class="flex-1 text-left">
						<div class="font-medium">Open in Wallet App</div>
						<div class="text-xs text-muted-foreground font-normal">
							Use your existing mobile wallet
						</div>
					</div>
				</Button>
			{/if}
		</div>
		{#if onCancel}
			<Button variant="outline" class="w-full" onclick={onCancel}>
				Cancel
			</Button>
		{/if}
	</div>
{/if}

<!-- Download Wallet Modal -->
<BasicModal
	title="Get a Wallet"
	openWhen={showDownloadModal}
	onCancel={() => (showDownloadModal = false)}
>
	<p class="text-sm text-muted-foreground mb-3">
		Install a wallet extension to connect:
	</p>
	<div
		class="flex max-h-[50vh] flex-col gap-2 overflow-y-auto rounded-md border border-input bg-muted/50 p-2"
	>
		{#each downloadWallets as wallet}
			<a
				href={wallet.url}
				target="_blank"
				rel="noopener noreferrer"
				class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
			>
				<div
					class="h-6 w-6 shrink-0 overflow-hidden rounded-full flex items-center justify-center bg-muted"
				>
					{#if wallet.icon}
						<img
							src={wallet.icon}
							alt={wallet.name}
							class="h-full w-full object-contain"
						/>
					{:else}
						<span class="text-xs font-bold">{wallet.name[0]}</span>
					{/if}
				</div>
				<div class="flex-1">
					<div class="text-sm font-medium">{wallet.name}</div>
					<div class="text-xs text-muted-foreground">{wallet.description}</div>
				</div>
				<ExternalLink class="h-4 w-4 opacity-30" />
			</a>
		{/each}
	</div>
</BasicModal>

<!-- Mobile Wallet Modal -->
<BasicModal
	title="Continue in Your Wallet"
	openWhen={showMobileModal}
	onCancel={() => (showMobileModal = false)}
>
	<p class="text-sm text-muted-foreground mb-3">
		Open this site in your wallet's browser.
		<span class="text-primary font-medium">The URL will be copied to your clipboard</span>
		so you can paste it manually if needed.
	</p>
	<div
		class="flex max-h-[50vh] flex-col gap-2 overflow-y-auto rounded-md border border-input bg-muted/50 p-2"
	>
		{#each mobileWallets as wallet}
			<button
				onclick={() => handleMobileRedirect(wallet)}
				class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
			>
				<div
					class="h-6 w-6 shrink-0 overflow-hidden rounded-full flex items-center justify-center bg-muted"
				>
					{#if wallet.icon}
						<img
							src={wallet.icon}
							alt={wallet.name}
							class="h-full w-full object-contain"
						/>
					{:else}
						<span class="text-xs font-bold">{wallet.name[0]}</span>
					{/if}
				</div>
				<div class="flex-1">
					<div class="text-sm font-medium">{wallet.name}</div>
					<div class="text-xs text-muted-foreground">{wallet.description}</div>
				</div>
				<ExternalLink class="h-4 w-4 opacity-30" />
			</button>
		{/each}
	</div>
	
	<!-- Copy URL for unlisted wallets -->
	<div class="mt-4 pt-3 border-t border-input">
		<p class="text-xs text-muted-foreground mb-2">
			Wallet not listed? Copy this page's URL and paste it in your wallet's browser:
		</p>
		<button
			onclick={handleCopyUrl}
			class="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
		>
			{#if urlCopied}
				<Check class="h-4 w-4" />
				<span>URL Copied!</span>
			{:else}
				<Copy class="h-4 w-4" />
				<span>Copy URL to Clipboard</span>
			{/if}
		</button>
	</div>
</BasicModal>
