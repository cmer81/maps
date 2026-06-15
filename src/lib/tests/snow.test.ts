import { describe, expect, it } from 'vitest';

import { createFlake, flakeX, stepFlake } from '$lib/snow';

describe('createFlake', () => {
	it('produit des caractéristiques bornées et déterministes avec un rand fixe', () => {
		const flake = createFlake(() => 0.5);
		expect(flake.x).toBe(0.5);
		expect(flake.y).toBe(0.5);
		expect(flake.r).toBeGreaterThan(0);
		expect(flake.opacity).toBeGreaterThan(0);
		expect(flake.opacity).toBeLessThanOrEqual(1);
	});
});

describe('stepFlake', () => {
	it('fait tomber le flocon vers le bas', () => {
		const flake = createFlake(() => 0.5);
		const y0 = flake.y;
		stepFlake(flake, 1);
		expect(flake.y).toBeGreaterThan(y0);
	});

	it('reboucle en haut quand le flocon passe sous le bas', () => {
		const flake = createFlake(() => 0.5);
		flake.y = 0.99;
		flake.speed = 0.05;
		stepFlake(flake, 1); // 0.99 + 0.05 = 1.04 > 1 → -1
		expect(flake.y).toBeCloseTo(0.04, 5);
	});
});

describe('flakeX', () => {
	it('applique le balancement sinusoïdal autour de la position de base', () => {
		const flake = createFlake(() => 0.5);
		flake.x = 0.5;
		flake.drift = 0.1;
		flake.phase = Math.PI / 2; // sin = 1
		expect(flakeX(flake)).toBeCloseTo(0.6, 5);
	});
});
