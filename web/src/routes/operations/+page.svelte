<script lang="ts">
	import DefaultHead from '$lib/metadata/DefaultHead.svelte';
	import ConnectionFlow from '$lib/core/connection/ConnectionFlow.svelte';
	import {getUserContext, route} from '$lib';
	import * as Card from '$lib/shadcn/ui/card';
	import * as Empty from '$lib/shadcn/ui/empty';
	import * as Separator from '$lib/shadcn/ui/separator';
	import {Badge} from '$lib/shadcn/ui/badge';
	import {Button} from '$lib/shadcn/ui/button';
	import {
		ListIcon,
		ExternalLinkIcon,
		XIcon,
		ArrowUpIcon,
		ClockIcon,
		CircleCheckIcon,
		TriangleAlertIcon,
		CircleXIcon,
		CircleQuestionMarkIcon,
	} from '@lucide/svelte';
	import type {OnchainOperation, AccountData} from '$lib/account/AccountData';
	import type {AsyncState} from '$lib/core/account/createAccountStore';
	import type {
		TransactionIntent,
		TransactionIntentStatus,
	} from '@etherkit/tx-observer';

	const {connection, accountData, account, deployments} = getUserContext();

	// Reactive state from accountData
	let accountDataState = $state<AsyncState<AccountData>>({
		status: 'idle',
		account: undefined,
	});

	// Subscribe to accountData state changes
	$effect(() => {
		// Capture the current accountData reference
		const currentAccountData = accountData;
		// Set initial state
		accountDataState = currentAccountData.state;
		// Subscribe to updates
		const unsubscribe = currentAccountData.on('state', (state) => {
			accountDataState = state;
		});
		return unsubscribe;
	});

	// Derive operations from state
	let operations = $derived.by(() => {
		if (accountDataState.status === 'ready') {
			return Object.entries(accountDataState.data.operations).map(
				([id, op]) => ({
					id: Number(id),
					operation: op as OnchainOperation,
				}),
			);
		}
		return [];
	});

	// Get current account
	let currentAccount = $derived($account);

	// Helper to get block explorer URL based on chain ID
	function getExplorerTxUrl(hash: string): string {
		// Use the internal explorer
		return route(`/explorer/tx/${hash}`);
	}

	// Helper to get status info (label, color, icon)
	function getStatusInfo(intent: TransactionIntent): {
		label: string;
		variant: 'default' | 'secondary' | 'destructive' | 'outline';
		icon: typeof CircleCheckIcon;
	} {
		const state = intent.state;

		if (!state || state.inclusion === 'InMemPool') {
			return {
				label: 'Pending',
				variant: 'secondary',
				icon: ClockIcon,
			};
		}

		if (state.inclusion === 'NotFound') {
			return {
				label: 'Not Found',
				variant: 'destructive',
				icon: CircleQuestionMarkIcon,
			};
		}

		if (state.inclusion === 'Dropped') {
			return {
				label: 'Dropped',
				variant: 'destructive',
				icon: TriangleAlertIcon,
			};
		}

		if (state.inclusion === 'Included') {
			if (state.status === 'Success') {
				return {
					label: 'Success',
					variant: 'default',
					icon: CircleCheckIcon,
				};
			} else {
				return {
					label: 'Failed',
					variant: 'destructive',
					icon: CircleXIcon,
				};
			}
		}

		return {
			label: 'Unknown',
			variant: 'outline',
			icon: CircleQuestionMarkIcon,
		};
	}

	// Get the main transaction hash (from attemptIndex if included, otherwise first)
	function getMainTxHash(intent: TransactionIntent): string | undefined {
		if (intent.transactions.length === 0) return undefined;

		const state = intent.state;
		if (state?.inclusion === 'Included' && state.attemptIndex !== undefined) {
			return intent.transactions[state.attemptIndex]?.hash;
		}

		// Return the first transaction's hash
		return intent.transactions[0]?.hash;
	}

	// Get operation name from metadata
	function getOperationName(op: OnchainOperation): string {
		const metadata = op.metadata;
		if (metadata.type === 'functionCall') {
			return metadata.functionName;
		}
		if (metadata.type === 'unknown') {
			return metadata.name;
		}
		return 'Unknown Operation';
	}

	// Format timestamp
	function formatTimestamp(timestampMs: number): string {
		const date = new Date(timestampMs);
		return date.toLocaleString();
	}

	// Dismiss operation (remove from store)
	async function dismissOperation(id: number) {
		if (!currentAccount) return;
		await accountData.removeOperation(currentAccount, id);
	}

	// Bump gas price (placeholder - to be implemented)
	async function bumpGasPrice(id: number) {
		// TODO: Implement gas price bumping
		// This would require:
		// 1. Getting the original transaction params
		// 2. Creating a new transaction with higher gas price and same nonce
		// 3. Broadcasting the replacement transaction
		alert('Bump gas price feature coming soon!');
	}

	// Check if transaction needs action
	function needsBumpGas(state: TransactionIntentStatus | undefined): boolean {
		return !state || state.inclusion === 'InMemPool';
	}

	function needsDismiss(state: TransactionIntentStatus | undefined): boolean {
		return state?.inclusion === 'NotFound' || state?.inclusion === 'Dropped';
	}
</script>

<DefaultHead title={'Operations'} />

<ConnectionFlow {connection} />

<div class="container mx-auto max-w-5xl px-4 py-8">
	<div class="space-y-6">
		<div class="flex flex-col items-center space-y-2">
			<div class="rounded-full bg-primary/10 p-3">
				<ListIcon class="h-8 w-8 text-primary" />
			</div>
			<h1 class="text-3xl font-bold">Operations</h1>
			<p class="text-muted-foreground">
				Track your pending and completed blockchain operations
			</p>
		</div>

		<Separator.Root />

		{#if accountDataState.status === 'idle'}
			<Empty.Root class="min-h-[400px]">
				<Empty.Header>
					<Empty.Media variant="icon">
						<ListIcon />
					</Empty.Media>
					<Empty.Title>No Account Connected</Empty.Title>
					<Empty.Description>
						Connect your wallet to view your operations.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else if accountDataState.status === 'loading'}
			<div class="flex flex-col items-center justify-center py-12">
				<div
					class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
				></div>
				<p class="mt-4 text-muted-foreground">Loading operations...</p>
			</div>
		{:else if operations.length === 0}
			<Empty.Root class="min-h-[400px]">
				<Empty.Header>
					<Empty.Media variant="icon">
						<ListIcon />
					</Empty.Media>
					<Empty.Title>No Operations</Empty.Title>
					<Empty.Description>
						You haven't performed any operations yet. Once you interact with
						contracts, your transactions will appear here.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<div class="space-y-4">
				{#each operations as { id, operation } (id)}
					{@const statusInfo = getStatusInfo(operation.transactionIntent)}
					{@const StatusIcon = statusInfo.icon}
					{@const txHash = getMainTxHash(operation.transactionIntent)}
					{@const state = operation.transactionIntent.state}
					{@const firstTx = operation.transactionIntent.transactions[0]}

					<Card.Root>
						<Card.Header class="pb-2">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<StatusIcon class="h-5 w-5" />
									<Card.Title class="text-lg">
										{getOperationName(operation)}
									</Card.Title>
								</div>
								<Badge variant={statusInfo.variant}>
									{statusInfo.label}
								</Badge>
							</div>
							{#if firstTx}
								<Card.Description>
									{formatTimestamp(firstTx.broadcastTimestampMs)}
								</Card.Description>
							{/if}
						</Card.Header>

						<Card.Content>
							<div class="space-y-3">
								<!-- Transaction Details -->
								{#if operation.transactionIntent.transactions.length === 1 && txHash}
									<div class="flex items-center gap-2 text-sm">
										<span class="text-muted-foreground">Transaction:</span>
										<code class="rounded bg-muted px-2 py-1 font-mono text-xs">
											{txHash.slice(0, 10)}...{txHash.slice(-8)}
										</code>
										{#if state?.inclusion === 'Included'}
											<a
												href={getExplorerTxUrl(txHash)}
												class="inline-flex items-center gap-1 text-primary hover:underline"
											>
												<ExternalLinkIcon class="h-4 w-4" />
												View
											</a>
										{/if}
									</div>
								{:else if operation.transactionIntent.transactions.length > 1}
									<div class="text-sm text-muted-foreground">
										{operation.transactionIntent.transactions.length} transaction
										attempts
									</div>
									<div class="space-y-1">
										{#each operation.transactionIntent.transactions as tx, i}
											<div class="flex items-center gap-2 text-sm">
												<span class="text-muted-foreground">#{i + 1}:</span>
												<code
													class="rounded bg-muted px-2 py-1 font-mono text-xs"
												>
													{tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
												</code>
												{#if state?.inclusion === 'Included' && state.attemptIndex === i}
													<Badge variant="default" class="text-xs"
														>Included</Badge
													>
													<a
														href={getExplorerTxUrl(tx.hash)}
														class="inline-flex items-center gap-1 text-primary hover:underline"
													>
														<ExternalLinkIcon class="h-4 w-4" />
														View
													</a>
												{/if}
											</div>
										{/each}
									</div>
								{/if}

								<!-- Finality info -->
								{#if state?.final !== undefined}
									<div class="text-sm text-muted-foreground">
										Finalized at block {state.final}
									</div>
								{/if}

								<!-- Operation metadata args (for function calls) -->
								{#if operation.metadata.type === 'functionCall' && operation.metadata.args && operation.metadata.args.length > 0}
									<details class="text-sm">
										<summary
											class="cursor-pointer text-muted-foreground hover:text-foreground"
										>
											Show arguments ({operation.metadata.args.length})
										</summary>
										<pre
											class="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(
												operation.metadata.args,
												null,
												2,
											)}</pre>
									</details>
								{/if}
							</div>
						</Card.Content>

						{#if needsBumpGas(state) || needsDismiss(state)}
							<Card.Footer class="flex justify-end gap-2">
								{#if needsBumpGas(state)}
									<Button
										variant="outline"
										size="sm"
										onclick={() => bumpGasPrice(id)}
									>
										<ArrowUpIcon class="mr-1 h-4 w-4" />
										Bump Gas
									</Button>
								{/if}
								{#if needsDismiss(state)}
									<Button
										variant="destructive"
										size="sm"
										onclick={() => dismissOperation(id)}
									>
										<XIcon class="mr-1 h-4 w-4" />
										Dismiss
									</Button>
								{/if}
							</Card.Footer>
						{/if}
					</Card.Root>
				{/each}
			</div>
		{/if}
	</div>
</div>
