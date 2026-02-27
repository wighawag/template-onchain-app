<script lang="ts">
	import {browser} from '$app/environment';
	import TransactionView from '../components/TransactionView.svelte';

	// Read tx hash from either:
	// 1. URL hash (#0x123) - for path-based IPFS gateways
	// 2. URL pathname (/explorer/tx/0x123) - for unique origin IPFS with _redirects
	let txHash = $state<`0x${string}` | null>(null);

	$effect(() => {
		if (browser) {
			const extractHash = () => {
				// First try URL hash (for path-based IPFS)
				const urlHash = window.location.hash.slice(1);
				if (urlHash && urlHash.startsWith('0x')) {
					return urlHash as `0x${string}`;
				}

				// Then try pathname (for unique origin IPFS with _redirects rewrite)
				// URL will be /explorer/tx/0x123... (rewritten from _redirects)
				const pathname = window.location.pathname;
				const txPathMatch = pathname.match(/\/explorer\/tx\/(0x[a-fA-F0-9]+)/);
				if (txPathMatch && txPathMatch[1]) {
					return txPathMatch[1] as `0x${string}`;
				}

				return null;
			};

			const updateHash = () => {
				txHash = extractHash();
			};

			updateHash();
			window.addEventListener('hashchange', updateHash);
			window.addEventListener('popstate', updateHash);
			return () => {
				window.removeEventListener('hashchange', updateHash);
				window.removeEventListener('popstate', updateHash);
			};
		}
	});
</script>

<TransactionView {txHash} />
