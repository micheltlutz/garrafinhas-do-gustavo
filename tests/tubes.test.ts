import { describe, expect, it } from 'vitest';
import { canPour, isComplete, isSolved, pour, pourAmount, topRun, validate, type Puzzle } from '../src/game/tubes.ts';

const p = (tubes: string[], cap = 4): Puzzle => ({ tubes, cap });

describe('regras das garrafinhas', () => {
  it('conta as camadas iguais do topo', () => {
    expect(topRun('')).toBe(0);
    expect(topRun('ABB')).toBe(2);
    expect(topRun('AAAA')).toBe(4);
  });

  it('só despeja sobre a mesma cor ou numa garrafinha vazia', () => {
    const q = p(['AB', 'B', 'A', '']);
    expect(canPour(q, 0, 1)).toBe(true); // B sobre B
    expect(canPour(q, 0, 2)).toBe(false); // B sobre A
    expect(canPour(q, 0, 3)).toBe(true); // vazia
    expect(canPour(q, 3, 0)).toBe(false); // nada para despejar
    expect(canPour(q, 0, 0)).toBe(false);
  });

  it('não despeja em garrafinha cheia', () => {
    expect(canPour(p(['AB', 'CCCB']), 0, 1)).toBe(false);
  });

  it('despeja todas as camadas da mesma cor do topo, até encher', () => {
    const q = p(['ABBB', 'CB', '']);
    expect(pourAmount(q, 0, 1)).toBe(2);
    expect(pour(q, 0, 1).tubes).toEqual(['AB', 'CBBB', '']);
    expect(pour(q, 0, 2).tubes).toEqual(['A', 'CB', 'BBB']);
  });

  it('não muda o estado original', () => {
    const q = p(['AB', 'B']);
    pour(q, 0, 1);
    expect(q.tubes).toEqual(['AB', 'B']);
  });

  it('jogada impossível devolve o mesmo estado', () => {
    const q = p(['AB', 'A']);
    expect(pour(q, 0, 1)).toBe(q);
  });

  it('resolvida quando cada garrafinha está vazia ou completa', () => {
    expect(isComplete('AAA', 3)).toBe(true);
    expect(isComplete('AA', 3)).toBe(false);
    expect(isSolved(p(['AAA', 'BBB', ''], 3))).toBe(true);
    expect(isSolved(p(['AA', 'BBB', 'A'], 3))).toBe(false);
    expect(isSolved(p(['AAB', 'BBA', ''], 3))).toBe(false);
  });

  it('valida a quantidade de cada cor', () => {
    expect(validate(p(['AAB', 'BBA', ''], 3))).toBeNull();
    expect(validate(p(['AAB', 'BB', ''], 3))).toMatch(/A/);
    expect(validate(p(['AAAAA'], 4))).toMatch(/transbordando/);
  });
});
