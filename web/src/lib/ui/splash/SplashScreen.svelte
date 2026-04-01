<script>
	import {url} from '$lib/core/utils/web/path';
</script>

<div class="splash-screen" aria-label="Loading application" role="status">
	<img src={url('/icon.svg')} alt="" class="splash-logo" aria-hidden="true" />
	<span class="sr-only">Loading ...</span>
</div>

<style>
	.splash-screen {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--background, hsl(var(--background)));
		z-index: 9999;
	}

	.splash-logo {
		width: min(50vw, 50vh);
		height: min(50vw, 50vh);
		max-width: 400px;
		max-height: 400px;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.7;
			transform: scale(0.95);
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
</style>
