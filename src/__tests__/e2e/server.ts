import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3333;
const PAGES_DIR = path.join(__dirname, 'pages');
const FIXTURES_DIR = path.join(__dirname, '../fixtures');

let server: http.Server | null = null;

export const TEST_SERVER_PORT = PORT;
export const TEST_SERVER_URL = `http://localhost:${PORT}`;

/** MIME types for serving static files */
const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.mp4': 'video/mp4',
	'.js': 'application/javascript',
	'.css': 'text/css'
};

/** Start the test HTTP server */
export function startServer(): Promise<void> {
	return new Promise((resolve, reject) => {
		server = http.createServer((req, res) => {
			const urlPath = req.url === '/' ? '/video.html' : req.url || '/video.html';
			const ext = path.extname(urlPath);

			// Determine which directory to serve from
			let filePath: string;
			if (urlPath.includes('test-video.mp4')) {
				filePath = path.join(FIXTURES_DIR, 'test-video.mp4');
			} else {
				filePath = path.join(PAGES_DIR, urlPath);
			}

			fs.readFile(filePath, (err, data) => {
				if (err) {
					res.writeHead(404);
					res.end('Not found');
					return;
				}
				const contentType = MIME_TYPES[ext] || 'application/octet-stream';
				res.writeHead(200, { 'Content-Type': contentType });
				res.end(data);
			});
		});

		server.on('error', reject);
		server.listen(PORT, () => resolve());
	});
}

/** Stop the test HTTP server */
export function stopServer(): Promise<void> {
	return new Promise((resolve) => {
		if (server) {
			server.close(() => {
				server = null;
				resolve();
			});
		} else {
			resolve();
		}
	});
}
