import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

import { weatherAiUpstreamUrl } from './src/lib/weather-ai/proxy.js';

import type { IncomingMessage, ServerResponse } from 'http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';

const addHeaders = (res: ServerResponse) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET');
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
	// `require-corp` works because the R2 bucket is served via a custom
	// Cloudflare domain (cumul-om.infoclimat.net) with a Transform Rule
	// injecting `Cross-Origin-Resource-Policy: cross-origin`. Universal
	// COEP support (incl. Safari) for the price of one CF rule.
	res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
	res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
};

const weatherAiProxy = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
	const url = new URL(req.url ?? '/', 'http://localhost');
	if (!url.pathname.startsWith('/api/weather-ai/')) return next();
	const upstream = weatherAiUpstreamUrl(url.href);
	if (!upstream) {
		res.writeHead(404);
		res.end();
		return;
	}
	if (req.method !== 'GET') {
		res.writeHead(405, { Allow: 'GET' });
		res.end();
		return;
	}
	try {
		const response = await fetch(upstream, {
			headers: { Accept: 'application/json' },
			redirect: 'error',
			signal: AbortSignal.timeout(30000)
		});
		res.writeHead(response.status, {
			'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
			'Cache-Control': 'no-store'
		});
		res.end(Buffer.from(await response.arrayBuffer()));
	} catch {
		res.writeHead(502, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Weather AI upstream unavailable' }));
	}
};

const viteServerConfig = (): Plugin => ({
	name: 'add-headers',
	configureServer: (server: ViteDevServer) => {
		server.middlewares.use(weatherAiProxy);
		server.middlewares.use((_req: IncomingMessage, res: ServerResponse, next: () => void) => {
			addHeaders(res);
			next();
		});
	},
	configurePreviewServer: (server: PreviewServer) => {
		server.middlewares.use(weatherAiProxy);
		server.middlewares.use((_req: IncomingMessage, res: ServerResponse, next: () => void) => {
			addHeaders(res);
			next();
		});
	}
});

export default ({ mode }: { mode: string }) => {
	process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

	// Hôtes autorisés à atteindre le dev/preview server, EN PLUS de localhost
	// (toujours permis par Vite). Par machine via .env.local — p. ex.
	// `DEV_ALLOWED_HOSTS=.home.cmer.fr,foo.tunnel` — pour ne pas committer de
	// domaine perso. Vide par défaut (forks). Aucun effet en prod : le build est
	// un export statique, il n'y a pas de serveur Vite.
	const allowedHosts = (loadEnv(mode, process.cwd(), 'DEV_').DEV_ALLOWED_HOSTS ?? '')
		.split(',')
		.map((h) => h.trim())
		.filter(Boolean);

	return defineConfig({
		plugins: [tailwindcss(), sveltekit(), viteServerConfig()],
		optimizeDeps: {
			exclude: ['@openmeteo/file-reader', '@openmeteo/file-format-wasm']
		},
		server: {
			allowedHosts,
			fs: {
				// Allow serving files from one level up to the project root
				allow: ['..']
			}
		},
		build: { chunkSizeWarningLimit: 1500 }
	});
};
