import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

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

const viteServerConfig = (): Plugin => ({
	name: 'add-headers',
	configureServer: (server: ViteDevServer) => {
		server.middlewares.use((_req: IncomingMessage, res: ServerResponse, next: () => void) => {
			addHeaders(res);
			next();
		});
	},
	configurePreviewServer: (server: PreviewServer) => {
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

	// Proxy optionnel de l'API Weather AI (même origine) : le portail renvoie
	// l'en-tête CORS depuis le 18/10/2026 (chom-poc-data#258), l'app l'appelle
	// donc en direct par défaut. Utile pour diagnostiquer en local
	// (`VITE_WEATHER_AI_API_URL=/api/weather-ai`). Sans effet en prod (export statique).
	const weatherAiProxy = {
		'/api/weather-ai': { target: 'https://portail.chom.engineering', changeOrigin: true }
	};

	return defineConfig({
		plugins: [tailwindcss(), sveltekit(), viteServerConfig()],
		optimizeDeps: {
			exclude: ['@openmeteo/file-reader', '@openmeteo/file-format-wasm']
		},
		server: {
			allowedHosts,
			proxy: weatherAiProxy,
			fs: {
				// Allow serving files from one level up to the project root
				allow: ['..']
			}
		},
		preview: { proxy: weatherAiProxy },
		build: { chunkSizeWarningLimit: 1500 }
	});
};
