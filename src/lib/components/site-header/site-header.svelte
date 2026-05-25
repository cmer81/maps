<script lang="ts">
	const SITE_URL = 'https://www.infoclimat.fr';
	const LOGO_URL = 'https://static.infoclimat.net/images/v5.1/logo_IC_5.1.png';
</script>

<div
	class="absolute top-2.5 left-1/2 -translate-x-1/2 z-60 flex items-center gap-3 rounded-md bg-[#0d47a1] px-3 py-1.5 shadow-md ring-1 ring-black/10"
>
	<a href={SITE_URL} title="Infoclimat" class="flex items-center" rel="noopener">
		<img src={LOGO_URL} alt="Infoclimat" class="h-7 w-auto" crossorigin="anonymous" />
	</a>

	<nav class="flex items-center gap-3 text-sm font-medium text-white">
		<a href={SITE_URL} class="hover:underline" rel="noopener">Site</a>
		<span class="text-white/30" aria-hidden="true">·</span>
		<a href="https://forums.infoclimat.fr/" class="hover:underline" rel="noopener"> Forum </a>
		<span class="text-white/30" aria-hidden="true">·</span>
		<a href="https://asso.infoclimat.fr/" class="hover:underline" rel="noopener"> Adhérer </a>
	</nav>
</div>
