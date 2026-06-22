<!--
	Flocons du « Mode Confort » (?giec=non). Canvas plein écran en pointer-events-none
	au-dessus de la carte, sous le chrome. Particules pilotées par la logique pure de
	`$lib/snow`. Respecte prefers-reduced-motion (pas d'animation si l'utilisateur la
	refuse). L'animation ne tourne QUE pendant le Mode Confort (boucle rAF démarrée/
	arrêtée par un $effect) — zéro coût quand l'easter egg est inactif.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';

	import { comfortMode } from '$lib/stores/comfort';

	import { type Flake, createFlake, flakeX, stepFlake } from '$lib/snow';

	const FLAKE_COUNT = 90;

	let canvas: HTMLCanvasElement;
	let flakes: Flake[] = [];
	let raf = 0;
	let lastTs = 0;
	let dpr = 1;

	const reducedMotion = () =>
		typeof window !== 'undefined' &&
		window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

	const resize = () => {
		if (!canvas) return;
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = window.innerWidth * dpr;
		canvas.height = window.innerHeight * dpr;
	};

	const draw = (ts: number) => {
		const ctx = canvas?.getContext('2d');
		if (!ctx) return;
		const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0;
		lastTs = ts;

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = '#ffffff';
		for (const flake of flakes) {
			stepFlake(flake, dt);
			ctx.globalAlpha = flake.opacity;
			ctx.beginPath();
			ctx.arc(flakeX(flake) * canvas.width, flake.y * canvas.height, flake.r * dpr, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
		raf = requestAnimationFrame(draw);
	};

	const start = () => {
		if (raf || !canvas || reducedMotion()) return;
		resize();
		flakes = Array.from({ length: FLAKE_COUNT }, () => createFlake());
		window.addEventListener('resize', resize);
		lastTs = 0;
		raf = requestAnimationFrame(draw);
	};

	const stop = () => {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		window.removeEventListener('resize', resize);
		const ctx = canvas?.getContext('2d');
		if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
	};

	$effect(() => {
		if ($comfortMode) start();
		else stop();
	});

	onDestroy(stop);
</script>

<canvas
	bind:this={canvas}
	class="pointer-events-none fixed inset-0 z-40 h-screen w-screen"
	class:hidden={!$comfortMode}
	aria-hidden="true"
></canvas>
