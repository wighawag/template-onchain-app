<script lang="ts">
	import {getUserContext, route} from '$lib';
	import Button, {buttonVariants} from '$lib/shadcn/ui/button/button.svelte';
	import BlockieAvatar from '../ethereum/BlockieAvatar.svelte';
	import {Spinner} from '$lib/shadcn/ui/spinner/index.js';
	import * as Drawer from '$lib/shadcn/ui/drawer/index.js';
	import Address from '../ethereum/Address.svelte';
	import {MenuIcon, GithubIcon, MessageCircleIcon} from '@lucide/svelte';

	let {
		name,
		githubUrl,
		discordUrl,
	}: {
		name?: string;
		githubUrl?: string;
		discordUrl?: string;
	} = $props();

	const {connection} = getUserContext();

	let showMenu = $state(false);

	function toggleMenu() {
		showMenu = !showMenu;
	}
</script>

<!--navbar padding handled by scrollbar-gutter on desktop, needs-gutter-padding class adds padding on touch devices, see app.css-->
<nav
	class="needs-gutter-padding sticky top-0 left-0 z-50 flex h-12 w-full items-center justify-between bg-background py-4 shadow-md"
>
	<div class="m-1 flex h-full items-center space-x-4">
		<a href={route('/')} class="text-lg font-bold hover:underline">{name}</a>
		<a
			href={route('/')}
			class="text-sm text-muted-foreground hover:text-foreground hover:underline"
		>
			Demo
		</a>
		<div class="flex items-center space-x-2">
			{#if githubUrl}
				<a
					href={githubUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted-foreground hover:text-foreground"
					aria-label="GitHub"
				>
					<GithubIcon class="h-5 w-5" />
				</a>
			{/if}
			{#if discordUrl}
				<a
					href={discordUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted-foreground hover:text-foreground"
					aria-label="Discord"
				>
					<MessageCircleIcon class="h-5 w-5" />
				</a>
			{/if}
		</div>
	</div>

	<div class="relative flex h-full items-center space-x-2">
		<!-- Connect Button / Connected Address -->
		{#if ($connection.step === 'Idle' && $connection.loading) || ($connection.step != 'Idle' && !connection.isTargetStepReached($connection))}
			<Button disabled class="m-1 flex h-8 items-center justify-center p-0">
				<Spinner /> Connect
			</Button>
		{:else if connection.isTargetStepReached($connection)}
			<div class="m-1 hidden h-8 items-center space-x-2 sm:flex">
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
			{#if connection.isTargetStepReached($connection)}
				<BlockieAvatar address={$connection.account.address} />
			{:else}
				<MenuIcon class="h-5 w-5" />
			{/if}
		</button>
	</div>
	<Drawer.Root bind:open={showMenu} direction="right">
		<Drawer.Portal to="#--layer-drawer" />
		<Drawer.Content>
			{#if connection.isTargetStepReached($connection)}
				<Drawer.Header class="text-start">
					<Drawer.Title
						>Account <Address
							value={$connection.account.address}
						/></Drawer.Title
					>
					<!-- <Drawer.Description>
						
					</Drawer.Description> -->
				</Drawer.Header>

				<!-- Connected User Actions -->
				<div class="flex flex-col gap-2 px-4">
					<a
						href={route('/transactions/')}
						class={buttonVariants({variant: 'outline'})}
						onclick={() => (showMenu = false)}
					>
						Your Transactions
					</a>
					<Button
						class="w-full"
						variant="destructive"
						onclick={() => {
							connection.disconnect();
							showMenu = false;
						}}
					>
						Disconnect
					</Button>
				</div>
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

			<!-- Public Navigation Links -->
			<div class="mt-4 flex flex-col gap-2 border-t border-border px-4 pt-4">
				<span class="text-xs tracking-wide text-muted-foreground uppercase"
					>Explore</span
				>
				<a
					href={route('/contracts/')}
					class={buttonVariants({variant: 'outline'})}
					onclick={() => (showMenu = false)}
				>
					Contracts
				</a>
				<a
					href={route('/explorer/')}
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
