<script lang="ts">
	import {Button} from '$lib/shadcn/ui/button/index.js';
	import * as Modal from '$lib/core/ui/modal/index.js';

	let dialogOpen = $state(false);

	let button: HTMLButtonElement | null = $state(null);
</script>

<Button onclick={() => (dialogOpen = true)}>open</Button>

<Modal.Root
	openWhen={dialogOpen}
	onCancel={() => (dialogOpen = false)}
	elementToFocus={button}
>
	<Modal.Header>
		<Modal.Title>Hello world</Modal.Title>
		<Modal.Description>sdsadsa</Modal.Description>
	</Modal.Header>
	Enter
	<Modal.Footer
		><Button>hi</Button>
		<Button
			variant="outline"
			onclick={() => console.log(`clicked`)}
			bind:ref={button}>hi</Button
		></Modal.Footer
	>
</Modal.Root>
