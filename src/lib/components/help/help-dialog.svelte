<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';

	import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import PlayIcon from '@lucide/svelte/icons/play';

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
				<h2 class="mb-2 flex items-center gap-1.5 text-lg font-bold">
					<ClockIcon class="size-5 opacity-75" /> Naviguer dans le temps
				</h2>
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
					<summary class="flex cursor-pointer list-none items-center gap-1.5 text-sm opacity-90">
						<ChevronRightIcon
							class="size-4 opacity-75 transition-transform group-open:rotate-90 motion-reduce:transition-none"
						/>
						<h3 class="font-medium">Détails de l'animation</h3>
					</summary>
					<p class="mt-1.5 ml-5.5 text-sm opacity-80">
						La lecture boucle sur la plage choisie : <b>Aujourd'hui</b>, <b>24 h suivantes</b>,
						<b>24 h précédentes</b> ou <b>Run complet</b>. Utiliser le préchargement avant de lancer
						l'animation pour éviter les saccades.
					</p>
				</details>
			</section>
		</div>
	</Dialog.Content>
</Dialog.Root>
