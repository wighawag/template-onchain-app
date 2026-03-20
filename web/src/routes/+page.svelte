<script lang="ts">
	import DefaultHead from '../lib/metadata/DefaultHead.svelte';
	import {Button} from '$lib/shadcn/ui/button';
	import {route} from '$lib';
	import {
		RocketIcon,
		LayersIcon,
		RefreshCwIcon,
		GlobeIcon,
		CodeIcon,
		SplitIcon,
		MonitorIcon,
		TerminalIcon,
		ZapIcon,
	} from '@lucide/svelte';

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

	const showcaseApps = [
		{
			name: 'Bleeps',
			url: 'https://bleeps.art',
			image: '/showcase/bleeps.png',
			title: 'The Bleeps DAO and Its Fully Onchain Sounds',
			description:
				'The First Composable Sounds Fully Generated On-Chain With Zero Externalities, no backend, no ipfs, no client-code, and a melody minter where some of the proceeds goes to the Bleeps DAO and its members',
			sourceCode: 'https://github.com/wighawag/bleeps',
		},
		{
			name: 'Mandalas',
			url: 'https://mandalas.eth.limo',
			image: '/showcase/mandalas.png',
			title: 'On-chain Generative Bitmaps With Zero Externalities',
			description:
				'The First On-Chain Generative Art Project to make full use of token URI to remove all external dependencies. It generates SVG and Bitmap from the smart contract directly.',
			sourceCode: 'https://github.com/wighawag/mandalas',
		},
		{
			name: 'Conquest',
			url: 'https://conquest.game',
			image: '/showcase/conquest.png',
			title: 'A Game of Strategy and Diplomacy Running on the EVM',
			description:
				'An unstoppable game of strategy and diplomacy running on the EVM. It allows player to collaborate through on-chain alliances while remaining sovereign. A first of its kind.',
			sourceCode: null,
		},
	];
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
		<p class="mb-8 max-w-2xl text-lg font-semibold">
			Production-Ready Template To Build Decentralised Applications
		</p>

		<!-- Action Buttons -->
		<div class="mb-8 flex flex-wrap justify-center gap-4">
			<Button href={route('/demo/')} size="lg" class="min-w-40">Demo</Button>
			<Button
				href="https://github.com/wighawag/jolly-roger"
				variant="secondary"
				size="lg"
				class="min-w-40"
				target="_blank"
				rel="noopener noreferrer"
			>
				Github
			</Button>
		</div>

		<!-- Use It Section -->
		<div class="mb-4 text-center">
			<p class="mb-2 text-sm text-muted-foreground">Use it:</p>
			<div
				class="inline-block rounded-lg border border-primary/30 bg-muted/50 px-6 py-3"
			>
				<code class="text-sm text-primary md:text-base">
					pnpm create jolly-roger@latest
				</code>
			</div>
		</div>

		<p class="text-sm text-muted-foreground">
			Find out more on
			<a
				href="https://github.com/wighawag/jolly-roger"
				target="_blank"
				rel="noopener noreferrer"
				class="underline hover:text-foreground"
			>
				github
			</a>
		</p>
	</div>

	<!-- Showcase Section -->
	<section class="mb-16">
		<h2 class="mb-4 text-center text-3xl font-bold">Showcase</h2>
		<p class="mb-8 text-center text-muted-foreground">
			Here are examples of apps built using "Jolly Roger"
		</p>

		<div class="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
			{#each showcaseApps as app}
				<div
					class="flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md"
				>
					<div class="aspect-video bg-muted">
						{#if app.image}
							<div
								class="flex h-full items-center justify-center bg-linear-to-br from-muted to-muted/50 p-4"
							>
								<span class="text-2xl font-bold text-muted-foreground"
									>{app.name}</span
								>
							</div>
						{/if}
					</div>
					<div class="flex flex-1 flex-col p-4">
						<a
							href={app.url}
							target="_blank"
							rel="noopener noreferrer"
							class="mb-2 text-center text-primary underline hover:text-primary/80"
						>
							{app.name.toLowerCase()}.{app.url.includes('eth') ? 'eth' : 'art'}
						</a>
						<h3 class="mb-2 text-center text-lg font-semibold">{app.title}</h3>
						<p class="mb-4 flex-1 text-center text-sm text-muted-foreground">
							{app.description}
						</p>
						{#if app.sourceCode}
							<p class="text-center text-sm">
								Check the
								<a
									href={app.sourceCode}
									target="_blank"
									rel="noopener noreferrer"
									class="underline hover:text-foreground"
								>
									source code
								</a>.
							</p>
						{:else}
							<p class="text-center text-sm text-muted-foreground">
								Source code not yet available.
							</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- Features Section -->
	<section class="mb-16">
		<h2 class="mb-8 text-center text-3xl font-bold">Features</h2>

		<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each features as feature}
				<div class="rounded-lg border bg-card p-6 shadow-sm">
					<div class="mb-4 flex items-center gap-3">
						<feature.icon class="h-6 w-6 text-primary" />
						<h3 class="text-lg font-semibold text-primary">{feature.title}</h3>
					</div>
					<p class="text-sm text-muted-foreground">{feature.description}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Footer -->
	<footer class="border-t pt-8 text-center">
		<p class="text-sm text-muted-foreground">
			Created by
			<a
				href="https://ronan.eth.limo"
				target="_blank"
				rel="noopener noreferrer"
				class="underline hover:text-foreground"
			>
				Ronan Sandford
			</a>
		</p>
	</footer>
</div>
