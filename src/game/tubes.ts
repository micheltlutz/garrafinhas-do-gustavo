// Regras do jogo, sem nada de tela: garrafinhas com camadas de líquido colorido.
//
// Cada garrafinha é uma string, de baixo para cima, com uma letra por camada
// ("AAB" = duas camadas da cor A no fundo e uma da cor B em cima).
// Todas têm a mesma capacidade, e cada cor tem exatamente `cap` camadas.

export type Tube = string;

export interface Puzzle {
  readonly tubes: readonly Tube[];
  readonly cap: number;
}

export interface Move {
  readonly from: number;
  readonly to: number;
}

/** Cor da camada de cima (ou undefined, se vazia). */
export function topColor(tube: Tube): string | undefined {
  return tube[tube.length - 1];
}

/** Quantas camadas seguidas da mesma cor estão no topo. */
export function topRun(tube: Tube): number {
  const c = topColor(tube);
  let n = 0;
  for (let i = tube.length - 1; i >= 0 && tube[i] === c; i--) n++;
  return n;
}

/** Garrafinha só com uma cor (ou vazia). */
export function isUniform(tube: Tube): boolean {
  return topRun(tube) === tube.length;
}

/** Garrafinha cheia e de uma cor só: pronta, ganha a rolha. */
export function isComplete(tube: Tube, cap: number): boolean {
  return tube.length === cap && isUniform(tube);
}

/** Pode despejar? Precisa ter líquido, espaço no destino e a mesma cor no topo (ou destino vazio). */
export function canPour(p: Puzzle, from: number, to: number): boolean {
  if (from === to) return false;
  const a = p.tubes[from];
  const b = p.tubes[to];
  if (a === undefined || b === undefined || a.length === 0 || b.length >= p.cap) return false;
  return b.length === 0 || topColor(b) === topColor(a);
}

/** Quantas camadas passam: todas as do topo com a mesma cor, até encher o destino. */
export function pourAmount(p: Puzzle, from: number, to: number): number {
  if (!canPour(p, from, to)) return 0;
  return Math.min(topRun(p.tubes[from]), p.cap - p.tubes[to].length);
}

/** Faz o despejo e devolve o novo estado (o original não muda). */
export function pour(p: Puzzle, from: number, to: number): Puzzle {
  const n = pourAmount(p, from, to);
  if (n === 0) return p;
  const tubes = p.tubes.slice();
  const a = tubes[from];
  tubes[from] = a.slice(0, a.length - n);
  tubes[to] = tubes[to] + a.slice(a.length - n);
  return { tubes, cap: p.cap };
}

/** Fase resolvida: cada garrafinha está vazia ou completa. */
export function isSolved(p: Puzzle): boolean {
  return p.tubes.every((t) => t.length === 0 || isComplete(t, p.cap));
}

/** Confere se a fase é válida: cada cor com exatamente `cap` camadas, nada transbordando. */
export function validate(p: Puzzle): string | null {
  if (!Number.isInteger(p.cap) || p.cap < 2) return 'capacidade inválida';
  const count = new Map<string, number>();
  for (const t of p.tubes) {
    if (t.length > p.cap) return `garrafinha transbordando: ${t}`;
    for (const c of t) {
      if (!/^[A-Z]$/.test(c)) return `cor inválida: ${c}`;
      count.set(c, (count.get(c) ?? 0) + 1);
    }
  }
  for (const [c, n] of count) if (n !== p.cap) return `a cor ${c} tem ${n} camadas`;
  if (count.size > p.tubes.length) return 'mais cores do que garrafinhas';
  return null;
}

/** Cores usadas na fase, em ordem alfabética. */
export function colorsOf(p: Puzzle): string[] {
  return [...new Set(p.tubes.join(''))].sort();
}
