---
description: Component organization, MapLibre IControl buttons, and shadcn-svelte UI primitives
paths:
  - 'src/lib/components/**'
---

# Components

Organized by feature under `src/lib/components/` (`buttons/`, `clipping/`, `time/`, `scale/`, `selection/`, `settings/`, `help/`, `keyboard/`, `dropzone/`, `loading/`, `sounding/`). Primitive UI lives under `src/lib/components/ui/` and is managed by `shadcn-svelte` — regenerate with `npm run upgrade:ui` (uses `components.json`). Aliases: `$lib/components`, `$lib/components/ui`, `$lib/utils`.

The map buttons (`ClippingButton`, `DarkModeButton`, `DepartmentsButton`, `HelpButton`, `HillshadeButton`, `LabelsButton`, `SettingsButton`) are MapLibre `IControl` implementations exported from `src/lib/components/buttons/index.ts`, added via `$map.addControl(...)`.

`sounding/` — panel tabulé (Skew-T / hodographe / indices) avec tracés SVG sur mesure, ouvert depuis le popup de valeur au clic sur la carte (`src/lib/popup.ts`). Voir `src/lib/sounding/` pour la logique pure associée.
