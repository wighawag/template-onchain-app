<script lang="ts">
	import {Blockie} from '$lib/core/utils/ethereum/blockie';
	import * as Avatar from '$lib/shadcn/ui/avatar';
	import type {HTMLImgAttributes} from 'svelte/elements';

	interface BlockieProps extends HTMLImgAttributes {
		address: string;
		offset?: number;
	}

	let {address, offset = 0, ...restProps}: BlockieProps = $props();

	let uri = $derived(Blockie.getURI(address, offset));
</script>

<Avatar.Root>
	<Avatar.AvatarImage
		src={uri}
		alt={address}
		style="image-rendering: -moz-crisp-edges;
		image-rendering: -webkit-crisp-edges;
		image-rendering: crisp-edges;
		image-rendering: pixelated;"
	/>
</Avatar.Root>
