<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/shadcn/ui/button';
</script>

<div class="flex min-h-screen items-center justify-center p-8 bg-background">
	<div class="text-center max-w-md">
		<h1 class="text-[6rem] font-bold leading-none text-muted-foreground m-0">
			{page.status}
		</h1>
		<h2 class="text-2xl font-semibold text-foreground mt-4 mb-2">
			{#if page.status === 404}
				Page Not Found
			{:else if page.status === 500}
				Server Error
			{:else if page.status === 403}
				Access Denied
			{:else if page.status === 401}
				Unauthorized
			{:else}
				Something Went Wrong
			{/if}
		</h2>
		<p class="text-muted-foreground mb-8">
			{page.error?.message || 'An unexpected error occurred'}
		</p>
		<div class="flex gap-4 justify-center flex-wrap">
			<Button href="/">Go Home</Button>
			<Button variant="outline" onclick={() => window.location.reload()}>
				Try Again
			</Button>
		</div>
	</div>
</div>
