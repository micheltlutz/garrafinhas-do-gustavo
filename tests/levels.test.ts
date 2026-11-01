import { describe, expect, it } from 'vitest';
import { LEVELS, LIQUIDS, liquidColors, WORLD_SIZE } from '../src/game/levels.ts';
import { isForgiving, solveShortest } from '../src/game/solver.ts';
import { colorsOf, isComplete, isSolved, validate } from '../src/game/tubes.ts';

describe('fases', () => {
  it('são 36, em 3 mundos de 12', () => {
    expect(LEVELS).toHaveLength(36);
    expect(LEVELS.length % WORLD_SIZE).toBe(0);
  });

  it.each(LEVELS.map((l, i) => [i + 1, l] as const))('fase %i: válida, sem garrafinha pronta e com o nº certo de jogadas', (_, level) => {
    expect(validate(level)).toBeNull();
    expect(isSolved(level)).toBe(false);
    expect(level.tubes.some((t) => isComplete(t, level.cap))).toBe(false);
    expect(colorsOf(level).length).toBeLessThanOrEqual(LIQUIDS.length);
    const s = solveShortest(level, 2_000_000);
    expect(s.status).toBe('solved');
    expect(s.moves.length).toBe(level.moves);
  });

  it('mundo 1 não tem armadilhas (nenhuma jogada deixa sem saída)', () => {
    LEVELS.slice(0, WORLD_SIZE).forEach((level) => expect(isForgiving(level)).toBe(true));
  });

  it('não repetem', () => {
    const keys = LEVELS.map((l) => [...l.tubes].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ficam mais difíceis de mundo para mundo', () => {
    const avg = (w: number) =>
      LEVELS.slice(w * WORLD_SIZE, (w + 1) * WORLD_SIZE).reduce((s, l) => s + l.moves, 0) / WORLD_SIZE;
    expect(avg(0)).toBeLessThan(avg(1));
    expect(avg(1)).toBeLessThan(avg(2));
  });

  it('cada cor da fase tem uma cor de líquido diferente', () => {
    LEVELS.forEach((level, i) => {
      const map = liquidColors(i);
      const used = colorsOf(level).map((c) => map[c]);
      expect(new Set(used).size).toBe(used.length);
    });
  });
});
