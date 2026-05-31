<script lang="ts">
	import { soundingButtonEnabled } from '$lib/stores/sounding';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
</script>

<div>
	<h2 class="text-lg font-bold">Sondage vertical</h2>
	<div class="mt-3 flex gap-3">
		<Switch id="sounding" class="cursor-pointer" bind:checked={$soundingButtonEnabled} />
		<Label for="sounding" class="cursor-pointer">
			Bouton « Sondage vertical » {$soundingButtonEnabled ? 'activé' : 'désactivé'}
		</Label>
	</div>
	<p class="mt-1 text-xs text-muted-foreground">
		Disponible uniquement sur AROME 0,025° (seul modèle à diffuser les niveaux de pression requis).
	</p>
</div>
