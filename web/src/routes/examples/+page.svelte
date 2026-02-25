<script lang="ts">
	import * as Item from '$lib/shadcn/ui/item/index.js';
	import {Button} from '$lib/shadcn/ui/button/index.js';
	import {url} from '$lib/core/utils/web/path';
	import {route} from '$lib';
</script>

<div class="flex w-full flex-col gap-6">
	<Item.Root variant="outline">
		<Item.Content>
			<Item.Title>Modal Example</Item.Title>
			<Item.Description>A simple example of using Modals</Item.Description>
		</Item.Content>
		<Item.Actions>
			<Button href={route('/examples/modals')} variant="outline" size="sm"
				>go</Button
			>
		</Item.Actions>
	</Item.Root>
</div>
