<script lang="ts">
	import DefaultHead from '../lib/metadata/DefaultHead.svelte';
	import ConnectionFlow from '$lib/core/connection/ConnectionFlow.svelte';
	import {Button} from '$lib/shadcn/ui/button';
	import {Input} from '$lib/shadcn/ui/input';
	import {Spinner} from '$lib/shadcn/ui/spinner';
	import {MessageSquareIcon, SendIcon} from '@lucide/svelte';
	import {getUserContext} from '$lib';
	import Address from '$lib/core/ui/ethereum/Address.svelte';
	import ImgBlockie from '$lib/core/ui/ethereum/ImgBlockie.svelte';
	import DebugOperations from '$lib/ui/debug/DebugOperations.svelte';

	let dependencies = getUserContext();

	let {connection, onchainState, viewState, walletClient, deployments} =
		$derived(dependencies);

	let greetingInput = $state('');
	let isSubmitting = $state(false);

	// Fetch messages on mount
	$effect(() => {
		onchainState.update();
	});

	async function setGreeting() {
		if (!greetingInput.trim() || isSubmitting) return;

		isSubmitting = true;
		try {
			const currentConnection = await connection.ensureConnected();

			await walletClient.writeContract({
				...deployments.current.contracts.GreetingsRegistry,
				functionName: 'setMessage',
				args: [greetingInput],
				account: currentConnection.account.address,
				chain: null as any,
			});
			greetingInput = '';
			// Refresh messages after a short delay to allow transaction to be mined
			setTimeout(() => onchainState.update(), 2000);
		} catch (error) {
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
</script>

<DefaultHead title={'Greetings Registry'} />

<DebugOperations />

<ConnectionFlow {connection} />

<div class="container mx-auto max-w-2xl px-4 py-2">
	<div class="space-y-2">
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
		<div class="space-y-1">
			{#if $viewState.length === 0}
				<div
					class="flex flex-col items-center justify-center py-6 text-muted-foreground"
				>
					<MessageSquareIcon class="mb-2 h-8 w-8" />
					<p class="text-sm">No messages yet. Be the first!</p>
				</div>
			{:else}
				{#each $viewState as message}
					<div
						class="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm sm:gap-2"
					>
						<ImgBlockie
							address={message.account}
							class="h-5 w-5 shrink-0 rounded-full"
						/>
						<Address
							value={message.account}
							class="hidden shrink-0 text-xs sm:inline-flex"
						/>
						<p class="min-w-0 flex-1 truncate">{message.message}</p>
						<span
							class="overflow-hidden text-xs whitespace-nowrap text-muted-foreground"
						>
							{formatRelativeTime(message.timestamp)}
						</span>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>
