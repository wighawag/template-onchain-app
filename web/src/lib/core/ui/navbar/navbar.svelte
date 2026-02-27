<script lang="ts">
	import {getUserContext} from '$lib';
	import Button, {buttonVariants} from '$lib/shadcn/ui/button/button.svelte';
	import BlockieAvatar from '../ethereum/BlockieAvatar.svelte';
	import {Spinner} from '$lib/shadcn/ui/spinner/index.js';
	import * as Drawer from '$lib/shadcn/ui/drawer/index.js';
	import Address from '../ethereum/Address.svelte';
	import {url} from '$lib/core/utils/web/path';

	let {name}: {name?: string} = $props();

	const {connection} = getUserContext();

	let showMenu = $state(false);

	function toggleMenu() {
		showMenu = !showMenu;
	}
</script>

<nav
	class="sticky top-0 left-0 z-50 flex h-12 w-full items-center justify-between bg-background shadow-md"
>
	<div class="m-1 flex h-full items-center space-x-2">
		<span class="text-lg font-bold">{name}</span> <a href={url('/')}>home</a>
		<a href={url('/contracts')}>contracts</a>
		<a href={url('/examples')}>examples</a>
	</div>

	<div class="relative flex h-full items-center space-x-4">
		{#if ($connection.step === 'Idle' && $connection.loading) || ($connection.step != 'Idle' && $connection.step != 'SignedIn')}
			<Button disabled class="m-1 flex h-8 items-center justify-center p-0">
				<Spinner /> Connect
			</Button>
		{:else if $connection.step === 'SignedIn'}
			<div class="m-1 flex h-full items-center space-x-2">
				<button
					class="flex h-8 w-8 items-center justify-center focus:outline-none"
					onclick={toggleMenu}
					aria-label="Account menu"
				>
					<BlockieAvatar address={$connection.account.address} />
				</button>
			</div>
		{:else}
			<Button
				class="m-1 flex h-8 items-center justify-center p-0 px-3"
				onclick={() => connection.connect()}
			>
				Connect
			</Button>
		{/if}
	</div>
	<Drawer.Root bind:open={showMenu} direction="right">
		<Drawer.Portal to="#--layer-drawer" />
		<Drawer.Content>
			{#if $connection.step === 'SignedIn'}
				<Drawer.Header class="text-start">
					<Drawer.Title
						>Acccount <Address
							value={$connection.account.address}
						/></Drawer.Title
					>
					<!-- <Drawer.Description>
						
					</Drawer.Description> -->
				</Drawer.Header>

				<Button
					class="w-full"
					onclick={() => {
						connection.disconnect();
						showMenu = false;
					}}
				>
					Disconnect
				</Button>
			{:else}
				<Drawer.Header class="text-start">
					<Drawer.Title>You are disconnected</Drawer.Title>
				</Drawer.Header>
				<Button
					class="m-0 flex h-8 items-center justify-center p-0 px-3"
					onclick={() => connection.connect()}
				>
					Connect
				</Button>
			{/if}

			<Drawer.Footer class="pt-2">
				<Drawer.Close class={buttonVariants({variant: 'outline'})}
					>Cancel</Drawer.Close
				>
			</Drawer.Footer>
		</Drawer.Content>
	</Drawer.Root>
</nav>
