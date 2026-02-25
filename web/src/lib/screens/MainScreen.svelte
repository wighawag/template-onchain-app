<script lang="ts">
	import {setUserContext} from '$lib';
	import ConnectionFlow from '$lib/core/connection/ConnectionFlow.svelte';
	import WalletOnlyConnectionFlow from '$lib/core/connection/WalletOnlyConnectionFlow.svelte';
	import {Navbar} from '$lib/core/ui/navbar';
	import {Button} from '$lib/shadcn/ui/button';
	import * as Empty from '$lib/shadcn/ui/empty';
	import type {Dependencies} from '$lib/types';
	import {BanIcon, DollarSignIcon, LogInIcon} from '@lucide/svelte';
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
	<Empty.Root
		class="h-full bg-linear-to-b from-muted/50 from-30% to-background"
	>
		{#if $balance.step === 'Loading' || $balance.step === 'Idle'}
			<Empty.Header>
				<Empty.Media variant="icon">
					<DollarSignIcon />
				</Empty.Media>
				<Empty.Title>Loading your balance</Empty.Title>
			</Empty.Header>
			<Empty.Content>Please wait...</Empty.Content>
		{:else}
			<Empty.Header>
				<Empty.Media variant="icon">
					<DollarSignIcon />
				</Empty.Media>
				<Empty.Title>Your Balamce</Empty.Title>
			</Empty.Header>
			<Empty.Content>
				<p>
					{formatEther($balance.owner)}
					{$deployments.chain.nativeCurrency.symbol}
				</p>
				<label>signer:</label>
				<p>
					{formatEther($balance.signer)}
					{$deployments.chain.nativeCurrency.symbol}
				</p>
			</Empty.Content>
		{/if}
	</Empty.Root>
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
