/**
 * Ambiance sonore du « Mode Confort » (easter egg ?giec=non) : la mélodie de
 * « Vive le vent » / « Jingle Bells » (refrain) — air **traditionnel, domaine
 * public** — synthétisée à la volée via Web Audio. Aucun fichier, aucune licence.
 *
 * L'autoplay audio étant bloqué par les navigateurs, `startChristmasMusic()` doit
 * être appelée depuis un geste utilisateur (clic sur le bouton du bandeau). La
 * mélodie boucle jusqu'à `stopChristmasMusic()`, qui ferme l'AudioContext (ce qui
 * coupe net tous les oscillateurs déjà programmés).
 */

// Fréquences (Hz) des notes utilisées, tempérament égal.
const N = {
	G4: 392.0,
	C5: 523.25,
	D5: 587.33,
	E5: 659.25,
	F5: 698.46,
	G5: 783.99
} as const;

/** [fréquence (0 = silence), durée en temps]. Refrain de Jingle Bells. */
type Step = [number, number];
const MELODY: Step[] = [
	// « Vive le vent, vive le vent, vive le vent d'hiver »
	[N.E5, 1],
	[N.E5, 1],
	[N.E5, 2],
	[N.E5, 1],
	[N.E5, 1],
	[N.E5, 2],
	[N.E5, 1],
	[N.G5, 1],
	[N.C5, 1],
	[N.D5, 1],
	[N.E5, 4],
	// « Boule de neige et jour de l'an… »
	[N.F5, 1],
	[N.F5, 1],
	[N.F5, 1],
	[N.F5, 1],
	[N.F5, 1],
	[N.E5, 1],
	[N.E5, 1],
	[N.E5, 0.5],
	[N.E5, 0.5],
	[N.E5, 1],
	[N.D5, 1],
	[N.D5, 1],
	[N.E5, 1],
	[N.D5, 2],
	[N.G5, 2],
	[0, 2] // respiration avant de reboucler
];

const SECONDS_PER_BEAT = 0.34;
const MASTER_VOLUME = 0.32;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let playing = false;
let loopTimer: ReturnType<typeof setTimeout> | undefined;

/** Programme une note « boîte à musique » (triangle + enveloppe douce) à l'instant `t`. */
const scheduleNote = (freq: number, t: number, dur: number): void => {
	if (!ctx || !master || freq <= 0) return;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'triangle';
	osc.frequency.value = freq;
	const attack = 0.015;
	gain.gain.setValueAtTime(0.0001, t);
	gain.gain.linearRampToValueAtTime(1, t + attack);
	gain.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.95);
	osc.connect(gain).connect(master);
	osc.start(t);
	osc.stop(t + dur);
};

/** Programme un passage complet de la mélodie ; renvoie sa durée totale (s). */
const scheduleMelody = (startAt: number): number => {
	let t = startAt;
	for (const [freq, beats] of MELODY) {
		const dur = beats * SECONDS_PER_BEAT;
		scheduleNote(freq, t, dur);
		t += dur;
	}
	return t - startAt;
};

export const startChristmasMusic = async (): Promise<void> => {
	if (playing || typeof window === 'undefined') return;
	const Ctor =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return;
	ctx = new Ctor();
	await ctx.resume();
	master = ctx.createGain();
	master.gain.value = MASTER_VOLUME;
	master.connect(ctx.destination);
	playing = true;

	const loop = () => {
		if (!playing || !ctx) return;
		const duration = scheduleMelody(ctx.currentTime + 0.1);
		// Reprogramme le passage suivant un peu avant la fin pour un enchaînement sans trou.
		loopTimer = setTimeout(loop, Math.max(0, duration * 1000 - 60));
	};
	loop();
};

export const stopChristmasMusic = (): void => {
	playing = false;
	if (loopTimer) clearTimeout(loopTimer);
	loopTimer = undefined;
	if (ctx) {
		void ctx.close();
		ctx = null;
		master = null;
	}
};

export const isChristmasMusicPlaying = (): boolean => playing;
