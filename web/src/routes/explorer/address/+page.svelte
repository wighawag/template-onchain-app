<script lang="ts">
	import {browser} from '$app/environment';
	import AddressView from '../components/AddressView.svelte';

	// Read address from either:
	// 1. URL hash (#0x123) - for path-based IPFS gateways
	// 2. URL pathname (/explorer/address/0x123) - for unique origin IPFS with _redirects
	let address = $state<`0x${string}` | null>(null);

	$effect(() => {
		if (browser) {
			const extractAddress = () => {
				// First try URL hash (for path-based IPFS)
				const urlHash = window.location.hash.slice(1);
				if (urlHash && urlHash.startsWith('0x')) {
					return urlHash as `0x${string}`;
				}

				// Then try pathname (for unique origin IPFS with _redirects rewrite)
				// URL will be /explorer/address/0x123... (rewritten from _redirects)
				const pathname = window.location.pathname;
				const addressPathMatch = pathname.match(
					/\/explorer\/address\/(0x[a-fA-F0-9]+)/,
				);
				if (addressPathMatch && addressPathMatch[1]) {
					return addressPathMatch[1] as `0x${string}`;
				}

				return null;
			};

			const updateAddress = () => {
				address = extractAddress();
			};

			updateAddress();
			window.addEventListener('hashchange', updateAddress);
			window.addEventListener('popstate', updateAddress);
			return () => {
				window.removeEventListener('hashchange', updateAddress);
				window.removeEventListener('popstate', updateAddress);
			};
		}
	});
</script>

<AddressView {address} />
