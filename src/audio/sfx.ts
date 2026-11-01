// Efeitos sonoros sintetizados com Web Audio (sem arquivos de áudio).
//
// No iPad, o áudio só pode começar depois de um toque; ele também pode ser
// interrompido quando o app vai para o segundo plano. Por isso o contexto é
// criado no primeiro toque, liberado de novo a cada toque e recriado se não
// voltar sozinho.

import { store } from '../storage.ts';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function create(): void {
  ctx = new AudioContext();
  const compressor = ctx.createDynamicsCompressor();
  master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(compressor).connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

function unlock(): void {
  try {
    if (!ctx) create();
    if (ctx && ctx.state !== 'running') {
      void ctx.resume().catch(() => {});
      // Um som mudo dentro do toque "destrava" o áudio no iOS.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch {
    // sem áudio neste aparelho
  }
}

export function initAudio(): void {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  try {
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    // não suportado
  }
  for (const ev of ['pointerdown', 'pointerup', 'touchend']) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !ctx) return;
    void ctx.resume().catch(() => {});
    setTimeout(() => {
      if (ctx && ctx.state !== 'running') {
        void ctx.close().catch(() => {});
        ctx = null;
        master = null;
      }
    }, 400);
  });
}

function out(): { ac: AudioContext; dest: GainNode } | null {
  if (!store.sound || !ctx || !master || ctx.state !== 'running') return null;
  return { ac: ctx, dest: master };
}

function tone(
  type: OscillatorType,
  freq: number,
  at: number,
  dur: number,
  peak: number,
  freqEnd?: number,
  dest?: AudioNode,
): void {
  const o = out();
  if (!o) return;
  const t = o.ac.currentTime + at;
  const osc = o.ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = o.ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest ?? o.dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noiseBurst(at: number, dur: number, peak: number, filter: BiquadFilterType, f1: number, f2 = f1): void {
  const o = out();
  if (!o || !noise) return;
  const t = o.ac.currentTime + at;
  const src = o.ac.createBufferSource();
  src.buffer = noise;
  const bq = o.ac.createBiquadFilter();
  bq.type = filter;
  bq.frequency.setValueAtTime(f1, t);
  bq.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = o.ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bq).connect(g).connect(o.dest);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  /** Pegou uma garrafinha: "tim" de vidro. */
  select(): void {
    tone('sine', 1318.5, 0, 0.14, 0.22);
    tone('sine', 2637, 0, 0.09, 0.06);
  },
  /** Pôs a garrafinha de volta no lugar. */
  putDown(): void {
    tone('sine', 880, 0, 0.09, 0.14, 660);
  },
  /** "Glub-glub": as bolhas sobem de tom conforme a garrafinha enche (fill de 0 a 1). */
  pour(fill = 0.5, layers = 1): void {
    const base = 240 + fill * 360;
    const bubbles = 3 + layers * 2;
    for (let i = 0; i < bubbles; i++) {
      const f = base * (0.85 + (i / bubbles) * 0.4) * (0.95 + Math.random() * 0.1);
      tone('sine', f, 0.02 + i * 0.075, 0.07, 0.24, f * 1.6);
    }
    noiseBurst(0, 0.12 + layers * 0.1, 0.05, 'lowpass', 900, 400);
  },
  /** Não dá para despejar ali: "boing" de leve. */
  nope(): void {
    tone('triangle', 330, 0, 0.12, 0.28, 220);
    tone('triangle', 262, 0.12, 0.18, 0.24, 180);
  },
  /** Garrafinha pronta: rolha "pop" e um brilho. */
  cork(): void {
    noiseBurst(0, 0.05, 0.25, 'highpass', 2500);
    tone('sine', 520, 0, 0.1, 0.35, 1200);
    [1568, 2093, 2637].forEach((f, i) => tone('triangle', f, 0.1 + i * 0.07, 0.16, 0.1));
  },
  /** Desfazer: som "de volta". */
  undo(): void {
    tone('sine', 700, 0, 0.18, 0.3, 300);
  },
  /** Toque em botão. */
  pop(): void {
    tone('sine', 500, 0, 0.1, 0.35, 900);
  },
  /** Festa: fase resolvida. */
  win(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone('triangle', f, i * 0.11, 0.22, 0.3));
    for (const f of [523.25, 659.25, 783.99]) tone('triangle', f, 0.5, 0.8, 0.22);
    [1568, 2093, 1760, 2637].forEach((f, i) => tone('sine', f, 0.55 + i * 0.09, 0.12, 0.08));
  },
};
