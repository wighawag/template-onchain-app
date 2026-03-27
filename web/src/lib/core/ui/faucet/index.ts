import {PUBLIC_FAUCET_LINK} from '$env/static/public';
import deploymentsFromFiles from '$lib/deployments';

export {default as FaucetButton} from './FaucetButton.svelte';
export const hasFaucetLink = Boolean(
	PUBLIC_FAUCET_LINK && PUBLIC_FAUCET_LINK.trim(),
);

export function getFaucetLink(address: `0x${string}`) {
	return `${PUBLIC_FAUCET_LINK}?chainId=${deploymentsFromFiles.chain.id}&address=${address}`;
}
