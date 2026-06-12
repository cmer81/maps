/**
 * Harnais de vérification headless de la carte.
 *
 * Pourquoi : la suite Vitest tourne en environnement Node (logique pure) et ne
 * couvre PAS le rendu MapLibre ni le câblage des couches/popup. Certains bugs ne
 * sont visibles qu'à l'écran (contours parasites, mauvaise unité, mauvaise source
 * lue par le popup). Ce harnais charge la vraie carte dans Chrome (swiftshader) et
 * inspecte l'état rendu via l'instance exposée sur `window.__map` (DEV uniquement,
 * cf. `+page.svelte`).
 *
 * Usage :
 *   npm run verify:map                  # démarre `vite dev`, vérifie, s'arrête
 *   BASE_URL=http://localhost:5173 \     # ou cible un serveur déjà lancé
 *     node e2e/verify-map.mjs
 *   CHROME_PATH=/path/to/chrome npm run verify:map
 *
 * Prérequis : un Chrome/Chromium système + accès réseau aux OMfiles amont.
 * NON branché sur la CI (réseau + GPU requis) — outil de vérification manuelle.
 * Code de sortie : 0 si tout passe, 1 si une assertion échoue, 2 si setup KO.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

// ── Setup ────────────────────────────────────────────────────────────────────

const chromePath = [
	process.env.CHROME_PATH,
	'/usr/bin/google-chrome-stable',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser'
].find((p) => p && existsSync(p));

if (!chromePath) {
	console.error('❌ Chrome introuvable. Définir CHROME_PATH=/chemin/vers/chrome.');
	process.exit(2);
}

/** @type {import('node:child_process').ChildProcess | undefined} */
let serverProc;

async function ensureServer() {
	if (process.env.BASE_URL) return process.env.BASE_URL;
	// Binaire vite local lancé directement (sans la couche `npm run`) → un seul
	// process dans le groupe détaché, donc `stopServer()` le tue proprement sans
	// laisser de serveur orphelin (sinon npm est tué mais vite reste sur le port).
	const root = fileURLToPath(new URL('..', import.meta.url));
	const viteBin = `${root}node_modules/.bin/vite`;
	serverProc = spawn(viteBin, ['dev'], { cwd: root, detached: true });
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('dev server : timeout (60s)')), 60000);
		serverProc.stdout.on('data', (b) => {
			const match = String(b).match(/Local:\s+(http:\/\/localhost:\d+)/);
			if (match) {
				clearTimeout(timer);
				resolve(match[1]);
			}
		});
		serverProc.on('exit', () => reject(new Error('dev server : arrêt prématuré')));
	});
}

function stopServer() {
	if (!serverProc?.pid) return;
	// SIGKILL sur le GROUPE détaché (`-pid`) : tue vite ET ses sous-process
	// (esbuild, optimizer…) instantanément, sans dépendre d'un arrêt gracieux que
	// `process.exit()` n'attendrait pas → aucun serveur orphelin sur le port.
	try {
		process.kill(-serverProc.pid, 'SIGKILL');
	} catch {
		/* déjà arrêté */
	}
}

// ── Mini-framework d'assertions ───────────────────────────────────────────────

const results = [];
function check(name, ok, detail = '') {
	results.push({ name, ok: !!ok });
	console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Charge un état de carte et attend que le style + les tuiles soient prêts. */
async function load(page, params, hash = '') {
	const url = `${base}/${params}${hash}`;
	console.log(`\n→ ${url}`);
	await page.goto(url, { waitUntil: 'load', timeout: 60000 });
	await page.waitForFunction(() => window.__map?.isStyleLoaded?.(), { timeout: 30000 });
	await page.waitForTimeout(4000); // décode + génération des tuiles vecteur
}

// ── Vérifications ─────────────────────────────────────────────────────────────

let base;
let browser;
try {
	base = await ensureServer();
	console.log(`Serveur : ${base}\nChrome  : ${chromePath}`);
	browser = await chromium.launch({
		executablePath: chromePath,
		args: [
			'--use-gl=swiftshader',
			'--enable-unsafe-swiftshader',
			'--no-sandbox',
			'--disable-dev-shm-usage'
		]
	});

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

	// A) Overlay vent + contours : pas de contours parasites du vent ; les contours
	//    suivent la variable affichée ; les flèches de vent sont bien là. (cf. #81)
	console.log('\n=== A. Overlay vent + isocontours (température) ===');
	await load(
		page,
		'?domain=meteofrance_arome_france_hd&variable=temperature_2m&contours=true&interval=2&arrows=true&wind_overlay=true&wind_overlay_level=10m',
		'#11/43.57/3.95'
	);
	const a = await page.evaluate(() => {
		const m = window.__map;
		const fc = (prefix, sl) => {
			const n = (id) => {
				try {
					return m.getSource(id) ? m.querySourceFeatures(id, { sourceLayer: sl }).length : 0;
				} catch {
					return 0;
				}
			};
			return n(`${prefix}_A`) + n(`${prefix}_B`);
		};
		const variable = (prefix) => {
			const url = m.getSource(`${prefix}_A`)?.url ?? m.getSource(`${prefix}_B`)?.url ?? '';
			return (url.match(/variable=([^&]+)/) ?? [, ''])[1];
		};
		return {
			windContours: fc('omWindArrowSource', 'contours'),
			windArrows: fc('omWindArrowSource', 'wind-arrows'),
			displayedContours: fc('omVectorSource', 'contours'),
			vectorVar: variable('omVectorSource')
		};
	});
	check(
		'source vent ne génère AUCUN contour parasite',
		a.windContours === 0,
		`contours=${a.windContours}`
	);
	check('flèches de vent présentes', a.windArrows > 0, `flèches=${a.windArrows}`);
	check(
		'contours générés sur la variable affichée',
		a.displayedContours > 0,
		`contours=${a.displayedContours}`
	);
	check('vectorManager porte la variable affichée', a.vectorVar === 'temperature_2m', a.vectorVar);

	// B) Étiquettes d'isolignes du vent converties dans l'unité d'affichage (km/h
	//    par défaut → ×3.6). (cf. #82 bug 1)
	console.log('\n=== B. Unité des étiquettes d’isolignes (vent → km/h) ===');
	await load(
		page,
		'?domain=meteofrance_arome_france_hd&variable=wind_speed_10m&contours=true',
		'#9/43.6/3.9'
	);
	const textField = await page.evaluate(() => {
		const m = window.__map;
		const id = m
			.getStyle()
			.layers.map((l) => l.id)
			.find((x) => /omVectorContourLayerLabels/.test(x));
		return id ? JSON.stringify(m.getLayoutProperty(id, 'text-field')) : null;
	});
	check(
		'text-field convertit en km/h (number-format ×3.6)',
		typeof textField === 'string' &&
			textField.includes('number-format') &&
			textField.includes('3.6'),
		String(textField)
	);

	// C) Routage des sources du popup en mode calque : la vitesse du vent doit venir
	//    de l'arrowManager (wind_u_component), pas de la variable affichée. (cf. #82 bug 2)
	console.log('\n=== C. Source du vent lue par le popup (mode calque) ===');
	await load(
		page,
		'?domain=meteofrance_arome_france_hd&variable=temperature_2m&arrows=true&wind_overlay=true&wind_overlay_level=10m',
		'#11/43.57/3.95'
	);
	const c = await page.evaluate(() => {
		const m = window.__map;
		const variable = (prefix) => {
			const url = m.getSource(`${prefix}_A`)?.url ?? m.getSource(`${prefix}_B`)?.url ?? '';
			return (url.match(/variable=([^&]+)/) ?? [, ''])[1];
		};
		return { arrow: variable('omWindArrowSource'), vector: variable('omVectorSource') };
	});
	check(
		'arrowManager = source vent (lue par le popup)',
		/^wind_u_component/.test(c.arrow),
		c.arrow
	);
	check('vectorManager = variable affichée (pas le vent)', c.vector === 'temperature_2m', c.vector);
} catch (err) {
	console.error('\n❌ Erreur de vérification :', err instanceof Error ? err.message : err);
	check('exécution du harnais', false, 'exception inattendue');
} finally {
	await browser?.close();
	stopServer();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications OK`);
process.exit(failed.length || results.length === 0 ? 1 : 0);
