import type { GradeRulePayload } from '../data/types';
import { parseScoreInput, percentOf } from './scoreInput';

const rule: GradeRulePayload = { op: 'gte', value: 0.7, scale: 'percent' };

describe('parseScoreInput', () => {
  it.each(['  ', 'abc'])('reports %j as empty', (input) => {
    expect(parseScoreInput(input, rule)).toEqual({ kind: 'empty' });
  });

  it.each(['101', '-1', '70.5'])('reports %j as out of range', (input) => {
    expect(parseScoreInput(input, rule)).toEqual({ kind: 'outOfRange' });
  });

  it.each(['70', ' 70 '])('reports %j as unchanged', (input) => {
    expect(parseScoreInput(input, rule)).toEqual({ kind: 'unchanged' });
  });

  it('returns the rule with the new fraction when the percent differs', () => {
    expect(parseScoreInput('85', rule)).toEqual({
      kind: 'changed',
      rulePayload: { op: 'gte', value: 0.85, scale: 'percent' },
    });
  });

  it.each([['0', 0], ['100', 1]])('accepts the boundary %j', (input, value) => {
    expect(parseScoreInput(input, rule)).toEqual({
      kind: 'changed',
      rulePayload: { ...rule, value },
    });
  });
});

describe('percentOf', () => {
  it('rounds the fraction to a whole percent string', () => {
    expect(percentOf({ op: 'gte', value: 0.705, scale: 'percent' })).toBe('71');
  });
});
