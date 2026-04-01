/**
 * Global teardown for E2E tests.
 * Stops the Hardhat node if we started it.
 */

export default async function globalTeardown(): Promise<void> {
	console.log('\n🧹 Cleaning up E2E test environment...');

	const nodeProcess = globalThis.__HARDHAT_NODE_PROCESS__;

	if (nodeProcess) {
		console.log('📦 Stopping Hardhat node...');

		// Kill the process tree
		try {
			// On Unix systems, use negative PID to kill the process group
			if (process.platform !== 'win32' && nodeProcess.pid) {
				process.kill(-nodeProcess.pid, 'SIGTERM');
			} else {
				nodeProcess.kill('SIGTERM');
			}
		} catch (error) {
			// Process may already be dead
			console.log('Node process already terminated');
		}

		// Wait a bit for graceful shutdown
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Force kill if still running
		try {
			if (nodeProcess.pid && !nodeProcess.killed) {
				if (process.platform !== 'win32') {
					process.kill(-nodeProcess.pid, 'SIGKILL');
				} else {
					nodeProcess.kill('SIGKILL');
				}
			}
		} catch {
			// Already dead
		}

		console.log('✓ Hardhat node stopped');
	} else {
		console.log('✓ No Hardhat node to stop (was already running or not started)');
	}

	console.log('✅ E2E cleanup complete\n');
}
