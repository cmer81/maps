// Synthèse Web Audio d'un son de déclencheur d'appareil photo, sans fichier audio
// à packager. Combinaison d'un burst de bruit blanc filtré (la lamelle qui claque)
// et d'un bref oscillateur basse-fréquence (le "thunk" du miroir). Le contexte est
// créé paresseusement à la première lecture pour respecter la policy autoplay des
// navigateurs (l'export est toujours déclenché par un clic, donc le contexte
// pourra démarrer sans être en "suspended").

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	if (!audioCtx) {
		const Ctor =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return null;
		try {
			audioCtx = new Ctor();
		} catch {
			return null;
		}
	}
	if (audioCtx.state === 'suspended') {
		audioCtx.resume().catch(() => {});
	}
	return audioCtx;
}

/**
 * Joue un déclic d'appareil photo à `when` (timestamp AudioContext.currentTime).
 * Durée ~50 ms, gain modulable.
 */
function scheduleShutter(ctx: AudioContext, when: number, gain = 0.35): void {
	// --- Composante "clack" : bruit blanc passé en bandpass médium-aigu ---
	const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
	const noiseData = noiseBuf.getChannelData(0);
	for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

	const noise = ctx.createBufferSource();
	noise.buffer = noiseBuf;

	const bandpass = ctx.createBiquadFilter();
	bandpass.type = 'bandpass';
	bandpass.frequency.value = 2800;
	bandpass.Q.value = 1.2;

	const noiseGain = ctx.createGain();
	noiseGain.gain.setValueAtTime(0, when);
	noiseGain.gain.linearRampToValueAtTime(gain, when + 0.001);
	noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);

	noise.connect(bandpass);
	bandpass.connect(noiseGain);
	noiseGain.connect(ctx.destination);
	noise.start(when);
	noise.stop(when + 0.05);

	// --- Composante "thunk" : oscillateur basse-fréquence qui glisse vers le bas ---
	const osc = ctx.createOscillator();
	osc.frequency.setValueAtTime(200, when);
	osc.frequency.exponentialRampToValueAtTime(60, when + 0.03);

	const oscGain = ctx.createGain();
	oscGain.gain.setValueAtTime(0, when);
	oscGain.gain.linearRampToValueAtTime(gain * 0.45, when + 0.002);
	oscGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);

	osc.connect(oscGain);
	oscGain.connect(ctx.destination);
	osc.start(when);
	osc.stop(when + 0.05);
}

/** Un clic unique pour la capture PNG. */
export function playShutter(): void {
	const ctx = getCtx();
	if (!ctx) return;
	scheduleShutter(ctx, ctx.currentTime);
}

/** Identique au PNG simple : un clic pour annoncer le début de la rafale. */
export function playSeriesStart(): void {
	playShutter();
}

/** Double-clic rapide pour signaler la fin de l'export série (zip prêt). */
export function playSeriesEnd(): void {
	const ctx = getCtx();
	if (!ctx) return;
	const t = ctx.currentTime;
	scheduleShutter(ctx, t);
	scheduleShutter(ctx, t + 0.13);
}
