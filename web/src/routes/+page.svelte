<script lang="ts">
	import DefaultHead from '../lib/metadata/DefaultHead.svelte';
	import ConnectionFlow from '$lib/core/connection/ConnectionFlow.svelte';
	import {Button} from '$lib/shadcn/ui/button';
	import {Input} from '$lib/shadcn/ui/input';
	import * as Card from '$lib/shadcn/ui/card';
	import * as Separator from '$lib/shadcn/ui/separator';
	import {Spinner} from '$lib/shadcn/ui/spinner';
	import {MessageSquareIcon, SendIcon, UserIcon} from '@lucide/svelte';
	import {getUserContext} from '$lib';
	import Address from '$lib/core/ui/ethereum/Address.svelte';

	let dependencies = getUserContext();

	let {connection, onchainState, walletClient, deployments} =
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

<ConnectionFlow {connection} />

<div class="container mx-auto max-w-2xl px-4 py-8">
	<div class="space-y-6">
		<!-- Header -->
		<div class="flex flex-col items-center space-y-2">
			<div class="rounded-full bg-primary/10 p-3">
				<MessageSquareIcon class="h-8 w-8 text-primary" />
			</div>
			<h1 class="text-3xl font-bold">Greetings Registry</h1>
			<p class="text-muted-foreground">Share your message with the world</p>
		</div>

		<Separator.Root />

		<!-- Input Section -->
		<Card.Root class="border-2">
			<Card.Header>
				<Card.Title class="text-lg">Set Your Greeting</Card.Title>
				<Card.Description>
					Enter a message to share with everyone
				</Card.Description>
			</Card.Header>
			<Card.Content>
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
					>
						{#if isSubmitting}
							<Spinner class="h-4 w-4" />
						{:else}
							<SendIcon class="h-4 w-4" />
						{/if}
						<span class="ml-2">Send</span>
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<Separator.Root />

		<!-- Messages List -->
		<div class="space-y-4">
			<h2 class="text-xl font-semibold">Recent Messages</h2>

			{#if $onchainState.length === 0}
				<Card.Root class="border-dashed">
					<Card.Content
						class="flex flex-col items-center justify-center py-8"
					>
						<MessageSquareIcon class="mb-4 h-12 w-12 text-muted-foreground" />
						<p class="text-muted-foreground">No messages yet</p>
						<p class="text-sm text-muted-foreground">
							Be the first to share a greeting!
						</p>
					</Card.Content>
				</Card.Root>
			{:else}
				<div class="space-y-3">
					{#each $onchainState as message}
						<Card.Root>
							<Card.Header class="pb-2">
								<div class="flex items-center gap-2">
									<div class="rounded-full bg-muted p-1.5">
										<UserIcon class="h-4 w-4 text-muted-foreground" />
									</div>
									<Address value={message.account} />
								</div>
							</Card.Header>
							<Card.Content class="pb-2">
								<p class="text-lg">{message.message}</p>
							</Card.Content>
							<Card.Footer>
								<p class="text-sm text-muted-foreground">
									{formatRelativeTime(message.timestamp)}
								</p>
							</Card.Footer>
						</Card.Root>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
