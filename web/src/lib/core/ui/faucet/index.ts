import {PUBLIC_FAUCET_LINK} from '$env/static/public';
export {default as FaucetButton} from './FaucetButton.svelte';
export const hasFaucetLink = Boolean(PUBLIC_FAUCET_LINK && PUBLIC_FAUCET_LINK.trim());
