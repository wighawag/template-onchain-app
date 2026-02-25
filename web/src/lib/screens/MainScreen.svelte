<script lang="ts">
	import {setUserContext} from '$lib';
	import ConnectionFlow from '$lib/core/connection/ConnectionFlow.svelte';
	import WalletOnlyConnectionFlow from '$lib/core/connection/WalletOnlyConnectionFlow.svelte';
	import {Navbar} from '$lib/core/ui/navbar';
	import {Button} from '$lib/shadcn/ui/button';
	import * as Empty from '$lib/shadcn/ui/empty';
	import * as Card from '$lib/shadcn/ui/card';
	import * as Separator from '$lib/shadcn/ui/separator';
	import type {Dependencies} from '$lib/types';
	import {BanIcon, DollarSignIcon, LogInIcon, WalletIcon} from '@lucide/svelte';
	import {formatEther} from 'viem';

	interface Props {
		dependencies: Dependencies;
	}

	let {dependencies}: Props = $props();
	setUserContext(() => dependencies);

	let {connection, paymentConnection, balance, deployments} =
		$derived(dependencies);
</script>

<Navbar name="Template" />

<ConnectionFlow {connection} />
<WalletOnlyConnectionFlow connection={paymentConnection} />

{#if $connection.step == 'SignedIn'}
	<div class="container mx-auto max-w-2xl px-4 py-8">
		{#if $balance.step === 'Loading' || $balance.step === 'Idle'}
			<div
				class="flex min-h-[400px] flex-col items-center justify-center space-y-4"
			>
				<div class="rounded-full bg-muted p-4">
					<DollarSignIcon class="h-12 w-12 text-muted-foreground" />
				</div>
				<h2 class="text-2xl font-semibold">Loading your balance</h2>
				<p class="text-muted-foreground">Please wait...</p>
			</div>
		{:else}
			<div class="space-y-6">
				<div class="flex flex-col items-center space-y-2">
					<div class="rounded-full bg-primary/10 p-3">
						<DollarSignIcon class="h-8 w-8 text-primary" />
					</div>
					<h1 class="text-3xl font-bold">Your Balance</h1>
					<p class="text-muted-foreground">Overview of your account balances</p>
				</div>

				<Separator.Root />

				<div class="grid gap-6">
					<Card.Root class="border-2">
						<Card.Header>
							<Card.Title class="flex items-center gap-2 text-lg">
								<div class="rounded-lg bg-primary/10 p-2">
									<WalletIcon class="h-5 w-5 text-primary" />
								</div>
								Owner Balance
							</Card.Title>
							<Card.Description class="text-sm">
								The balance of your owner account
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<p class="text-3xl font-bold">
								{formatEther($balance.owner)}
								<span class="ml-2 text-xl font-normal text-muted-foreground">
									{$deployments.chain.nativeCurrency.symbol}
								</span>
							</p>
						</Card.Content>
					</Card.Root>

					<Card.Root class="border-2">
						<Card.Header>
							<Card.Title class="flex items-center gap-2 text-lg">
								<div class="rounded-lg bg-primary/10 p-2">
									<DollarSignIcon class="h-5 w-5 text-primary" />
								</div>
								Signer Balance
							</Card.Title>
							<Card.Description class="text-sm">
								The balance of your signer account
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<p class="text-3xl font-bold">
								{formatEther($balance.signer)}
								<span class="ml-2 text-xl font-normal text-muted-foreground">
									{$deployments.chain.nativeCurrency.symbol}
								</span>
							</p>
						</Card.Content>
					</Card.Root>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<Empty.Root
		class="h-full bg-linear-to-b from-muted/50 from-30% to-background"
	>
		<Empty.Header>
			<Empty.Media variant="icon">
				<BanIcon />
			</Empty.Media>
			<Empty.Title>Nothing to show</Empty.Title>
			<Empty.Description>Connect to see your balance</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button onclick={() => connection.connect()} variant="outline" size="sm">
				<LogInIcon />
				Connect
			</Button>
		</Empty.Content>
	</Empty.Root>
{/if}
