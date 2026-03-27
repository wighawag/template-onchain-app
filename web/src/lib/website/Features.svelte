<script lang="ts">
	import RocketIcon from '@lucide/svelte/icons/rocket';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import CodeIcon from '@lucide/svelte/icons/code';
	import SplitIcon from '@lucide/svelte/icons/split';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import TerminalIcon from '@lucide/svelte/icons/terminal';
	import ZapIcon from '@lucide/svelte/icons/zap';

	const features = [
		{
			title: 'All Included',
			description:
				'This template includes setup for smart contracts, indexer and frontend. All runs locally for the best-in-class developer experience.',
			icon: LayersIcon,
		},
		{
			title: 'PWA ready: 100% Lighthouse score',
			description:
				'The web app is fully PWA compliant, with offline caching, etc... The javascript code necessary to launch the app is less than 50kB (15kB compressed).',
			icon: RocketIcon,
		},
		{
			title: 'Great Dev Experience',
			description:
				"Hardhat for contracts, hardhat-deploy for contract deployment, the in-browser ethereum-indexer for contract's api, svelte + Svelte Kit for frontend with HMR.",
			icon: ZapIcon,
		},
		{
			title: 'Everything Hot Reload',
			description:
				'On contract changes, contracts keep their address and code get updated automatically. On frontend changes, module get replaced using blazing fast Vite es module hot reload.',
			icon: RefreshCwIcon,
		},
		{
			title: 'Fully IPFS Ready',
			description:
				'Fully IPFS ready with proper url routing. The web app works on both IPFS urls and ENS/DNS urls. PWA works on IPFS too with scoped service workers.',
			icon: GlobeIcon,
		},
		{
			title: 'All in Typescript',
			description:
				'The whole app including indexer and, is written in typescript.',
			icon: CodeIcon,
		},
		{
			title: 'Code Splitting and Tree Shaking',
			description:
				'By using Svelte Kit (and so Vite) and ES modules, the frontend benefit from code splitting an dynamic imports as well as tree shaking.',
			icon: SplitIcon,
		},
		{
			title: 'VSCode Setup',
			description:
				'The repo is setup as a vscode workspace with recommended plugins. Execute tests from the editor. Auto format, etc...',
			icon: MonitorIcon,
		},
		{
			title: 'One command deploy',
			description:
				'Everything is setup, except for the private ENV variable to deploy the contracts.',
			icon: TerminalIcon,
		},
	];
</script>

<!-- Features Section -->
<section class="mb-16">
	<h2 class="mb-8 text-center text-3xl font-bold">Features</h2>

	<div class="grid gap-6 lg:grid-cols-3">
		{#each features as feature}
			<div
				class="mx-auto w-full max-w-125 rounded-lg border bg-card p-6 shadow-sm lg:mx-0 lg:max-w-none"
			>
				<div
					class="mb-4 flex items-center justify-center gap-3 lg:justify-start"
				>
					<feature.icon class="h-6 w-6 text-primary" />
					<h3 class="text-lg font-semibold text-primary">{feature.title}</h3>
				</div>
				<p class="text-sm text-muted-foreground">{feature.description}</p>
			</div>
		{/each}
	</div>
</section>
