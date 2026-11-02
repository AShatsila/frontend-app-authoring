import type { ReactNode } from 'react';
import type { IntlShape } from 'react-intl';
import type { GradeRulePayload } from '../data/types';
import messages from './messages';

export type ParsedScoreInput =
  | { kind: 'empty'; } // blank or not a number
  | { kind: 'outOfRange'; } // number-like but not a whole number from 0 to 100
  | { kind: 'unchanged'; } // same whole percent as the current rule
  | { kind: 'changed'; rulePayload: GradeRulePayload; };

/** "70" for a 0.7 rule. */
export const percentOf = (rulePayload: GradeRulePayload): string => String(Math.round(rulePayload.value * 100));

/** Classifies the typed percent against the current rule; `changed` carries the updated rule. */
export const parseScoreInput = (input: string, rulePayload: GradeRulePayload): ParsedScoreInput => {
  const trimmedInput = input.trim();
  if (!/^\d+$/.test(trimmedInput)) {
    return { kind: trimmedInput === '' || Number.isNaN(Number(trimmedInput)) ? 'empty' : 'outOfRange' };
  }
  const numericPercent = Number(trimmedInput);
  if (numericPercent > 100) {
    return { kind: 'outOfRange' };
  }
  if (numericPercent === Math.round(rulePayload.value * 100)) {
    return { kind: 'unchanged' };
  }
  return { kind: 'changed', rulePayload: { ...rulePayload, value: numericPercent / 100 } };
};

/** A score as text, such as "75% or higher", for messages that name a score. Read from the same message as the
 * score label, so the wording stays in one place.
 */
export const formatScoreSummary = (intl: IntlShape, rulePayload: GradeRulePayload): string => {
  let summary = '';
  intl.formatMessage(messages.scoreThresholdLabel, {
    op: rulePayload.op,
    value: intl.formatNumber(rulePayload.value, { style: 'percent', maximumFractionDigits: 0 }),
    threshold: (chunks: ReactNode[]) => {
      summary = chunks.filter((chunk): chunk is string => typeof chunk === 'string').join('');
      return summary;
    },
  });
  return summary;
};
