import type { IntlShape, MessageDescriptor } from 'react-intl';
import type { GradeRulePayload } from '@src/taxonomy/competency-management/data/types';
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

/** Which suffix follows the percentage for each comparison operator -
 * `null` for `eq`, which reads as an exact score with no suffix.
 */
export const SUFFIX_MESSAGE_BY_OP: Record<GradeRulePayload['op'], MessageDescriptor | null> = {
  gte: messages.scoreThresholdOrHigherSuffix,
  lte: messages.scoreThresholdOrLowerSuffix,
  eq: null,
};

/** A score as text, such as "75% or higher", for messages that name a score. */
export const formatScoreSummary = (intl: IntlShape, rulePayload: GradeRulePayload): string => {
  const suffixMessage = SUFFIX_MESSAGE_BY_OP[rulePayload.op];
  const percentText = intl.formatMessage(messages.scoreThresholdValue, {
    percent: Math.round(rulePayload.value * 100),
  });
  return suffixMessage ? `${percentText} ${intl.formatMessage(suffixMessage)}` : percentText;
};
