import type { GradeRulePayload } from '../data/types';

export type ParsedScoreInput =
  | { kind: 'empty'; } // blank or not a number
  | { kind: 'outOfRange'; } // not a whole number from 0 to 100
  | { kind: 'unchanged'; } // same whole percent as the current rule
  | { kind: 'changed'; rulePayload: GradeRulePayload; };

/** "70" for a 0.7 rule. */
export const percentOf = (rulePayload: GradeRulePayload): string => String(Math.round(rulePayload.value * 100));

/** Classifies the typed percent against the current rule; `changed` carries the updated rule. */
export const parseScoreInput = (input: string, rulePayload: GradeRulePayload): ParsedScoreInput => {
  const trimmedInput = input.trim();
  const numericPercent = Number(trimmedInput);
  if (trimmedInput === '' || !Number.isFinite(numericPercent)) {
    return { kind: 'empty' };
  }
  if (!Number.isInteger(numericPercent) || numericPercent < 0 || numericPercent > 100) {
    return { kind: 'outOfRange' };
  }
  if (numericPercent === Math.round(rulePayload.value * 100)) {
    return { kind: 'unchanged' };
  }
  return { kind: 'changed', rulePayload: { ...rulePayload, value: numericPercent / 100 } };
};
