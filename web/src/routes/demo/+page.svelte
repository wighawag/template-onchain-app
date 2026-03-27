<script lang="ts">
	import DefaultHead from '../../lib/metadata/DefaultHead.svelte';
	import {Button} from '$lib/shadcn/ui/button';
	import {Input} from '$lib/shadcn/ui/input';
	import {Spinner} from '$lib/shadcn/ui/spinner';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import SendIcon from '@lucide/svelte/icons/send';
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import {getUserContext} from '$lib';
	import Address from '$lib/core/ui/ethereum/Address.svelte';
	import BlockieAvatar from '$lib/core/ui/ethereum/BlockieAvatar.svelte';
	import {ensureCanAfford, InsufficientFundsError} from '$lib/core/transaction';

	const {
		connection,
		onchainState,
		viewState,
		walletClient,
		deployments,
		clock,
		publicClient,
		balance,
		gasFee,
	} = getUserContext();

	const viewStatus = viewState.status;

	// Derive stale message so it updates when status store updates
	// Note: clock will become a store that updates every second in the future
	let staleMessage = $derived(
		getStaleMessage($viewStatus.lastSuccessfulFetch, clock.now()),
	);

	let greetingInput = $state('');
	let isSubmitting = $state(false);

	async function setGreeting() {
		if (!greetingInput.trim() || isSubmitting) return;

		isSubmitting = true;
		try {
			const currentConnection = await connection.ensureConnected();

			const contractRequest = await ensureCanAfford({
				publicClient,
				balance,
				gasFee,
				contract: {
					...deployments.current.contracts.GreetingsRegistry,
					functionName: 'setMessage',
					args: [greetingInput],
					account: currentConnection.account.address,
				},
			});

			await walletClient.writeContract(contractRequest as any);
			greetingInput = '';
		} catch (error) {
			if (error instanceof InsufficientFundsError) {
				// User dismissed the modal - silently cancel
				return;
			}
			console.error('Failed to set greeting:', error);
		} finally {
			isSubmitting = false;
		}
	}

	function formatRelativeTime(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;

		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
		if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
		if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
		return 'Just now';
	}

	function getStaleMessage(
		lastSuccessfulFetch: number | undefined,
		now: number,
	): string | undefined {
		if (!lastSuccessfulFetch) return undefined;

		const diff = now - lastSuccessfulFetch;
		const seconds = Math.floor(diff / 1000);

		// Only show stale message if it's been more than 30 seconds
		if (seconds < 30) return undefined;

		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) return `Data is ${hours} hour${hours > 1 ? 's' : ''} old`;
		if (minutes > 0)
			return `Data is ${minutes} minute${minutes > 1 ? 's' : ''} old`;
		return `Data is ${seconds} seconds old`;
	}
</script>

<DefaultHead title={'Demo - Greetings Registry'} />

<div class="container mx-auto max-w-2xl px-4 py-8">
	<div class="space-y-6">
		<!-- Title Section -->
		<div class="text-center">
			<h1 class="text-3xl font-bold tracking-tight">Greetings Registry</h1>
			<p class="mt-2 text-muted-foreground">
				This is a demo of a simple on-chain greetings registry. Connect your
				wallet and share your greeting with the world!
			</p>
		</div>

		<!-- Input Section -->
		<form
			class="flex gap-2"
			onsubmit={(e) => {
				e.preventDefault();
				setGreeting();
			}}
		>
			<Input
				type="text"
				placeholder="Enter your greeting..."
				bind:value={greetingInput}
				disabled={isSubmitting}
				class="flex-1"
			/>
			<Button
				type="submit"
				disabled={isSubmitting || !greetingInput.trim()}
				size="sm"
			>
				{#if isSubmitting}
					<Spinner class="h-4 w-4" />
				{:else}
					<SendIcon class="h-4 w-4" />
				{/if}
				<span class="ml-1">Send</span>
			</Button>
		</form>

		<!-- Messages List -->
		<div class="space-y-3">
			{#if $viewStatus.error && $viewState.step === 'Unloaded'}
				<!-- Error on initial load -->
				<div
					class="flex flex-col items-center justify-center py-8 text-destructive"
				>
					<AlertCircleIcon class="mb-3 h-10 w-10" />
					<p class="text-base">Failed to load messages</p>
					<p
						class="line-clamp-3 max-w-full overflow-hidden text-sm wrap-break-word text-ellipsis text-muted-foreground"
					>
						{$viewStatus.error.message}
					</p>
					<Button
						variant="outline"
						onclick={() => onchainState.update()}
						class="mt-4"
					>
						Retry
					</Button>
				</div>
			{:else if $viewState.step === 'Unloaded' && $viewStatus.loading}
				<!-- Initial loading -->
				<div
					class="flex flex-col items-center justify-center py-8 text-muted-foreground"
				>
					<Spinner class="mb-3 h-10 w-10" />
					<p class="text-base">Loading messages...</p>
				</div>
			{:else if $viewState.step === 'Unloaded'}
				<!-- Unloaded fallback -->
				<div
					class="flex flex-col items-center justify-center py-8 text-muted-foreground"
				>
					<MessageSquareIcon class="mb-3 h-10 w-10" />
					<p class="text-base">No messages yet. Be the first!</p>
				</div>
			{:else}
				<!-- Loaded - $viewState.step === 'Loaded' -->
				{#if $viewState.messages.length === 0}
					<div
						class="flex flex-col items-center justify-center py-8 text-muted-foreground"
					>
						<MessageSquareIcon class="mb-3 h-10 w-10" />
						<p class="text-base">No messages yet. Be the first!</p>
					</div>
				{:else}
					{#each $viewState.messages as message}
						<div
							class="flex items-center gap-3 rounded-lg border px-4 py-3 sm:gap-4"
						>
							<BlockieAvatar
								address={message.account}
								class="h-8 w-8 shrink-0 rounded-full"
								showAddressOnTap
							/>
							<Address
								value={message.account}
								class="hidden shrink-0 text-sm sm:inline-flex"
							/>
							<p class="min-w-0 flex-1 truncate text-base">{message.message}</p>
							<span
								class="overflow-hidden text-sm whitespace-nowrap text-muted-foreground"
							>
								{#if message.pending}
									<Spinner class="h-4 w-4" />
								{:else}
									{formatRelativeTime(message.timestamp)}
								{/if}
							</span>
						</div>
					{/each}
				{/if}

				<!-- Refresh indicator -->
				<!-- {#if $viewStatus.loading}
					<div class="py-2 text-center text-sm text-muted-foreground">
						Refreshing...
					</div>
				{/if} -->

				<!-- Refresh error -->
				{#if $viewStatus.error}
					<div
						class="flex flex-col items-center justify-center gap-1 py-3 text-destructive"
					>
						<div class="flex items-center gap-2">
							<AlertCircleIcon class="h-5 w-5 shrink-0" />
							<span class="text-sm">Refresh failed, will retry</span>
							<Button
								variant="outline"
								size="sm"
								onclick={() => onchainState.update()}
							>
								Retry Now
							</Button>
						</div>
						{#if staleMessage}
							<span class="text-xs text-muted-foreground">{staleMessage}</span>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
