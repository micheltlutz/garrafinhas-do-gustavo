// Resolvedor: menor número de jogadas (para medir as fases), uma solução
// qualquer (rápida, para as dicas) e "deu um nó" (não tem mais solução).

import { canPour, isComplete, isSolved, isUniform, pour, type Move, type Puzzle } from './tubes.ts';

export type Status = 'solved' | 'impossible' | 'unknown';

export interface Solution {
  /** solved: achou; impossible: não tem saída; unknown: desistiu (busca grande demais). */
  readonly status: Status;
  readonly moves: Move[];
  readonly explored: number;
}

/** A ordem das garrafinhas não importa para a solução: estados iguais têm a mesma chave. */
export function keyOf(p: Puzzle): string {
  return p.tubes.slice().sort().join('|');
}

/**
 * Jogadas que valem a pena testar. Corta só as que não mudam nada:
 * mexer numa garrafinha completa, levar uma cor só para uma garrafinha vazia
 * e testar mais de uma garrafinha vazia como destino (são todas iguais).
 */
export function usefulMoves(p: Puzzle): Move[] {
  const moves: Move[] = [];
  const { tubes, cap } = p;
  for (let from = 0; from < tubes.length; from++) {
    const a = tubes[from];
    if (a.length === 0 || isComplete(a, cap)) continue;
    let triedEmpty = false;
    for (let to = 0; to < tubes.length; to++) {
      if (!canPour(p, from, to)) continue;
      if (tubes[to].length === 0) {
        if (triedEmpty || isUniform(a)) continue;
        triedEmpty = true;
      }
      moves.push({ from, to });
    }
  }
  return moves;
}

type Parents = Map<string, { prev: string; move: Move } | null>;

function trace(parents: Parents, key: string): Move[] {
  const moves: Move[] = [];
  for (let step = parents.get(key); step; step = parents.get(step.prev)) moves.push(step.move);
  return moves.reverse();
}

/** Busca em largura: devolve a solução mais curta. */
export function solveShortest(start: Puzzle, maxStates = 200_000): Solution {
  if (isSolved(start)) return { status: 'solved', moves: [], explored: 1 };
  const startKey = keyOf(start);
  const parents: Parents = new Map([[startKey, null]]);
  let frontier: Array<[Puzzle, string]> = [[start, startKey]];
  while (frontier.length > 0) {
    const next: Array<[Puzzle, string]> = [];
    for (const [p, key] of frontier) {
      for (const move of usefulMoves(p)) {
        const q = pour(p, move.from, move.to);
        const qKey = keyOf(q);
        if (parents.has(qKey)) continue;
        parents.set(qKey, { prev: key, move });
        if (isSolved(q)) return { status: 'solved', moves: trace(parents, qKey), explored: parents.size };
        if (parents.size >= maxStates) return { status: 'unknown', moves: [], explored: parents.size };
        next.push([q, qKey]);
      }
    }
    frontier = next;
  }
  return { status: 'impossible', moves: [], explored: parents.size };
}

/** Quanto falta, mais ou menos: blocos de cor separados além de um por cor. */
export function disorder(p: Puzzle): number {
  let runs = 0;
  const colors = new Set<string>();
  for (const t of p.tubes) {
    for (let i = 0; i < t.length; i++) {
      colors.add(t[i]);
      if (i === 0 || t[i] !== t[i - 1]) runs++;
    }
  }
  return runs - colors.size;
}

/** Fila de prioridade simples (heap binário). */
class Heap<T> {
  private readonly items: Array<{ prio: number; seq: number; value: T }> = [];
  private seq = 0;

  get size(): number {
    return this.items.length;
  }

  push(prio: number, value: T): void {
    const items = this.items;
    items.push({ prio, seq: this.seq++, value });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }

  pop(): T | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < items.length && this.less(l, best)) best = l;
        if (r < items.length && this.less(r, best)) best = r;
        if (best === i) break;
        [items[i], items[best]] = [items[best], items[i]];
        i = best;
      }
    }
    return top.value;
  }

  private less(a: number, b: number): boolean {
    const x = this.items[a];
    const y = this.items[b];
    return x.prio !== y.prio ? x.prio < y.prio : x.seq < y.seq;
  }
}

/**
 * Busca guiada (A* com peso): acha uma solução boa bem rápido, mesmo em fases
 * grandes. Se explorar tudo sem achar, a posição não tem saída.
 */
export function solveAny(start: Puzzle, maxStates = 300_000): Solution {
  if (isSolved(start)) return { status: 'solved', moves: [], explored: 1 };
  const startKey = keyOf(start);
  const parents: Parents = new Map([[startKey, null]]);
  const heap = new Heap<[Puzzle, string, number]>();
  heap.push(0, [start, startKey, 0]);
  for (let item = heap.pop(); item; item = heap.pop()) {
    const [p, key, g] = item;
    for (const move of usefulMoves(p)) {
      const q = pour(p, move.from, move.to);
      const qKey = keyOf(q);
      if (parents.has(qKey)) continue;
      parents.set(qKey, { prev: key, move });
      if (isSolved(q)) return { status: 'solved', moves: trace(parents, qKey), explored: parents.size };
      if (parents.size >= maxStates) return { status: 'unknown', moves: [], explored: parents.size };
      heap.push(g + 1 + 2 * disorder(q), [q, qKey, g + 1]);
    }
  }
  return { status: 'impossible', moves: [], explored: parents.size };
}

export type Hint = { kind: 'move'; move: Move } | { kind: 'stuck' } | { kind: 'none' };

/**
 * Próxima jogada para a dica. Primeiro tenta o caminho mais curto (fases
 * pequenas); se a busca ficar grande, usa a busca guiada.
 */
export function nextHint(p: Puzzle): Hint {
  if (isSolved(p)) return { kind: 'none' };
  let s = solveShortest(p, 20_000);
  if (s.status === 'unknown') s = solveAny(p);
  if (s.status === 'solved') return { kind: 'move', move: s.moves[0] };
  if (s.status === 'impossible') return { kind: 'stuck' };
  return { kind: 'none' };
}

/**
 * Fase "sem armadilhas": qualquer sequência de jogadas ainda deixa a fase
 * resolvível (nunca precisa desfazer). Só para fases pequenas.
 */
export function isForgiving(start: Puzzle, maxStates = 5_000): boolean {
  const seen = new Set([keyOf(start)]);
  const queue = [start];
  while (queue.length > 0) {
    const p = queue.pop()!;
    if (solveShortest(p).status !== 'solved') return false;
    for (let from = 0; from < p.tubes.length; from++) {
      for (let to = 0; to < p.tubes.length; to++) {
        if (!canPour(p, from, to)) continue;
        const q = pour(p, from, to);
        const k = keyOf(q);
        if (seen.has(k)) continue;
        if (seen.size >= maxStates) return false;
        seen.add(k);
        queue.push(q);
      }
    }
  }
  return true;
}

/** A posição ainda tem saída? (undefined se a busca ficou grande demais para saber.) */
export function hasSolution(p: Puzzle, maxStates = 60_000): boolean | undefined {
  const s = solveAny(p, maxStates);
  return s.status === 'unknown' ? undefined : s.status === 'solved';
}
