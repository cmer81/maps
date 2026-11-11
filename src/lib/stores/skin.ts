import { persisted } from 'svelte-persisted-store';

// Habillage du chrome (PROTOTYPE — cf. docs/superpowers/specs/2026-11-11-skin-retro-design.md).
// Indépendant de mode-watcher : la classe `.dark` reste posée (elle pilote `&dark=true`
// des URL om:// → palettes raster), le skin est une couche `[data-skin]` par-dessus.
// L'attribut est posé avant le premier rendu par un script inline de app.html
// (anti-FOUC), puis tenu à jour par +layout.svelte.
export type Skin = 'modern' | 'retro';

export const DEFAULT_SKIN: Skin = 'modern';

export const isSkin = (value: unknown): value is Skin => value === 'modern' || value === 'retro';

export const skin = persisted<Skin>('skin', DEFAULT_SKIN);
