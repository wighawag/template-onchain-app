<script lang="ts">
	import {getUserContext, route} from '$lib';
	import Button, {buttonVariants} from '$lib/shadcn/ui/button/button.svelte';
	import BlockieAvatar from '../ethereum/BlockieAvatar.svelte';
	import {Spinner} from '$lib/shadcn/ui/spinner/index.js';
	import * as Drawer from '$lib/shadcn/ui/drawer/index.js';
	import Address from '../ethereum/Address.svelte';
	import {MenuIcon} from '@lucide/svelte';

	let {name}: {name?: string} = $props();

	const {connection} = getUserContext();

	let showMenu = $state(false);

	function toggleMenu() {
		showMenu = !showMenu;
	}
</script>

<!--nabvar have some top padding to match the scrollbar gutter on the right, see app.css-->
<nav
	class="sticky top-0 left-0 z-50 flex h-12 w-full items-center justify-between bg-background py-4 shadow-md"
>
	<div class="m-1 flex h-full items-center space-x-2">
		<a href={route('/')} class="text-lg font-bold hover:underline">{name}</a>
	</div>

	<div class="relative flex h-full items-center space-x-2">
		<!-- Connect Button / Connected Address -->
		{#if ($connection.step === 'Idle' && $connection.loading) || ($connection.step != 'Idle' && $connection.step != 'SignedIn')}
			<Button disabled class="m-1 flex h-8 items-center justify-center p-0">
				<Spinner /> Connect
			</Button>
		{:else if $connection.step === 'SignedIn'}
			<div class="m-1 flex h-8 items-center space-x-2">
				<Address value={$connection.account.address} />
			</div>
		{:else}
			<Button
				class="m-1 flex h-8 items-center justify-center p-0 px-3"
				onclick={() => connection.connect()}
			>
				Connect
			</Button>
		{/if}

		<!-- Drawer Button - Avatar when connected, Menu icon when disconnected -->
		<button
			class="m-1 flex h-8 w-8 items-center justify-center rounded-md focus:outline-none {$connection.step !==
			'SignedIn'
				? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
				: ''}"
			onclick={toggleMenu}
			aria-label="Open menu"
		>
			{#if $connection.step === 'SignedIn'}
				<BlockieAvatar address={$connection.account.address} />
			{:else}
				<MenuIcon class="h-5 w-5" />
			{/if}
		</button>
	</div>
	<Drawer.Root bind:open={showMenu} direction="right">
		<Drawer.Portal to="#--layer-drawer" />
		<Drawer.Content>
			{#if $connection.step === 'SignedIn'}
				<Drawer.Header class="text-start">
					<Drawer.Title
						>Account <Address
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

			<!-- Navigation Links -->
			<div class="mt-4 flex flex-col gap-2 px-4">
				<a
					href={route('/contracts')}
					class={buttonVariants({variant: 'outline'})}
					onclick={() => (showMenu = false)}
				>
					Contracts
				</a>
				<a
					href={route('/explorer')}
					class={buttonVariants({variant: 'outline'})}
					onclick={() => (showMenu = false)}
				>
					Explorer
				</a>
			</div>

			<Drawer.Footer class="pt-2">
				<Drawer.Close class={buttonVariants({variant: 'outline'})}
					>Cancel</Drawer.Close
				>
			</Drawer.Footer>
		</Drawer.Content>
	</Drawer.Root>
</nav>
