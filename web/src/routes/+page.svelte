<script lang="ts">
	import {route} from '$lib';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import DefaultHead from '../lib/metadata/DefaultHead.svelte';
</script>

<DefaultHead title={'Jolly Roger - Build and Deploy for Eternity'} />

<div class="container mx-auto max-w-6xl px-4 py-12">
	<!-- Hero Section -->
	<div class="mb-16 flex flex-col items-center text-center">
		<img
			src="/icon.svg"
			alt="Jolly Roger"
			class="mb-8 h-48 w-48 drop-shadow-lg"
		/>
		<h1 class="mb-4 text-5xl font-bold tracking-tight text-primary md:text-6xl">
			Jolly Roger
		</h1>
		<p class="mb-6 text-xl text-muted-foreground">
			<span class="text-primary">Build</span> and
			<span class="text-primary">Deploy</span> for
			<span class="text-primary">Eternity</span>.
		</p>
		<p class="mb-8 max-w-2xl text-lg font-semibold">Welcome to your Idea!</p>

		<!-- Action Buttons -->
		<div class="mb-8 flex flex-wrap justify-center gap-4">
			<Button href={route('/demo/')} size="lg" class="min-w-40"
				>Check The Demo</Button
			>
		</div>
	</div>
</div>
