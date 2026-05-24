<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';

	import { helpOpen } from '$lib/stores/preferences';

	import * as Dialog from '$lib/components/ui/dialog';
	import * as Kbd from '$lib/components/ui/kbd';

	const smallerDesktop = new MediaQuery('min-width: 640px');
</script>

<Dialog.Root bind:open={$helpOpen}>
	<Dialog.Content
		class="z-90 bg-glass/80 backdrop-blur-sm shaded-md min-h-1/4 max-h-[90vh] overflow-y-scroll pb-18 border-none"
	>
		<Dialog.Header>
			<Dialog.Title class="text-2xl">Aide</Dialog.Title>
		</Dialog.Header>
		{#if smallerDesktop.current}
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="flex flex-col">
					<div class="flex items-center mb-2 gap-1.25 -ml-0.5">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							opacity="0.75"
							stroke-width="1.75"
							width="23"
							height="23"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-calendar-off-icon lucide-calendar-off"
							><path d="M16 14v2.2l1.6 1"></path><path d="M16 2v4"></path><path
								d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"
							></path><path d="M3 10h5"></path><path d="M8 2v4"></path><circle cx="16" cy="16" r="6"
							></circle></svg
						>
						<h2 class="text-lg font-bold">Sélecteur de temps</h2>
					</div>
					<div class="flex flex-col gap-1">
						<div class="flex items-center gap-2">
							<Kbd.Root>↓</Kbd.Root> Jour précédent
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>↑</Kbd.Root> Jour suivant
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>←</Kbd.Root> Heure précédente
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>→</Kbd.Root> Heure suivante
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>c</Kbd.Root> Aller à l'heure actuelle
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>m</Kbd.Root> Verrouiller le run
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>n</Kbd.Root> Dernier run
						</div>
						<div class="mt-3 flex items-center gap-2">
							<Kbd.Root>ctrl</Kbd.Root> +
							<Kbd.Root>←</Kbd.Root> Run précédent
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>ctrl</Kbd.Root> +
							<Kbd.Root>→</Kbd.Root> Run suivant
						</div>
					</div>
				</div>

				<div>
					<div class="flex items-center mb-2 gap-1.25 -ml-0.5">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							opacity="0.75"
							stroke-width="1.75"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-variable-icon lucide-variable"
							><path d="M8 21s-4-3-4-9 4-9 4-9"></path><path d="M16 3s4 3 4 9-4 9-4 9"></path><line
								x1="15"
								x2="9"
								y1="9"
								y2="15"
							></line><line x1="9" x2="15" y1="9" y2="15"></line></svg
						>
						<h2 class="text-lg font-bold">Variables</h2>
					</div>
					<div class="flex flex-col gap-1">
						<div class="flex items-center gap-2">
							<Kbd.Root>d</Kbd.Root> Sélection du domaine
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>v</Kbd.Root> Sélection de la variable
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>l</Kbd.Root> Sélection du niveau
						</div>
					</div>

					<div class="flex items-center mb-2 gap-1.25 mt-6">
						<h2 class="text-lg font-bold">Infobulle</h2>
					</div>
					<div class="flex flex-col gap-1">
						<div class="flex items-center gap-2">
							<Kbd.Root>p</Kbd.Root> Mode infobulle : suit la souris / déplaçable / désactivée
						</div>
					</div>
				</div>
			</div>
		{/if}
		<div>
			<div class="flex items-center mb-2 gap-1.5 -ml-0.5">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="23"
					height="23"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					opacity="0.75"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-toggle-left-icon lucide-toggle-left"
					><circle cx="9" cy="12" r="3" /><rect width="20" height="14" x="2" y="5" rx="7" /></svg
				>
				<h2 class="text-lg font-bold">Boutons</h2>
			</div>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2">
						<div class="maplibregl-ctrl maplibregl-ctrl-group">
							<button
								class="maplibregl-ctrl-zoom-in"
								type="button"
								title="Zoomer"
								aria-label="Explication : zoomer"
								aria-disabled="false"
								><span class="maplibregl-ctrl-icon" aria-hidden="true"></span></button
							><button
								class="maplibregl-ctrl-zoom-out"
								type="button"
								title="Dézoomer"
								aria-label="Explication : dézoomer"
								aria-disabled="false"
								><span class="maplibregl-ctrl-icon" aria-hidden="true"></span></button
							><button
								class="maplibregl-ctrl-compass"
								type="button"
								title="Réorienter vers le nord"
								aria-label="Explication : réorienter vers le nord"
								><span
									class="maplibregl-ctrl-icon"
									aria-hidden="true"
									style="transform: scale(1) rotateZ(0deg) rotateX(0deg) rotateZ(0deg);"
								></span></button
							>
						</div>
						<div class="flex flex-col gap-1.75">
							<div class="truncate">Zoomer</div>
							<div class="truncate">Dézoomer</div>
							<div class="truncate">Réinitialiser inclinaison / rotation</div>
						</div>
					</div>

					<div class="flex items-center gap-2">
						<div class="maplibregl-ctrl maplibregl-ctrl-group">
							<button
								class="maplibregl-ctrl-geolocate"
								type="button"
								title="Me localiser"
								aria-label="Explication : me localiser"
								aria-pressed="false"
								><span class="maplibregl-ctrl-icon" aria-hidden="true"></span></button
							>
						</div>
						<div class="truncate">Localiser l'utilisateur</div>
					</div>

					<div class="flex items-center gap-2">
						<div class="maplibregl-ctrl maplibregl-ctrl-group">
							<button
								class="maplibregl-ctrl-globe"
								aria-label="Explication : bouton globe"
								type="button"
								title="Activer le globe"
								><span class="maplibregl-ctrl-icon" aria-hidden="true"></span></button
							>
						</div>
						<div class="truncate">Projection globe</div>
					</div>
					<div class="flex items-center gap-2">
						<div title="Mode sombre" class="maplibregl-ctrl maplibregl-ctrl-group">
							<button
								aria-label="Explication : bouton mode sombre"
								style="display:flex;justify-content:center;align-items:center;"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									opacity="0.75"
									stroke-width="1.2"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="lucide lucide-moon-icon lucide-moon"
									><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg
								>
							</button>
						</div>
						<div class="truncate">Mode sombre / clair</div>
					</div>
				</div>
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2">
						<div title="Paramètres" class="maplibregl-ctrl maplibregl-ctrl-group">
							<button
								style="display:flex;justify-content:center;align-items:center;"
								aria-label="Explication : bouton paramètres"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									opacity="0.75"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="lucide lucide-settings-icon lucide-settings"
									><path
										d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
									></path><circle cx="12" cy="12" r="3"></circle></svg
								>
							</button>
						</div>
						<div class="truncate">Paramètres avancés</div>
					</div>
					<div class="flex items-center gap-2">
						<div class="maplibregl-ctrl maplibregl-ctrl-group" title="Sélecteur de temps">
							<button
								style="display:flex;justify-content:center;align-items:center;"
								aria-label="Explication : sélecteur de temps"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									opacity="0.75"
									stroke-width="1.2"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="lucide lucide-calendar-off-icon lucide-calendar-off"
									><path d="M16 14v2.2l1.6 1"></path><path d="M16 2v4"></path><path
										d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"
									></path><path d="M3 10h5"></path><path d="M8 2v4"></path><circle
										cx="16"
										cy="16"
										r="6"
									></circle></svg
								>
							</button>
						</div>
						<div class="truncate">Activer / désactiver le sélecteur de temps</div>
					</div>

					<div class="flex items-center gap-2">
						<div class="maplibregl-ctrl maplibregl-ctrl-group" title="Découpage">
							<button
								style="display:flex;justify-content:center;align-items:center;"
								aria-label="Explication : bouton découpage"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									opacity="0.75"
									stroke-width="1.2"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="lucide lucide-scissors-icon lucide-scissors"
									><circle cx="6" cy="6" r="3" /><path d="M8.12 8.12 12 12" /><path
										d="M20 4 8.12 15.88"
									/><circle cx="6" cy="18" r="3" /><path d="M14.8 14.8 20 20" /></svg
								>
							</button>
						</div>
						<div class="truncate">Panneau de découpage</div>
					</div>

					<div class="flex items-center gap-2">
						<div class="maplibregl-ctrl maplibregl-ctrl-group" title="Relief ombré">
							<button
								style="display:flex;justify-content:center;align-items:center;"
								aria-label="Explication : bouton relief ombré"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									opacity="0.75"
									stroke-width="1.2"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="lucide lucide-mountain-snow-icon lucide-mountain-snow"
									><path d="m8 3 4 8 5-5 5 15H2L8 3z"></path><path
										d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"
									></path></svg
								>
							</button>
						</div>
						<div class="truncate">Relief ombré</div>
					</div>

					<div class="flex items-center gap-2">
						<div class="maplibregl-ctrl maplibregl-ctrl-group">
							<button
								class="maplibregl-ctrl-terrain"
								aria-label="Explication : bouton terrain 3D"
								type="button"
								title="Activer le terrain"
								><span class="maplibregl-ctrl-icon opacity-75" aria-hidden="true"></span></button
							>
						</div>
						<div class="truncate">Terrain 3D</div>
					</div>

					<div class="flex items-center gap-2">
						<button
							class="bg-glass/80 hover:bg-glass flex h-7.25 w-7.25 cursor-pointer items-center rounded p-0"
							aria-label="Masquer la sélection de variable"
							><svg
								opacity="0.75"
								xmlns="http://www.w3.org/2000/svg"
								width="17"
								height="17"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="lucide lucide-chevron-left-icon lucide-chevron-left -mr-1.25"
								><path d="m9 18 6-6-6-6" /></svg
							>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								opacity="0.65"
								stroke-width="1.75"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="lucide lucide-variable-icon lucide-variable"
								><path d="M8 21s-4-3-4-9 4-9 4-9"></path><path d="M16 3s4 3 4 9-4 9-4 9"
								></path><line x1="15" x2="9" y1="9" y2="15"></line><line
									x1="9"
									x2="15"
									y1="9"
									y2="15"
								></line></svg
							></button
						>
						<div class="truncate">Afficher / masquer la sélection de variable</div>
					</div>
				</div>
			</div>
		</div>
		<div>
			<div class="flex mb-2 items-center gap-1.25 -ml-0.5">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					opacity="0.75"
					stroke-width="1.75"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-settings-icon lucide-settings"
					><path
						d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
					></path><circle cx="12" cy="12" r="3"></circle></svg
				>
				<h2 class=" text-lg font-bold">Paramètres avancés</h2>
			</div>
			<div class="grid grid-cols-1 sm:gap-3 sm:grid-cols-2">
				<div>
					<div>
						<b>Unités</b> — Régler les unités de mesure pour les différentes variables (distance, température,
						précipitations, vitesse du vent).
					</div>
					<b>Grille</b> — Afficher les points de grille du modèle sous forme de points orange sur la
					carte
					<div>
						<b>Flèches</b> — Afficher des flèches directionnelles sur les cartes avec vitesse et direction
						(vent / houle)
					</div>
					<div><b>Isocontours</b> — Afficher des isolignes entre certains seuils</div>
					<div>
						<b>Requêtes partielles</b> — Ne charger que les données du viewport courant. Mise à jour au
						zoom / déplacement
					</div>
					<div>
						<b>Masquer les océans</b> — Superposer les océans aux tuiles générées. Utile pour certaines
						variables (p. ex. température du sol) où les valeurs en mer n'ont pas de sens
					</div>
				</div>
				<div>
					<div>
						<b>Taille des tuiles</b> — Taille en pixels des tuiles générées, <b><i>512 px</i></b> par
						défaut. Comme la tuile source fait toujours 512 px, des tailles plus petites réduisent le
						nombre de pixels à calculer par tuile, ce qui accélère le rendu. À l'inverse, augmenter la
						taille améliore la résolution et le rendu visuel, au prix d'un calcul plus lourd.
					</div>
				</div>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
