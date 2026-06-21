<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';

	import BlendIcon from '@lucide/svelte/icons/blend';
	import BoxIcon from '@lucide/svelte/icons/box';
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';
	import CameraIcon from '@lucide/svelte/icons/camera';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import CompassIcon from '@lucide/svelte/icons/compass';
	import CropIcon from '@lucide/svelte/icons/crop';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import GaugeIcon from '@lucide/svelte/icons/gauge';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import Grid3x3Icon from '@lucide/svelte/icons/grid-3x3';
	import HashIcon from '@lucide/svelte/icons/hash';
	import KeyboardIcon from '@lucide/svelte/icons/keyboard';
	import LandPlotIcon from '@lucide/svelte/icons/land-plot';
	import Layers2Icon from '@lucide/svelte/icons/layers-2';
	import LocateFixedIcon from '@lucide/svelte/icons/locate-fixed';
	import MapIcon from '@lucide/svelte/icons/map';
	import MountainIcon from '@lucide/svelte/icons/mountain';
	import MousePointerClickIcon from '@lucide/svelte/icons/mouse-pointer-click';
	import PaletteIcon from '@lucide/svelte/icons/palette';
	import PlayIcon from '@lucide/svelte/icons/play';
	import ProportionsIcon from '@lucide/svelte/icons/proportions';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import RulerIcon from '@lucide/svelte/icons/ruler';
	import ScissorsIcon from '@lucide/svelte/icons/scissors';
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import SplineIcon from '@lucide/svelte/icons/spline';
	import SquareMousePointerIcon from '@lucide/svelte/icons/square-mouse-pointer';
	import SunMoonIcon from '@lucide/svelte/icons/sun-moon';
	import ThermometerIcon from '@lucide/svelte/icons/thermometer';
	import WindIcon from '@lucide/svelte/icons/wind';

	import { helpOpen } from '$lib/stores/preferences';

	import * as Dialog from '$lib/components/ui/dialog';
	import * as Kbd from '$lib/components/ui/kbd';

	// Masque les pastilles clavier sur mobile (pas de clavier physique).
	const isDesktop = new MediaQuery('min-width: 640px');
</script>

<Dialog.Root bind:open={$helpOpen}>
	<Dialog.Content
		class="z-90 bg-glass/80 backdrop-blur-sm shaded-md min-h-1/4 max-h-[90vh] overflow-y-scroll pb-18 border-none"
	>
		<Dialog.Header>
			<Dialog.Title class="text-2xl">Aide</Dialog.Title>
		</Dialog.Header>

		<div class="flex flex-col gap-6">
			<!-- 1. Naviguer dans le temps -->
			<section>
				<h3 class="mb-2 flex items-center gap-1.5 text-lg font-bold">
					<ClockIcon class="size-5 opacity-75" /> Naviguer dans le temps
				</h3>
				<ul class="flex flex-col gap-1.5">
					<li class="flex items-start gap-2.5">
						<CalendarClockIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Sélecteur de temps</span> — afficher / masquer la barre temporelle</span
						>
					</li>
					{#if isDesktop.current}
						<li class="flex items-center gap-2.5">
							<Kbd.Root>↓</Kbd.Root><Kbd.Root>↑</Kbd.Root>
							<span>Jour précédent / suivant</span>
						</li>
						<li class="flex items-center gap-2.5">
							<Kbd.Root>←</Kbd.Root><Kbd.Root>→</Kbd.Root>
							<span>Heure précédente / suivante</span>
						</li>
						<li class="flex items-center gap-2.5">
							<Kbd.Root>c</Kbd.Root> <span>Aller à l'heure actuelle</span>
						</li>
						<li class="flex items-center gap-2.5">
							<Kbd.Root>m</Kbd.Root> <span>Verrouiller le run</span>
						</li>
						<li class="flex items-center gap-2.5">
							<Kbd.Root>n</Kbd.Root> <span>Dernier run</span>
						</li>
						<li class="flex items-center gap-2.5">
							<Kbd.Root>ctrl</Kbd.Root> + <Kbd.Root>←</Kbd.Root><Kbd.Root>→</Kbd.Root>
							<span>Run précédent / suivant</span>
						</li>
					{/if}
					<li class="flex items-start gap-2.5">
						<PlayIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span><span class="font-medium">Animation</span> — lit la plage de temps en boucle</span
						>
					</li>
					<li class="flex items-start gap-2.5">
						<DownloadIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Préchargement</span> — charge la plage à l'avance pour fluidifier
							l'animation</span
						>
					</li>
				</ul>
				<details class="group mt-2 ml-7">
					<summary
						class="flex cursor-pointer list-none items-center gap-1.5 text-sm opacity-90 [&::-webkit-details-marker]:hidden"
					>
						<ChevronRightIcon
							class="size-4 opacity-75 transition-transform group-open:rotate-90 motion-reduce:transition-none"
						/>
						<h4 class="font-medium">Détails de l'animation</h4>
					</summary>
					<p class="mt-1.5 ml-5.5 text-sm opacity-80">
						La lecture boucle sur la plage choisie : <b>Aujourd'hui</b>, <b>24 h suivantes</b>,
						<b>24 h précédentes</b> ou <b>Run complet</b>. Utiliser le préchargement avant de lancer
						l'animation pour éviter les saccades.
					</p>
				</details>
			</section>

			<!-- 2. Choisir les données -->
			<section>
				<h3 class="mb-2 flex items-center gap-1.5 text-lg font-bold">
					<DatabaseIcon class="size-5 opacity-75" /> Choisir les données
				</h3>
				<ul class="flex flex-col gap-1.5">
					{#if isDesktop.current}
						<li class="flex items-center gap-2.5">
							<Kbd.Root>d</Kbd.Root> <span>Sélection du domaine (modèle)</span>
						</li>
						<li class="flex items-center gap-2.5">
							<Kbd.Root>v</Kbd.Root> <span>Sélection de la variable</span>
						</li>
						<li class="flex items-center gap-2.5">
							<Kbd.Root>l</Kbd.Root> <span>Sélection du niveau</span>
						</li>
					{/if}
					<li class="flex items-start gap-2.5">
						<ChevronLeftIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Sélection de variable</span> — afficher / masquer le panneau
							de choix</span
						>
					</li>
					<li class="flex items-start gap-2.5">
						<Layers2Icon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Couche superposée</span> — afficher une 2ᵉ variable par-dessus
							la principale, avec une opacité indépendante</span
						>
					</li>
				</ul>
			</section>

			<!-- 3. Visualiser -->
			<section>
				<h3 class="mb-2 flex items-center gap-1.5 text-lg font-bold">
					<EyeIcon class="size-5 opacity-75" /> Visualiser
				</h3>
				<ul class="flex flex-col gap-1.5">
					<li class="flex items-start gap-2.5">
						<RulerIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Unités</span> — température, distance, géopotentiel, précipitations,
							vitesse du vent</span
						>
					</li>
					<li class="flex items-start gap-2.5">
						<Grid3x3Icon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Grille</span> — points du modèle, en orange sur la carte</span
						>
					</li>
					<li class="flex items-start gap-2.5">
						<HashIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Valeurs</span> — valeur chiffrée à chaque nœud de la grille (distinct
							de « Grille »)</span
						>
					</li>
					<li class="flex items-start gap-2.5">
						<WindIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Flèches</span> — direction et intensité (vent / houle) ; niveau
							et style (couleur, largeur) réglables</span
						>
					</li>
					<li class="flex items-start gap-2.5">
						<SplineIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Isocontours</span> — isolignes entre seuils ; intervalle, alignement
							des paliers et style réglables</span
						>
					</li>
					<li class="flex items-start gap-2.5">
						<BlendIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span><span class="font-medium">Opacité</span> — transparence des tuiles météo</span>
					</li>
					<li class="flex items-start gap-2.5">
						<PaletteIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Couleurs</span> — édition des paliers de l'échelle de couleur</span
						>
					</li>
					<li class="flex items-start gap-2.5">
						<ProportionsIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Taille des tuiles</span> — résolution de rendu ; 512 px par défaut
							(plus petit = plus rapide, plus grand = plus net)</span
						>
					</li>
				</ul>
			</section>

			<!-- 4. Interroger la carte -->
			<section>
				<h3 class="mb-2 flex items-center gap-1.5 text-lg font-bold">
					<MousePointerClickIcon class="size-5 opacity-75" /> Interroger la carte
				</h3>
				<ul class="flex flex-col gap-1.5">
					<li class="flex items-start gap-2.5">
						<SquareMousePointerIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span>
							<span class="font-medium">Infobulle</span> — valeur sous le curseur.
							{#if isDesktop.current}
								<Kbd.Root>p</Kbd.Root> bascule : désactivée / suit la souris / déplaçable.
							{/if}
						</span>
					</li>
					<li class="flex items-start gap-2.5">
						<ThermometerIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Sondage vertical</span> — profil atmosphérique au clic sur la
							carte</span
						>
					</li>
				</ul>
				<details class="group mt-2 ml-7">
					<summary
						class="flex cursor-pointer list-none items-center gap-1.5 text-sm opacity-90 [&::-webkit-details-marker]:hidden"
					>
						<ChevronRightIcon
							class="size-4 opacity-75 transition-transform group-open:rotate-90 motion-reduce:transition-none"
						/>
						<h4 class="font-medium">Détails du sondage</h4>
					</summary>
					<p class="mt-1.5 ml-5.5 text-sm opacity-80">
						Trois onglets : <b>Skew-T</b>, <b>hodographe</b> et <b>indices</b> thermodynamiques. Le profil
						se met à jour en suivant la lecture du temps. Disponible sur les domaines AROME. Le bouton
						d'accès s'active dans les réglages avancés (« Sondage vertical »).
					</p>
				</details>
			</section>

			<!-- 5. Cadrer & exporter -->
			<section>
				<h3 class="mb-2 flex items-center gap-1.5 text-lg font-bold">
					<CropIcon class="size-5 opacity-75" /> Cadrer &amp; exporter
				</h3>
				<ul class="flex flex-col gap-1.5">
					<li class="flex items-start gap-2.5">
						<ScissorsIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Découpage</span> — limiter le rendu à une zone dessinée ou à
							un pays</span
						>
					</li>
					<li class="flex items-start gap-2.5">
						<CameraIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Capture</span> — exporter la vue en image PNG avec filigrane</span
						>
					</li>
				</ul>
				<details class="group mt-2 ml-7">
					<summary
						class="flex cursor-pointer list-none items-center gap-1.5 text-sm opacity-90 [&::-webkit-details-marker]:hidden"
					>
						<ChevronRightIcon
							class="size-4 opacity-75 transition-transform group-open:rotate-90 motion-reduce:transition-none"
						/>
						<h4 class="font-medium">Détails du découpage et de la capture</h4>
					</summary>
					<div class="mt-1.5 ml-5.5 flex flex-col gap-2 text-sm opacity-80">
						<p>
							<b>Découpage</b> : modes sélection, rectangle, polygone, main levée ou pinceau, plus un
							sélecteur de pays. La zone est mémorisée d'une session à l'autre.
						</p>
						<p>
							<b>Capture</b> : cadrage paysage (4:3) ou portrait (3:4), filigrane automatique (run, échéance,
							domaine et variable), puis téléchargement ou partage.
						</p>
					</div>
				</details>
			</section>

			<!-- 6. Repères & rendu -->
			<section>
				<h3 class="mb-2 flex items-center gap-1.5 text-lg font-bold">
					<MapIcon class="size-5 opacity-75" /> Repères &amp; rendu
				</h3>
				<ul class="flex flex-col gap-1.5">
					<li class="flex items-start gap-2.5">
						<SunMoonIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Mode sombre / clair</span> — thème du fond de carte</span
						>
					</li>
					<li class="flex items-start gap-2.5">
						<MountainIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span><span class="font-medium">Relief ombré</span> — ombrage du relief</span>
					</li>
					<li class="flex items-start gap-2.5">
						<BoxIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span><span class="font-medium">Terrain 3D</span> — relief en perspective</span>
					</li>
					<li class="flex items-start gap-2.5">
						<GlobeIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Projection globe</span> — vue sphérique de la Terre</span
						>
					</li>
					<li class="flex items-start gap-2.5">
						<LandPlotIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Départements</span> — contours administratifs français</span
						>
					</li>
					<li class="flex items-start gap-2.5">
						<Building2Icon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Villes &amp; pays</span> — libellés du fond de carte</span
						>
					</li>
					<li class="flex items-start gap-2.5">
						<LocateFixedIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span><span class="font-medium">Me localiser</span> — centrer sur ma position</span>
					</li>
					<li class="flex items-start gap-2.5">
						<CompassIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
						<span
							><span class="font-medium">Zoom &amp; boussole</span> — zoomer / dézoomer ; réinitialiser
							l'inclinaison et la rotation</span
						>
					</li>
				</ul>
			</section>

			<!-- Performances — astuce mise en valeur -->
			<section class="rounded-lg border border-sky-400/30 bg-sky-400/10 p-3">
				<h3 class="mb-1.5 flex items-center gap-1.5 font-bold text-sky-700 dark:text-sky-300">
					<GaugeIcon class="size-5 opacity-90" /> Performances — fluidifier l'affichage
				</h3>
				<p class="mb-2 text-sm opacity-90">
					Si la carte rame ou s'affiche par à-coups (ordinateur ancien, carte graphique modeste),
					trois réglages du panneau « Calques &amp; réglages » améliorent la fluidité :
				</p>
				<ul class="flex list-disc flex-col gap-1.5 pl-5 text-sm opacity-90">
					<li>
						<b>Taille des tuiles</b> — la <b>réduire</b> (256, voire 128 px au lieu de 512) : moins de
						pixels à calculer par tuile, donc un rendu nettement plus rapide. C'est le premier levier
						sur une machine lente.
					</li>
					<li>
						<b>Cache max (Mo)</b> — l'<b>augmenter</b> : garde plus de données en mémoire, donc moins
						de rechargements pendant l'animation et les déplacements (si l'ordinateur a assez de mémoire).
					</li>
					<li>
						<b>Taille des blocs</b> — des blocs <b>plus gros</b> réduisent le nombre de requêtes
						réseau (utile si le chargement saccade) ; des blocs <b>plus petits</b> évitent de télécharger
						des données inutiles sur une connexion lente.
					</li>
				</ul>
			</section>

			<!-- 7. Réglages avancés -->
			<section>
				<details class="group">
					<summary
						class="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden"
					>
						<ChevronRightIcon
							class="size-5 opacity-75 transition-transform group-open:rotate-90 motion-reduce:transition-none"
						/>
						<h3 class="flex items-center gap-1.5 text-lg font-bold">
							<Settings2Icon class="size-5 opacity-75" /> Réglages avancés
						</h3>
					</summary>
					<ul class="mt-2 ml-6 flex flex-col gap-1.5">
						<li class="flex items-start gap-2.5">
							<RotateCcwIcon class="mt-0.5 size-4.5 shrink-0 opacity-75" />
							<span
								><span class="font-medium">Réinitialiser</span> — restaurer tous les réglages par défaut</span
							>
						</li>
					</ul>
				</details>
			</section>

			{#if isDesktop.current}
				<!-- Général (raccourcis globaux) -->
				<section class="border-t border-white/10 pt-3 text-sm opacity-80">
					<h3 class="mb-2 flex items-center gap-1.5 font-bold">
						<KeyboardIcon class="size-4.5 opacity-75" /> Général
					</h3>
					<ul class="flex flex-col gap-1.5">
						<li class="flex items-center gap-2.5">
							<Kbd.Root>h</Kbd.Root> <span>Ouvrir / fermer cette aide</span>
						</li>
						<li class="flex items-center gap-2.5">
							<Kbd.Root>Échap</Kbd.Root>
							<span>Fermer l'infobulle / réinitialiser le mode infobulle</span>
						</li>
					</ul>
				</section>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
