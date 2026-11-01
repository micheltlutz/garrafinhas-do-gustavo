// Gera as fases: sorteia garrafinhas, resolve cada uma (menor nº de jogadas)
// e escolhe uma progressão do mais fácil para o mais difícil.
// Uso: npm run levels  (grava src/game/levels.json)

import { writeFileSync } from 'node:fs';
import { isForgiving, solveShortest } from '../src/game/solver.ts';
import { isComplete, isSolved, validate, type Puzzle } from '../src/game/tubes.ts';

interface LevelOut {
  tubes: string[];
  cap: number;
  moves: number;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20261101);
const LETTERS = 'ABCDEFGH';

function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

function units(colors: number, cap: number): string[] {
  return shuffle([...LETTERS.slice(0, colors)].flatMap((c) => Array<string>(cap).fill(c)));
}

/** Clássico: uma garrafinha cheia por cor, mais algumas vazias. */
function classic(colors: number, cap: number, empties: number): Puzzle {
  const u = units(colors, cap);
  const tubes: string[] = [];
  for (let i = 0; i < colors; i++) tubes.push(u.slice(i * cap, (i + 1) * cap).join(''));
  for (let i = 0; i < empties; i++) tubes.push('');
  return { tubes, cap };
}

/** Solto: as camadas caem em garrafinhas sorteadas, sobrando espaço em várias (mais fácil). */
function loose(colors: number, cap: number, count: number): Puzzle {
  const tubes = Array<string>(count).fill('');
  for (const c of units(colors, cap)) {
    const open = tubes.flatMap((t, i) => (t.length < cap ? [i] : []));
    tubes[open[Math.floor(rng() * open.length)]] += c;
  }
  return { tubes, cap };
}

/** Chave que ignora a ordem das garrafinhas e o nome das cores (para não repetir fases). */
function canonical(p: Puzzle): string {
  const colors = [...new Set(p.tubes.join(''))];
  let best = '';
  const perm = (rest: string[], chosen: string[]): void => {
    if (rest.length === 0) {
      const map = new Map(chosen.map((c, i) => [c, LETTERS[i]]));
      const key = p.tubes
        .map((t) => [...t].map((c) => map.get(c)).join(''))
        .sort()
        .join('|');
      if (best === '' || key < best) best = key;
      return;
    }
    rest.forEach((c, i) => perm([...rest.slice(0, i), ...rest.slice(i + 1)], [...chosen, c]));
  };
  perm(colors, []);
  return best;
}

interface Plan {
  make: () => Puzzle;
  count: number;
  /** Faixa de jogadas mínimas aceita. */
  moves: [number, number];
  /** Sem armadilhas: nenhuma jogada deixa a fase sem saída. */
  forgiving?: boolean;
}

// Fases 1 e 2 feitas à mão: primeiro só despejar; depois juntar cor com cor.
const HAND_MADE: Puzzle[] = [
  { tubes: ['AA', 'A'], cap: 3 },
  { tubes: ['AAB', 'BB', 'A'], cap: 3 },
];

const WORLDS: Plan[][] = [
  // Mundo 1: 2 ou 3 cores, garrafinhas de 3 camadas, sem armadilhas.
  [
    { make: () => loose(2, 3, 3), count: 4, moves: [2, 3], forgiving: true },
    { make: () => classic(2, 3, 2), count: 2, moves: [3, 4], forgiving: true },
    { make: () => loose(3, 3, 4), count: 4, moves: [4, 5], forgiving: true },
  ],
  // Mundo 2: 3 ou 4 cores; as garrafinhas passam a ter 4 camadas.
  [
    { make: () => classic(3, 3, 2), count: 4, moves: [5, 6] },
    { make: () => classic(3, 4, 2), count: 4, moves: [6, 8] },
    { make: () => classic(4, 4, 2), count: 4, moves: [8, 10] },
  ],
  // Mundo 3: 4 a 6 cores.
  [
    { make: () => classic(4, 4, 2), count: 4, moves: [11, 13] },
    { make: () => classic(5, 4, 2), count: 5, moves: [13, 15] },
    { make: () => classic(6, 4, 2), count: 3, moves: [16, 18] },
  ],
];

const seen = new Set<string>();

function describe(p: Puzzle): LevelOut {
  const err = validate(p);
  if (err) throw new Error(`fase inválida (${err}): ${p.tubes.join('|')}`);
  const s = solveShortest(p, 2_000_000);
  if (s.status !== 'solved') throw new Error(`fase sem solução: ${p.tubes.join('|')}`);
  return { tubes: [...p.tubes], cap: p.cap, moves: s.moves.length };
}

/** Escolhe `count` fases espalhadas pela faixa de jogadas, sem repetir. */
function pick(plan: Plan): LevelOut[] {
  const found: LevelOut[] = [];
  for (let tries = 0; tries < 4000 && found.length < plan.count * 12; tries++) {
    const p = plan.make();
    if (isSolved(p) || p.tubes.some((t) => isComplete(t, p.cap))) continue;
    const key = canonical(p);
    if (seen.has(key)) continue;
    const s = solveShortest(p, 2_000_000);
    if (s.status !== 'solved') continue;
    const n = s.moves.length;
    if (n < plan.moves[0] || n > plan.moves[1]) continue;
    if (plan.forgiving && !isForgiving(p)) continue;
    seen.add(key);
    found.push({ tubes: [...p.tubes], cap: p.cap, moves: n });
  }
  if (found.length < plan.count) throw new Error(`poucas fases para ${JSON.stringify(plan.moves)}: ${found.length}`);
  found.sort((a, b) => a.moves - b.moves);
  // Pega fases espalhadas pela lista (da mais fácil para a mais difícil).
  return Array.from({ length: plan.count }, (_, i) =>
    found[Math.round((i * (found.length - 1)) / Math.max(1, plan.count - 1))],
  );
}

const levels: LevelOut[] = HAND_MADE.map((p) => {
  seen.add(canonical(p));
  return describe(p);
});
for (const world of WORLDS) {
  const picked = world.flatMap(pick);
  // Dentro do mundo, garrafinhas menores primeiro e depois por nº de jogadas.
  picked.sort((a, b) => a.cap - b.cap || a.moves - b.moves);
  levels.push(...picked);
}

if (levels.length !== 36) throw new Error(`esperava 36 fases, saíram ${levels.length}`);
const json = '[\n' + levels.map((l) => '  ' + JSON.stringify(l)).join(',\n') + '\n]\n';
writeFileSync(new URL('../src/game/levels.json', import.meta.url), json);
levels.forEach((l, i) =>
  console.log(`${String(i + 1).padStart(2)}  ${String(l.moves).padStart(2)} jogadas  ${l.tubes.map((t) => t || '·').join(' ')}`),
);
