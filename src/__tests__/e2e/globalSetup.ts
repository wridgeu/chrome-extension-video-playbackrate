import { startServer, stopServer } from './server';

/** Vitest global setup - starts HTTP server before all e2e tests */
export async function setup() {
	await startServer();
	console.log('[E2E] Test server started on http://localhost:3333');
}

/** Vitest global teardown - stops HTTP server after all e2e tests */
export async function teardown() {
	await stopServer();
	console.log('[E2E] Test server stopped');
}
