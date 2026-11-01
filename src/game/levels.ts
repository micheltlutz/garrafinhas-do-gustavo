import data from './levels.json';
import type { Puzzle } from './tubes.ts';

export interface Level extends Puzzle {
  readonly tubes: readonly string[];
  /** Menor número de despejos para resolver (calculado pelo gerador). */
  readonly moves: number;
}

export const LEVELS: readonly Level[] = data;
export const WORLD_SIZE = 12;

export function worldOf(levelIndex: number): number {
  return Math.floor(levelIndex / WORLD_SIZE);
}

/** Cores dos líquidos: bem diferentes entre si e vivas. */
export const LIQUIDS = [
  '#E53935', // vermelho
  '#1E88E5', // azul
  '#FDD835', // amarelo
  '#43A047', // verde
  '#8E24AA', // roxo
  '#FB8C00', // laranja
  '#F06292', // rosa
  '#4DD0E1', // azul-claro
] as const;

/**
 * Cor de cada letra da fase. Muda de fase para fase (para não ficar sempre
 * igual), mas é sempre a mesma na mesma fase.
 */
export function liquidColors(levelIndex: number): Record<string, string> {
  const order = LIQUIDS.map((c, i) => ({ c, k: hash(levelIndex * 31 + i) }));
  order.sort((a, b) => a.k - b.k);
  const map: Record<string, string> = {};
  'ABCDEFGH'.split('').forEach((letter, i) => (map[letter] = order[i].c));
  return map;
}

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}
