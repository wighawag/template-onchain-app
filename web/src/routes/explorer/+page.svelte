<script lang="ts">
	import {goto} from '$app/navigation';
	import DefaultHead from '../metadata/DefaultHead.svelte';
	import * as Card from '$lib/shadcn/ui/card';
	import * as Separator from '$lib/shadcn/ui/separator';
	import {Input} from '$lib/shadcn/ui/input';
	import {Button} from '$lib/shadcn/ui/button';
	import {SearchIcon} from '@lucide/svelte';
	import TransactionList from './components/TransactionList.svelte';
	import {route} from '$lib';

	let inputValue = $state('');

	function isValidAddress(value: string): boolean {
		return /^0x[a-fA-F0-9]{40}$/.test(value);
	}

	function isValidTxHash(value: string): boolean {
		return /^0x[a-fA-F0-9]{64}$/.test(value);
	}

	function handleSearch() {
		const trimmed = inputValue.trim();
		if (!trimmed) return;

		if (isValidTxHash(trimmed)) {
			goto(route(`/explorer/tx/${trimmed}`));
		} else if (isValidAddress(trimmed)) {
			goto(route(`/explorer/address/${trimmed}`));
		} else {
			alert('Invalid address or transaction hash format');
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleSearch();
		}
	}
</script>

<DefaultHead title={'Explorer'} />

<div class="container mx-auto max-w-5xl px-4 py-8">
	<div class="space-y-6">
		<div class="flex flex-col items-center space-y-2">
			<div class="rounded-full bg-primary/10 p-3">
				<SearchIcon class="h-8 w-8 text-primary" />
			</div>
			<h1 class="text-3xl font-bold">Blockchain Explorer</h1>
			<p class="text-muted-foreground">
				Search for transactions and addresses on the blockchain
			</p>
		</div>

		<Separator.Root />

		<Card.Root class="mx-auto max-w-2xl">
			<Card.Content class="pt-6">
				<div class="flex gap-2">
					<Input
						bind:value={inputValue}
						onkeydown={handleKeydown}
						placeholder="Enter transaction hash or address (0x...)"
						class="flex-1"
					/>
					<Button onclick={handleSearch}>
						<SearchIcon class="mr-2 h-4 w-4" />
						Search
					</Button>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- Recent Transactions -->
		<TransactionList />

		<div class="mx-auto max-w-2xl space-y-4">
			<h2 class="text-lg font-semibold">Quick Links</h2>
			<div class="grid gap-4 md:grid-cols-2">
				<a href="/contracts" class="text-primary hover:underline">
					<Card.Root class="transition-colors hover:bg-muted/50">
						<Card.Content class="py-4">
							<div class="font-medium">View Contracts</div>
							<div class="text-sm text-muted-foreground">
								Interact with deployed smart contracts
							</div>
						</Card.Content>
					</Card.Root>
				</a>
			</div>
		</div>
	</div>
</div>
