<script lang="ts">
	import DefaultHead from './metadata/DefaultHead.svelte';
	import * as Empty from '$lib/shadcn/ui/empty/index.js';
	import {BanIcon, LogInIcon} from '@lucide/svelte';
	import {Button} from '$lib/shadcn/ui/button';
</script>

<DefaultHead title={'Template'} />

<Empty.Root class="h-full bg-linear-to-b from-muted/50 from-30% to-background">
	<Empty.Header>
		<Empty.Media variant="icon">
			<BanIcon />
		</Empty.Media>
		<Empty.Title>Nothing to show</Empty.Title>
		<Empty.Description>There is currently nothing to show</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<Button variant="outline" size="sm">
			<LogInIcon />
			Connect
		</Button>
	</Empty.Content>
</Empty.Root>
