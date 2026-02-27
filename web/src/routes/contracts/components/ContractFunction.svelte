<script lang="ts">
	import type {AbiFunction, PublicClient, WalletClient} from 'viem';
	import * as Card from '$lib/shadcn/ui/card';
	import {Button} from '$lib/shadcn/ui/button';
	import FunctionInputs from './FunctionInputs.svelte';
	import {
		formatFunctionSignature,
		isViewFunction,
		convertInputValues,
		formatOutputJSON,
	} from '../lib/utils';
	import {Spinner} from '$lib/shadcn/ui/spinner/index.js';
	import * as Alert from '$lib/shadcn/ui/alert';
	import {CircleAlert, CircleCheck, InfoIcon} from '@lucide/svelte';
	import Address from '$lib/core/ui/ethereum/Address.svelte';
	import type {
		ConnectionStore,
		UnderlyingEthereumProvider,
	} from '@etherplay/connect';

	interface Props {
		functionName: string;
		abiItem: AbiFunction;
		contractAddress: string;
		connection: ConnectionStore<UnderlyingEthereumProvider>;
		publicClient: PublicClient;
		walletClient: WalletClient;
	}

	let {
		functionName,
		abiItem,
		contractAddress,
		connection,
		publicClient,
		walletClient,
	}: Props = $props();

	let inputValues = $state<Record<string, string>>({});
	let inputErrors = $state<Record<string, string>>({});
	let loading = $state(false);
	let result = $state<any>(null);
	let transactionHash = $state<`0x${string}` | null>(null);
	let error = $state<string | null>(null);

	const isView = isViewFunction(abiItem.stateMutability);

	async function handleFetch() {
		if (!publicClient) {
			error = 'Public client not available';
			return;
		}

		loading = true;
		error = null;
		result = null;
		transactionHash = null;

		try {
			const args = convertInputValues(abiItem.inputs, inputValues);

			const data = await publicClient.readContract({
				address: contractAddress as `0x${string}`,
				abi: [abiItem],
				functionName: abiItem.name,
				args: args as any,
			});

			result = data;
		} catch (e: any) {
			error = e.message || 'Failed to fetch value';
			console.error('Error fetching value:', e);
		} finally {
			loading = false;
		}
	}

	async function handleExecute() {
		// Check for validation errors
		const hasErrors = Object.keys(inputErrors).some(
			(key) => inputErrors[key] !== undefined,
		);
		if (hasErrors) {
			error = 'Please fix input errors before executing';
			return;
		}

		loading = true;
		error = null;
		result = null;
		transactionHash = null;

		try {
			const args = convertInputValues(abiItem.inputs, inputValues);

			const currentConnection = await connection.ensureConnected();

			const hash = await walletClient.writeContract({
				address: contractAddress as `0x${string}`,
				abi: [abiItem],
				functionName: abiItem.name,
				args: args as any,
				account: currentConnection.account.address,
				chain: null as any,
			});

			transactionHash = hash;
			result = null;
			error = null;
		} catch (e: any) {
			error = e.message || 'Failed to execute transaction';
			console.error('Error executing transaction:', e);
		} finally {
			loading = false;
		}
	}

	function clearResults() {
		result = null;
		transactionHash = null;
		error = null;
	}
</script>

<Card.Root class="border-2">
	<Card.Header>
		<div class="flex items-start justify-between gap-2">
			<div class="flex-1 space-y-1">
				<Card.Title class="font-mono text-base">
					{functionName}
					<span
						class="ml-2 rounded-full px-2 py-0.5 text-xs font-medium"
						class:bg-muted-foreground={isView}
						class:text-background={isView}
						class:bg-primary={!isView}
						class:text-primary-foreground={!isView}
					>
						{abiItem.stateMutability}
					</span>
				</Card.Title>
				<Card.Description class="font-mono text-xs">
					{formatFunctionSignature(abiItem)}
				</Card.Description>
			</div>
		</div>
	</Card.Header>

	<Card.Content class="space-y-4">
		{#if abiItem.inputs.length > 0}
			<div class="space-y-2">
				<div class="text-sm font-medium">Arguments</div>
				<FunctionInputs
					inputs={abiItem.inputs}
					values={inputValues}
					errors={inputErrors}
				/>
			</div>
		{/if}

		{#if error}
			<Alert.Root variant="destructive" class="max-w-full overflow-hidden">
				<CircleAlert class="h-4 w-4 shrink-0" />
				<Alert.Description
					class="overflow-wrap-break-word max-h-32 min-w-0 overflow-y-auto text-sm wrap-break-word"
					>{error}</Alert.Description
				>
			</Alert.Root>
		{/if}

		{#if result !== null}
			<div class="space-y-2">
				<div
					class="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400"
				>
					<CircleCheck class="h-4 w-4" />
					<span>Result</span>
				</div>
				<pre
					class="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs"><code
						>{formatOutputJSON(result)}</code
					></pre>
			</div>
		{/if}

		{#if transactionHash}
			<Alert.Root>
				<InfoIcon class="h-4 w-4" />
				<Alert.Description class="flex flex-col gap-1 text-sm">
					<span class="font-medium">Transaction submitted</span>
					<Address value={transactionHash} />
				</Alert.Description>
			</Alert.Root>
		{/if}
	</Card.Content>

	<Card.Footer class="flex gap-2">
		{#if isView}
			<Button
				onclick={handleFetch}
				disabled={loading}
				class="flex-1"
				variant={result ? 'outline' : 'default'}
			>
				{#if loading}
					<Spinner />
					Fetching...
				{:else}
					Fetch Value
				{/if}
			</Button>
		{:else}
			<!-- disabled={loading || !walletClient || !account}-->
			<Button
				onclick={handleExecute}
				class="flex-1"
				variant={transactionHash ? 'outline' : 'default'}
			>
				{#if loading}
					<Spinner />
					Executing...
				{:else if $connection.step != 'SignedIn' && $connection.step != 'WalletConnected'}
					Connect + Execute
				{:else}
					Execute
				{/if}
			</Button>
		{/if}

		{#if result !== null || transactionHash !== null}
			<Button onclick={clearResults} variant="ghost" disabled={loading}>
				Clear
			</Button>
		{/if}
	</Card.Footer>
</Card.Root>
