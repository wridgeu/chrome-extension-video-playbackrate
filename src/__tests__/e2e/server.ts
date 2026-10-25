import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 3333;
const HOST = '127.0.0.1';
const PAGES_DIR = path.join(import.meta.dirname, 'pages');
const VIDEO_FIXTURE = path.join(import.meta.dirname, '../fixtures/test-video.mp4');

let server: http.Server | null = null;

export const TEST_SERVER_URL = `http://${HOST}:${PORT}`;

/** MIME types for serving static files */
const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.mp4': 'video/mp4'
};

/** Map a request URL to a file; URL parsing resolves `..` segments, so paths can't leave PAGES_DIR. */
function resolveFile(url = '/'): string {
	const { pathname } = new URL(url, TEST_SERVER_URL);
	if (pathname.endsWith('/test-video.mp4')) return VIDEO_FIXTURE;
	return path.join(PAGES_DIR, pathname === '/' ? 'video.html' : pathname);
}

/** Start the test HTTP server (loopback only) */
export function startServer(): Promise<void> {
	return new Promise((resolve, reject) => {
		server = http.createServer((req, res) => {
			const filePath = resolveFile(req.url);
			fs.readFile(filePath, (err, data) => {
				if (err) {
					res.writeHead(404);
					res.end('Not found');
					return;
				}
				res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
				res.end(data);
			});
		});

		server.on('error', reject);
		server.listen(PORT, HOST, () => resolve());
	});
}

/** Stop the test HTTP server */
export function stopServer(): Promise<void> {
	return new Promise((resolve) => {
		if (!server) {
			resolve();
			return;
		}
		server.close(() => {
			server = null;
			resolve();
		});
	});
}
