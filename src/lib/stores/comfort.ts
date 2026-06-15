import { writable } from 'svelte/store';

/**
 * Easter egg « Mode Confort™ » — déclenché par le paramètre d'URL secret
 * `?giec=non`. **Non persisté** : c'est une bizarrerie d'URL qu'on partage par
 * lien, pas un réglage. Quand actif, les barèmes de température sont miroités
 * (voir `color-scales/comfort.ts`) et un bandeau d'aveu s'affiche en permanence.
 */
export const comfortMode = writable(false);

/** Texte du bandeau (écran + watermark PNG) — l'aveu ironique qui voyage avec
 *  chaque capture pour que la blague ne puisse jamais être sortie de son contexte. */
export const COMFORT_BANNER_TEXT =
	'🛋️ Mode Confort activé — températures ajustées à vos convictions · Source : votre oncle au repas de Noël';
