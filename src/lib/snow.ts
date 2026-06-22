/**
 * Logique pure des flocons du « Mode Confort » (easter egg ?giec=non), isolée du
 * rendu canvas pour rester testable en environnement node. Le composant
 * `snow-overlay.svelte` se contente d'instancier ces flocons et de les peindre.
 */
export interface Flake {
	/** position en fraction de la largeur/hauteur viewport [0,1] — résolution-agnostique */
	x: number;
	y: number;
	/** rayon en px */
	r: number;
	/** vitesse de chute en fraction de hauteur par seconde */
	speed: number;
	/** amplitude du balancement horizontal (fraction de largeur) */
	drift: number;
	/** phase du balancement (radians) */
	phase: number;
	/** vitesse de balancement (radians/s) */
	sway: number;
	/** opacité [0,1] */
	opacity: number;
}

/** Tire un nombre dans [min, max) via le générateur fourni (injectable pour les tests). */
const between = (rand: () => number, min: number, max: number): number =>
	min + rand() * (max - min);

/** Crée un flocon avec des caractéristiques aléatoires bornées. */
export const createFlake = (rand: () => number = Math.random): Flake => ({
	x: rand(),
	y: rand(),
	r: between(rand, 1, 3.5),
	speed: between(rand, 0.02, 0.06),
	drift: between(rand, 0.004, 0.02),
	phase: between(rand, 0, Math.PI * 2),
	sway: between(rand, 0.4, 1.2),
	opacity: between(rand, 0.4, 0.9)
});

/**
 * Avance un flocon de `dt` secondes : chute verticale + balancement sinusoïdal.
 * Quand il passe sous le bas (`y > 1`), il reboucle en haut (`y -= 1`) pour une
 * chute continue. Mutation en place (réutilise l'objet, zéro alloc par frame).
 */
export const stepFlake = (flake: Flake, dt: number): Flake => {
	flake.y += flake.speed * dt;
	flake.phase += flake.sway * dt;
	if (flake.y > 1) flake.y -= 1;
	return flake;
};

/** Position horizontale effective (base + balancement), en fraction de largeur. */
export const flakeX = (flake: Flake): number => flake.x + Math.sin(flake.phase) * flake.drift;
