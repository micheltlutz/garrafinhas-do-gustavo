import { describe, expect, it } from 'vitest';
import { hasSolution, isForgiving, keyOf, nextHint, solveAny, solveShortest, usefulMoves } from '../src/game/solver.ts';
import { isSolved, pour, type Move, type Puzzle } from '../src/game/tubes.ts';

const p = (tubes: string[], cap = 4): Puzzle => ({ tubes, cap });

function play(start: Puzzle, moves: Move[]): Puzzle {
  return moves.reduce((q, m) => {
    const next = pour(q, m.from, m.to);
    expect(next).not.toBe(q); // toda jogada da solução é válida
    return next;
  }, start);
}

describe('resolvedor', () => {
  it('a ordem das garrafinhas não muda a chave', () => {
    expect(keyOf(p(['AB', '', 'BA']))).toBe(keyOf(p(['BA', 'AB', ''])));
  });

  it('não testa jogadas que não mudam nada', () => {
    // "AA" para uma vazia é inútil; só uma das vazias é testada.
    const moves = usefulMoves(p(['AA', 'BAB', '', '']));
    expect(moves).toEqual([{ from: 1, to: 2 }]);
  });

  it('acha a solução mais curta', () => {
    const start = p(['AAB', 'BB', 'A'], 3);
    const s = solveShortest(start);
    expect(s.status).toBe('solved');
    expect(s.moves).toHaveLength(2);
    expect(isSolved(play(start, s.moves))).toBe(true);
  });

  it('resolve uma fase clássica de 4 cores', () => {
    const start = p(['ADDC', 'CDAA', 'DABB', 'CCBB', '', '']);
    const short = solveShortest(start);
    const any = solveAny(start);
    expect(short.status).toBe('solved');
    expect(any.status).toBe('solved');
    expect(isSolved(play(start, short.moves))).toBe(true);
    expect(isSolved(play(start, any.moves))).toBe(true);
    expect(any.moves.length).toBeGreaterThanOrEqual(short.moves.length);
  });

  it('percebe quando não tem mais saída', () => {
    // Nenhuma jogada possível: todas cheias, topos diferentes.
    const stuck = p(['AB', 'BA'], 2);
    expect(solveShortest(stuck).status).toBe('impossible');
    expect(hasSolution(stuck)).toBe(false);
    expect(nextHint(stuck)).toEqual({ kind: 'stuck' });
  });

  it('a dica é o primeiro passo de uma solução', () => {
    const start = p(['ABA', 'BAB', ''], 3);
    const hint = nextHint(start);
    expect(hint.kind).toBe('move');
    if (hint.kind !== 'move') return;
    const after = pour(start, hint.move.from, hint.move.to);
    expect(solveShortest(after).moves.length).toBe(solveShortest(start).moves.length - 1);
  });

  it('reconhece fase sem armadilhas', () => {
    expect(isForgiving(p(['AA', 'A'], 3))).toBe(true);
    // Despejar o A de cima na vazia trava a fase.
    expect(isForgiving(p(['ABA', 'ABB', ''], 3))).toBe(false);
  });

  it('fase resolvida não tem dica', () => {
    expect(nextHint(p(['AAA', ''], 3))).toEqual({ kind: 'none' });
  });
});
