<script lang="ts">
	import {Button, buttonVariants} from '$lib/shadcn/ui/button/index.js';
	import * as Dialog from '$lib/shadcn/ui/dialog/index.js';
	import {Input} from '$lib/shadcn/ui/input/index.js';
	import {Label} from '$lib/shadcn/ui/label/index.js';

	import DefaultHead from './metadata/DefaultHead.svelte';

	let dialogOpen = $state(false);
</script>

<DefaultHead title={'Template'} />

<h1>Welcome to SvelteKit</h1>
<p>
	Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the
	documentation
</p>

<Button onclick={() => (dialogOpen = true)}>opem</Button>

<Dialog.Root bind:open={dialogOpen}>
	<form>
		<Dialog.Content class="sm:max-w-[425px]">
			<Dialog.Header>
				<Dialog.Title>Edit profile</Dialog.Title>
				<Dialog.Description>
					Make changes to your profile here. Click save when you&apos;re done.
				</Dialog.Description>
			</Dialog.Header>
			<div class="grid gap-4">
				<div class="grid gap-3">
					<Label for="name-1">Name</Label>
					<Input id="name-1" name="name" defaultValue="Pedro Duarte" />
				</div>
				<div class="grid gap-3">
					<Label for="username-1">Username</Label>
					<Input id="username-1" name="username" defaultValue="@peduarte" />
				</div>
			</div>
			<Dialog.Footer>
				<Dialog.Close
					type="button"
					class={buttonVariants({variant: 'outline'})}
				>
					Cancel
				</Dialog.Close>
				<Button type="submit">Save changes</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</form>
</Dialog.Root>
