<script lang="ts">
	import {page} from '$app/stores';
	import DefaultHead from '../../../metadata/DefaultHead.svelte';
	import ConnectionFlow from '$lib/core/connection/ConnectionFlow.svelte';
	import {getUserContext} from '$lib';
	import * as Card from '$lib/shadcn/ui/card';
	import * as Alert from '$lib/shadcn/ui/alert';
	import * as Separator from '$lib/shadcn/ui/separator';
	import {Button} from '$lib/shadcn/ui/button';
	import {Spinner} from '$lib/shadcn/ui/spinner/index.js';
	import * as Empty from '$lib/shadcn/ui/empty';
	import {
		Root as Tabs,
		Content as TabsContent,
		List as TabsList,
		Trigger as TabsTrigger,
	} from '$lib/shadcn/ui/tabs';
	import {
		ArrowLeftIcon,
		WalletIcon,
		FileCodeIcon,
		CopyIcon,
		ExpandIcon,
		ChevronsDownIcon,
	} from '@lucide/svelte';
	import Address from '$lib/core/ui/ethereum/Address.svelte';
	import ContractFunction from '../../../contracts/components/ContractFunction.svelte';
	import {getContractFunctions, isViewFunction} from '../../../contracts/lib/utils';
	import type {PublicClient, WalletClient} from 'viem';
	import type {AbiFunction} from 'viem';
	import {
		findContractByAddress,
		isContract,
		formatBytecode,
	} from '../../lib/utils';
	import {formatEther} from 'viem';

	let dependencies = getUserContext();
	let {publicClient, walletClient, connection} = $derived(dependencies);

	const address = $derived($page.params.address as `0x${string}`);

	let balance = $state<bigint>(0n);
	let nonce = $state<number>(0);
	let code = $state<`0x${string}`>('0x');
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Contract info if found in deployments
	let contractInfo = $state<ReturnType<typeof findContractByAddress>>(null);
	let contractFunctions = $state<AbiFunction[]>([]);
	let viewFunctions = $derived(contractFunctions.filter((f) => isViewFunction(f.stateMutability)));
	let writeFunctions = $derived(contractFunctions.filter((f) => !isViewFunction(f.stateMutability)));

	// Bytecode expansion
	let bytecodeExpanded = $state(false);

	async function fetchAddressData() {
		if (!publicClient) {
			error = 'Public client not available';
			loading = false;
			return;
		}

		loading = true;
		error = null;

		try {
			// Fetch balance
			balance = await publicClient.getBalance({address});

			// Fetch nonce
			nonce = await publicClient.getTransactionCount({address});

			// Fetch code
			code = (await publicClient.getCode({address})) ?? '0x';

			// Check if contract in deployments
			if (isContract(code)) {
				contractInfo = findContractByAddress(address);
				if (contractInfo) {
					contractFunctions = getContractFunctions(contractInfo.abi);
				}
			}
		} catch (e: any) {
			error = e.message || 'Failed to fetch address data';
			console.error('Error fetching address:', e);
		} finally {
			loading = false;
		}
	}

	// Fetch on mount
	$effect(() => {
		fetchAddressData();
	});

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
	}
</script>

<DefaultHead title={'Address Explorer'} />

<ConnectionFlow {connection} />

<div class="container mx-auto max-w-5xl px-4 py-8">
	{#if loading}
		<div class="flex flex-col items-center justify-center py-20">
			<Spinner />
			<p class="mt-4 text-muted-foreground">Loading address...</p>
		</div>
	{:else if error}
		<Alert.Root variant="destructive">
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
	{:else}
		<div class="space-y-6">
			<!-- Header -->
			<div class="flex items-center justify-between">
				<div>
					<div class="flex items-center gap-2">
						{#if isContract(code)}
							<div class="rounded-full bg-blue-500/10 p-2">
								<FileCodeIcon class="h-5 w-5 text-blue-500" />
							</div>
							<h1 class="text-2xl font-bold">Smart Contract</h1>
						{:else}
							<div class="rounded-full bg-green-500/10 p-2">
								<WalletIcon class="h-5 w-5 text-green-500" />
							</div>
							<h1 class="text-2xl font-bold">Address</h1>
						{/if}
					</div>
					<div class="flex items-center gap-2 mt-2">
						<Address value={address} />
						<Button
							onclick={() => copyToClipboard(address)}
							variant="ghost"
							size="icon"
							class="h-6 w-6"
						>
							<CopyIcon class="h-3 w-3" />
						</Button>
					</div>
					{#if contractInfo}
						<div class="text-sm text-muted-foreground mt-1">
							Contract: {contractInfo.name}
						</div>
					{/if}
				</div>
				<Button onclick={() => window.history.back()} variant="outline" size="sm">
					<ArrowLeftIcon class="mr-2 h-4 w-4" />
					Back
				</Button>
			</div>

			<Separator.Root />

			<!-- Address Details -->
			<Card.Root>
				<Card.Header>
					<Card.Title>Address Details</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="grid gap-4 md:grid-cols-3">
						<div>
							<div class="text-sm font-medium text-muted-foreground">Balance</div>
							<div class="font-mono text-lg">{formatEther(balance)} ETH</div>
						</div>
						<div>
							<div class="text-sm font-medium text-muted-foreground">Nonce</div>
							<div class="font-mono text-lg">{nonce}</div>
						</div>
						<div>
							<div class="text-sm font-medium text-muted-foreground">Type</div>
							<div class="font-mono text-lg">
								{#if isContract(code)}
									Contract ({code.length / 2 - 1} bytes)
								{:else}
									EOA (Externally Owned Account)
								{/if}
							</div>
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Contract Code -->
			{#if isContract(code)}
				<Card.Root>
					<Card.Header>
						<div class="flex items-center justify-between">
							<Card.Title>Contract Bytecode</Card.Title>
							{#if !bytecodeExpanded && code.length > 400}
								<Button
									onclick={() => (bytecodeExpanded = true)}
									variant="ghost"
									size="sm"
								>
									<ExpandIcon class="mr-2 h-4 w-4" />
									Show Full Code
								</Button>
							{:else if code.length > 400}
								<Button
									onclick={() => (bytecodeExpanded = false)}
									variant="ghost"
									size="sm"
								>
									<ChevronsDownIcon class="mr-2 h-4 w-4" />
									Collapse
								</Button>
							{/if}
						</div>
					</Card.Header>
					<Card.Content>
						<pre class="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs break-all"><code
							>{bytecodeExpanded ? code : formatBytecode(code)}</code
						></pre>
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Contract Interaction -->
			{#if contractInfo}
				{#if contractFunctions.length > 0}
					<Tabs value="read">
						<TabsList class="mb-6">
							<TabsTrigger value="read">Read Functions</TabsTrigger>
							<TabsTrigger value="write">Write Functions</TabsTrigger>
						</TabsList>

						<TabsContent value="read">
							{#if viewFunctions.length > 0}
								<div class="space-y-4">
									<h3 class="text-lg font-semibold">View Functions</h3>
									<div class="grid gap-4 md:grid-cols-2">
										{#each viewFunctions as func (func.name)}
											<ContractFunction
												functionName={func.name}
												abiItem={func}
												contractAddress={address}
												{connection}
												{publicClient}
												{walletClient}
											/>
										{/each}
									</div>
								</div>
							{:else}
								<Empty.Root>
									<Empty.Header>
										<Empty.Title>No Read Functions</Empty.Title>
										<Empty.Description>
											This contract has no view functions.
										</Empty.Description>
									</Empty.Header>
								</Empty.Root>
							{/if}
						</TabsContent>

						<TabsContent value="write">
							{#if writeFunctions.length > 0}
								<div class="space-y-4">
									<h3 class="text-lg font-semibold">Write Functions</h3>
									<div class="grid gap-4 md:grid-cols-2">
										{#each writeFunctions as func (func.name)}
											<ContractFunction
												functionName={func.name}
												abiItem={func}
												contractAddress={address}
												{connection}
												{publicClient}
												{walletClient}
											/>
										{/each}
									</div>
								</div>
							{:else}
								<Empty.Root>
									<Empty.Header>
										<Empty.Title>No Write Functions</Empty.Title>
										<Empty.Description>
											This contract has no write functions.
										</Empty.Description>
									</Empty.Header>
								</Empty.Root>
							{/if}
						</TabsContent>
					</Tabs>
				{:else}
					<Card.Root>
						<Card.Content class="py-8">
							<Empty.Root>
								<Empty.Header>
									<Empty.Media variant="icon">
										<FileCodeIcon />
									</Empty.Media>
									<Empty.Title>No Contract Functions</Empty.Title>
									<Empty.Description>
										This contract is deployed but has no callable functions in its ABI.
									</Empty.Description>
								</Empty.Header>
							</Empty.Root>
						</Card.Content>
					</Card.Root>
				{/if}
			{:else if isContract(code)}
				<Alert.Root>
					<FileCodeIcon class="h-4 w-4" />
					<Alert.Description>
						This is a smart contract, but it is not in the deployments file. Only the bytecode is
						available for viewing.
					</Alert.Description>
				</Alert.Root>
			{/if}
		</div>
	{/if}
</div>