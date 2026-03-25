<script lang="ts">
	import {getUserContext} from '$lib';
	import {onMount} from 'svelte';
	import type {TransactionObserver} from '@etherkit/tx-observer';
	import {slide} from 'svelte/transition';

	const context = getUserContext();
	const {accountData, publicClient} = context;

	let txObserver: TransactionObserver | undefined = $state(undefined);

	// State
	let isMinimized = $state(false);
	let accountOperations = $state<{[id: string]: unknown}>({});
	let lastProcessTime = $state<number | null>(null);
	let processCount = $state(0);
	let eventLog = $state<Array<{timestamp: number; type: string; data: string}>>(
		[],
	);

	function addEvent(type: string, data: unknown) {
		eventLog = [
			{timestamp: Date.now(), type, data: JSON.stringify(data, null, 2)},
			...eventLog.slice(0, 19), // Keep last 20 events
		];
	}

	function formatTimestamp(ts: number): string {
		return new Date(ts).toLocaleTimeString();
	}

	function formatTimeAgo(ts: number): string {
		const diff = Date.now() - ts;
		if (diff < 1000) return 'just now';
		if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
		return `${Math.floor(diff / 3600000)}h ago`;
	}

	function getInclusionBadgeColor(inclusion?: string): string {
		switch (inclusion) {
			case 'Included':
				return 'bg-green-500';
			case 'InMemPool':
				return 'bg-yellow-500';
			case 'NotFound':
				return 'bg-red-500';
			case 'Dropped':
				return 'bg-gray-500';
			default:
				return 'bg-blue-500';
		}
	}

	function getStatusBadgeColor(status?: string): string {
		switch (status) {
			case 'Success':
				return 'bg-green-500';
			case 'Failure':
				return 'bg-red-500';
			default:
				return 'bg-gray-500';
		}
	}

	function refreshData() {
		const currentAccountData = accountData.get()?.get();
		if (currentAccountData?.status === 'ready') {
			accountOperations = structuredClone(currentAccountData.data.operations);
		}
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
	}

	function manualSyncToObserver() {
		if (!txObserver) {
			addEvent('sync', {error: 'txObserver not available'});
			return;
		}

		const currentAccountData = accountData.get()?.get();
		if (currentAccountData?.status !== 'ready') {
			addEvent('sync', {error: 'accountData not ready'});
			return;
		}

		const operations = currentAccountData.data.operations;
		const intentsToAdd: {[id: string]: unknown} = {};

		for (const [id, operation] of Object.entries(operations)) {
			const op = operation as {transactionIntent: unknown};
			intentsToAdd[id] = structuredClone(op.transactionIntent);
		}

		const count = Object.keys(intentsToAdd).length;
		addEvent('sync', {synced: count, ids: Object.keys(intentsToAdd)});

		if (count > 0) {
			txObserver.addMultiple(intentsToAdd as Parameters<typeof txObserver.addMultiple>[0]);
		}
	}

	async function manualProcess() {
		if (!txObserver) {
			addEvent('process', {error: 'txObserver not available'});
			return;
		}

		addEvent('process', {triggering: true});
		const result = txObserver.process();

		if (result && typeof result === 'object' && 'then' in result) {
			try {
				await result;
				addEvent('process', {completed: true});
			} catch (e) {
				addEvent('process', {error: String(e)});
			}
		}
	}

	async function checkTxStatus(hash: `0x${string}`) {
		addEvent('check', {hash: hash.slice(0, 12) + '...'});
		try {
			const receipt = await publicClient.getTransactionReceipt({hash});
			addEvent('check-result', {
				status: 'INCLUDED',
				block: receipt.blockNumber.toString(),
				txStatus: receipt.status,
			});
		} catch {
			try {
				const tx = await publicClient.getTransaction({hash});
				addEvent('check-result', {
					status: 'IN_MEMPOOL',
					nonce: tx.nonce,
				});
			} catch {
				addEvent('check-result', {status: 'NOT_FOUND'});
			}
		}
	}

	onMount(() => {
		txObserver = (globalThis as unknown as {txObserver?: TransactionObserver})
			.txObserver;

		if (!txObserver) {
			console.warn('TxObserverDebugOverlay: txObserver not found');
			return;
		}

		// Hook into intent:status events
		const unsubscribeStatus = txObserver.on('intent:status', (event) => {
			addEvent('intent:status', {
				id: event.id,
				inclusion: event.intent.state?.inclusion,
				status: event.intent.state?.status,
				final: event.intent.state?.final,
			});
			refreshData();
		});

		// Track process calls
		const originalProcess = txObserver.process.bind(txObserver);
		txObserver.process = () => {
			lastProcessTime = Date.now();
			processCount++;
			const result = originalProcess();
			setTimeout(refreshData, 100);
			return result;
		};

		// Initial data load
		refreshData();

		// Subscribe to accountData changes
		const unsubscribeAccountData = accountData.subscribe(() => {
			refreshData();
		});

		// Periodic refresh
		const refreshInterval = setInterval(refreshData, 2000);

		return () => {
			unsubscribeStatus();
			unsubscribeAccountData();
			clearInterval(refreshInterval);
		};
	});
</script>

<div
	class="fixed right-4 bottom-4 z-[9999] max-h-[70vh] w-[420px] overflow-hidden rounded-lg border border-gray-700 bg-gray-900 text-xs text-gray-100 shadow-xl"
	transition:slide
>
	<!-- Header -->
	<div class="flex items-center justify-between bg-gray-800 px-3 py-2">
		<div class="flex items-center gap-2">
			<span class="font-bold text-yellow-400">🔍 TX Debug</span>
			{#if lastProcessTime}
				<span class="text-gray-400 text-[10px]">
					Process: {formatTimeAgo(lastProcessTime)} (#{processCount})
				</span>
			{/if}
		</div>
		<div class="flex items-center gap-1">
			<button
				class="rounded px-2 py-1 hover:bg-gray-700 text-[10px]"
				title="Sync operations to observer"
				onclick={() => manualSyncToObserver()}
			>
				⚡ Sync
			</button>
			<button
				class="rounded px-2 py-1 hover:bg-gray-700 text-[10px]"
				title="Trigger observer.process()"
				onclick={() => manualProcess()}
			>
				▶️ Process
			</button>
			<button
				class="rounded px-2 py-1 hover:bg-gray-700"
				onclick={() => refreshData()}
			>
				🔄
			</button>
			<button
				class="rounded px-2 py-1 hover:bg-gray-700"
				onclick={() => (isMinimized = !isMinimized)}
			>
				{isMinimized ? '▲' : '▼'}
			</button>
		</div>
	</div>

	{#if !isMinimized}
		<div class="max-h-[55vh] overflow-y-auto p-3">
			<!-- Account Operations Section -->
			<div class="mb-3">
				<h3 class="mb-2 font-bold text-blue-400">
					📋 Operations ({Object.keys(accountOperations).length})
				</h3>
				{#if Object.keys(accountOperations).length === 0}
					<p class="text-gray-500 italic">No operations</p>
				{:else}
					<div class="space-y-2">
						{#each Object.entries(accountOperations) as [id, op]}
							{@const operation = op as {
								metadata: {
									functionName?: string;
								};
								transactionIntent: {
									state?: {
										inclusion?: string;
										status?: string;
										final?: boolean;
									};
									transactions: Array<{
										hash: string;
										nonce: number;
										broadcastTimestampMs: number;
									}>;
								};
							}}
							<div class="rounded border border-gray-700 bg-gray-800 p-2">
								<div class="flex items-center justify-between mb-1">
									<span class="font-mono text-[10px] text-gray-400">{id}</span>
									<div class="flex gap-1">
										<span
											class="rounded px-1.5 py-0.5 text-[10px] font-bold {getInclusionBadgeColor(
												operation.transactionIntent.state?.inclusion,
											)}"
										>
											{operation.transactionIntent.state?.inclusion ?? 'No State'}
										</span>
										{#if operation.transactionIntent.state?.status}
											<span
												class="rounded px-1.5 py-0.5 text-[10px] font-bold {getStatusBadgeColor(
													operation.transactionIntent.state?.status,
												)}"
											>
												{operation.transactionIntent.state?.status}
											</span>
										{/if}
										{#if operation.transactionIntent.state?.final}
											<span class="rounded bg-purple-500 px-1.5 py-0.5 text-[10px] font-bold">
												Final
											</span>
										{/if}
									</div>
								</div>
								<div class="text-gray-400 text-[10px] mb-1">
									{operation.metadata.functionName ?? 'unknown'}
								</div>
								{#each operation.transactionIntent.transactions as tx}
									<div class="flex items-center gap-1 text-gray-400">
										<button
											type="button"
											class="font-mono text-[10px] text-blue-400 hover:underline"
											onclick={() => copyToClipboard(tx.hash)}
										>
											{tx.hash.slice(0, 14)}...{tx.hash.slice(-6)}
										</button>
										<button
											type="button"
											class="rounded bg-gray-700 px-1 text-[9px] text-yellow-400 hover:bg-gray-600"
											onclick={() => checkTxStatus(tx.hash as `0x${string}`)}
										>
											🔎
										</button>
										<span class="text-[9px] text-gray-500">
											n:{tx.nonce}
										</span>
									</div>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Event Log Section -->
			<div>
				<h3 class="mb-2 font-bold text-orange-400">
					📝 Events ({eventLog.length})
				</h3>
				{#if eventLog.length === 0}
					<p class="text-gray-500 italic">No events yet</p>
				{:else}
					<div class="max-h-32 space-y-1 overflow-y-auto">
						{#each eventLog as event}
							<div class="rounded border border-gray-700 bg-gray-800 p-1.5">
								<div class="flex items-center gap-2">
									<span class="text-gray-500 text-[9px]">
										{formatTimestamp(event.timestamp)}
									</span>
									<span class="font-bold text-yellow-400 text-[10px]">{event.type}</span>
								</div>
								<pre class="mt-0.5 overflow-x-auto text-[9px] text-gray-400">{event.data}</pre>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
