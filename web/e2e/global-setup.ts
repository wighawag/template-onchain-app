import {spawn, execSync} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';

/**
 * Global setup for E2E tests.
 * Starts the Hardhat node, deploys contracts, and builds the web app.
 *
 * NOTE: The pretest:e2e script in package.json kills any stale preview server
 * on port 4173 BEFORE Playwright starts. This ensures that after globalSetup
 * builds the app, Playwright's webServer will start a fresh preview server.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '../..');
const CONTRACTS_DIR = path.join(ROOT_DIR, 'contracts');
const WEB_DIR = path.join(ROOT_DIR, 'web');

// Store the node process globally so teardown can access it
declare global {
	var __HARDHAT_NODE_PROCESS__: ReturnType<typeof spawn> | undefined;
}

async function waitForNode(
	url: string,
	maxAttempts = 30,
	interval = 1000,
): Promise<void> {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_blockNumber',
					params: [],
					id: 1,
				}),
			});
			if (response.ok) {
				console.log('✓ Hardhat node is ready');
				return;
			}
		} catch {
			// Node not ready yet
		}
		await new Promise((resolve) => setTimeout(resolve, interval));
	}
	throw new Error('Hardhat node failed to start');
}

export default async function globalSetup(): Promise<void> {
	console.log('\n🚀 Starting E2E test setup...\n');

	// Check if there's already a node running
	try {
		const response = await fetch('http://localhost:8545', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'eth_blockNumber',
				params: [],
				id: 1,
			}),
		});
		if (response.ok) {
			console.log('✓ Hardhat node already running, skipping node startup');
			// Skip starting a new node, but still deploy and build
			await deployContracts();
			await buildWeb();
			return;
		}
	} catch {
		// Node not running, we'll start one
	}

	// Start Hardhat node
	console.log('📦 Starting Hardhat node...');
	const nodeProcess = spawn('pnpm', ['run', 'node:local'], {
		cwd: CONTRACTS_DIR,
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: false,
		env: {...process.env, FORCE_COLOR: '0'},
	});

	globalThis.__HARDHAT_NODE_PROCESS__ = nodeProcess;

	// Log node output for debugging
	nodeProcess.stdout?.on('data', (data: Buffer) => {
		const output = data.toString();
		if (output.includes('Started HTTP')) {
			console.log('✓ Hardhat node started');
		}
	});

	nodeProcess.stderr?.on('data', (data: Buffer) => {
		const output = data.toString();
		// Only log actual errors, not warnings
		if (output.includes('Error') || output.includes('error')) {
			console.error('Hardhat node error:', output);
		}
	});

	// Wait for node to be ready
	await waitForNode('http://localhost:8545');

	// Deploy contracts
	await deployContracts();

	// Build web app
	await buildWeb();

	console.log('\n✅ E2E test setup complete!\n');
}

async function deployContracts(): Promise<void> {
	console.log('📋 Compiling contracts...');
	execSync('pnpm compile', {
		cwd: CONTRACTS_DIR,
		stdio: 'inherit',
	});

	console.log('📋 Deploying contracts to localhost...');
	execSync('pnpm run deploy localhost --skip-prompts', {
		cwd: CONTRACTS_DIR,
		stdio: 'inherit',
	});

	console.log('📋 Exporting deployments...');
	execSync('pnpm export localhost --ts ../web/src/lib/deployments.ts', {
		cwd: CONTRACTS_DIR,
		stdio: 'inherit',
	});
	console.log('✓ Contracts deployed and exported');
}

async function buildWeb(): Promise<void> {
	console.log('🔨 Building web app for localhost...');
	execSync('pnpm build localhost', {
		cwd: WEB_DIR,
		stdio: 'inherit',
	});
	console.log('✓ Web app built');
}
