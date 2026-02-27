<script lang="ts">
	import DefaultHead from '../metadata/DefaultHead.svelte';
	import ConnectionFlow from '$lib/core/connection/ConnectionFlow.svelte';
	import {getUserContext} from '$lib';
	import {Root as Tabs, Content as TabsContent, List as TabsList, Trigger as TabsTrigger} from '$lib/shadcn/ui/tabs';
	import * as Empty from '$lib/shadcn/ui/empty';
	import * as Separator from '$lib/shadcn/ui/separator';
	import {FileCodeIcon} from '@lucide/svelte';
	import ContractFunction from './components/ContractFunction.svelte';
	import {getContractFunctions, isViewFunction} from './lib/utils';

	let dependencies = getUserContext();

	let {publicClient, walletClient, connection, account, deployments} = $derived(
		dependencies
	);

	// Get all contract names
	let contractNames = $derived(Object.keys($deployments.contracts));

	// Get the account value
	let accountValue = $derived($account);

	// Get all functions for each contract
	let contractFunctions = $derived(
		contractNames.map((name) => ({
			name,
			address: $deployments.contracts[name as keyof typeof $deployments.contracts].address,
			abi: $deployments.contracts[name as keyof typeof $deployments.contracts].abi,
			functions: getContractFunctions($deployments.contracts[name as keyof typeof $deployments.contracts].abi)
		}))
	);

	// Split functions into view and write
	let contractFunctionGroups = $derived(
		contractFunctions.map((contract) => ({
			...contract,
			viewFunctions: contract.functions.filter((f) =>
				isViewFunction(f.stateMutability)
			),
			writeFunctions: contract.functions.filter(
				(f) => !isViewFunction(f.stateMutability)
			)
		}))
	);
</script>

<DefaultHead title={'Contracts'} />

<ConnectionFlow connection={connection} />

<div class="container mx-auto max-w-5xl px-4 py-8">
	{#if contractNames.length === 0}
		<Empty.Root class="min-h-[400px]">
			<Empty.Header>
				<Empty.Media variant="icon">
					<FileCodeIcon />
				</Empty.Media>
				<Empty.Title>No Contracts Found</Empty.Title>
				<Empty.Description>
					There are no deployed contracts available on this network.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div class="space-y-6">
			<div class="flex flex-col items-center space-y-2">
				<div class="rounded-full bg-primary/10 p-3">
					<FileCodeIcon class="h-8 w-8 text-primary" />
				</div>
				<h1 class="text-3xl font-bold">Contracts</h1>
				<p class="text-muted-foreground">
					Interact with deployed smart contracts
				</p>
			</div>

			<Separator.Root />

			<Tabs>
				<TabsList class="mb-6">
					{#each contractFunctionGroups as contract (contract.name)}
						<TabsTrigger value={contract.name}>
							{contract.name}
						</TabsTrigger>
					{/each}
				</TabsList>

				{#each contractFunctionGroups as contract (contract.name)}
					<TabsContent value={contract.name}>
						<div class="space-y-6">
							<div class="rounded-lg bg-muted/50 p-4">
								<h2 class="text-xl font-semibold">{contract.name}</h2>
								<p class="text-sm text-muted-foreground">
									Address: {contract.address}
								</p>
							</div>

							{#if contract.viewFunctions.length === 0 &&
							contract.writeFunctions.length === 0}
								<Empty.Root>
									<Empty.Header>
										<Empty.Title>No Functions Found</Empty.Title>
										<Empty.Description>
											This contract has no callable functions.
										</Empty.Description>
									</Empty.Header>
								</Empty.Root>
							{:else}
								<Tabs value="read">
									<TabsList class="mb-6">
										<TabsTrigger value="read">Read</TabsTrigger>
										<TabsTrigger value="write">Write</TabsTrigger>
									</TabsList>

									<TabsContent value="read">
										{#if contract.viewFunctions.length > 0}
											<div class="space-y-4">
												<h3 class="text-lg font-semibold">View Functions</h3>
												<div class="grid gap-4 md:grid-cols-2">
													{#each contract.viewFunctions as func (func.name)}
														<ContractFunction
															functionName={func.name}
															abiItem={func}
															contractAddress={contract.address}
															publicClient={publicClient}
															walletClient={walletClient}
															account={accountValue ? {address: accountValue} : null}
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
										{#if contract.writeFunctions.length > 0}
											<div class="space-y-4">
												<h3 class="text-lg font-semibold">Write Functions</h3>
												<div class="grid gap-4 md:grid-cols-2">
													{#each contract.writeFunctions as func (func.name)}
														<ContractFunction
															functionName={func.name}
															abiItem={func}
															contractAddress={contract.address}
															publicClient={publicClient}
															walletClient={walletClient}
															account={accountValue ? {address: accountValue} : null}
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
							{/if}
						</div>
					</TabsContent>
				{/each}
			</Tabs>
		</div>
	{/if}
</div>