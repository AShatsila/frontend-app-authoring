import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { Form } from '@openedx/paragon';
import type { IntlShape, MessageDescriptor } from 'react-intl';
import type { GradeRulePayload } from '../data/types';
import messages from './messages';

export interface ScoreThresholdFieldProps {
  rulePayload: GradeRulePayload;
  /** Omitted: renders plain text. Given: renders the editable input, and the returned promise lets
   * `saveScoreIfChanged` revert its local input on a rejected save.
   */
  onChange?: (rulePayload: GradeRulePayload) => Promise<void>;
  /** Called once at commit time, from `saveScoreIfChanged` below; a non-empty return blocks the
   * commit and shows the message inline instead.
   */
  getInlineValidationMessage?: (value: string) => string;
  /** Focuses and selects the input on mount. */
  autoFocusSelect?: boolean;
  /** Guidance under the field, tied to the input by `aria-describedby`. */
  hint?: ReactNode;
  /** Renders `hint` as an error and marks the input invalid. */
  hintIsError?: boolean;
}

/** Which suffix follows the percentage for each comparison operator -
 * `null` for `eq`, which reads as an exact score with no suffix.
 */
const SUFFIX_MESSAGE_BY_OP: Record<GradeRulePayload['op'], MessageDescriptor | null> = {
  gte: messages.scoreThresholdOrHigherSuffix,
  lte: messages.scoreThresholdOrLowerSuffix,
  eq: null,
};

/** A score as text, such as "75% or higher", for messages that name a score. */
export const formatScoreSummary = (intl: IntlShape, rulePayload: GradeRulePayload): string => {
  const suffixMessage = SUFFIX_MESSAGE_BY_OP[rulePayload.op];
  const percentText = intl.formatNumber(Math.round(rulePayload.value * 100) / 100, { style: 'percent' });
  return suffixMessage ? `${percentText} ${intl.formatMessage(suffixMessage)}` : percentText;
};

/** `rulePayload.value` is a 0.0-1.0 fraction, not a 0-100 percentage. */
const percentOf = (rulePayload: GradeRulePayload): string => String(Math.round(rulePayload.value * 100));

/** Closed-state label for a rule's score threshold: "With a score of X% or higher"/"or lower"/
 * (no suffix, for an exact match). Read-only unless `onChange` is given. */
const ScoreThresholdField = ({
  rulePayload,
  onChange,
  getInlineValidationMessage,
  autoFocusSelect = false,
  hint,
  hintIsError = false,
}: ScoreThresholdFieldProps) => {
  const intl = useIntl();
  const inputId = useId();
  const percent = Math.round(rulePayload.value * 100);
  const suffixMessage = SUFFIX_MESSAGE_BY_OP[rulePayload.op];

  // Local input state, mirroring `EditableCell`'s pattern - never resynced from `rulePayload`
  // while mounted; a rejected edit needs its own explicit revert (see `saveScoreIfChanged` below).
  const [inputValue, setInputValue] = useState(() => percentOf(rulePayload));
  const [validationMessage, setValidationMessage] = useState('');
  // Guards against a second commit (e.g. blur right after Enter) firing before the first
  // mutation resolves, which could otherwise let two out-of-order responses land in the wrong order.
  const saveInFlight = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusSelect) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [autoFocusSelect]);

  if (!onChange) {
    return (
      <span className="score-threshold-field">
        {intl.formatMessage(messages.scoreThresholdLabel, { percent })}
        {suffixMessage && ` ${intl.formatMessage(suffixMessage)}`}
      </span>
    );
  }

  const revertToLastPersisted = () => {
    setInputValue(percentOf(rulePayload));
    setValidationMessage('');
  };

  const saveScoreIfChanged = async () => {
    if (saveInFlight.current) {
      return;
    }
    const trimmedInput = inputValue.trim();
    const numericPercent = Number(trimmedInput);
    if (trimmedInput === '' || !Number.isFinite(numericPercent)) {
      revertToLastPersisted();
      return;
    }
    if (!Number.isInteger(numericPercent) || numericPercent < 0 || numericPercent > 100) {
      setValidationMessage(intl.formatMessage(messages.scoreThresholdRangeValidationMessage));
      return;
    }
    if (numericPercent === Math.round(rulePayload.value * 100)) {
      setValidationMessage('');
      return;
    }
    const message = getInlineValidationMessage ? getInlineValidationMessage(inputValue) : '';
    if (message) {
      setValidationMessage(message);
      return;
    }
    setValidationMessage('');
    const newRulePayload: GradeRulePayload = { ...rulePayload, value: numericPercent / 100 };
    saveInFlight.current = true;
    setIsSaving(true);
    try {
      await onChange(newRulePayload);
    } catch {
      revertToLastPersisted();
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      void saveScoreIfChanged();
    } else if (event.key === 'Escape') {
      revertToLastPersisted();
    }
  };

  // The commit-time message wins over the hint when both would show.
  const showAsInvalid = !!validationMessage || (!!hint && hintIsError);

  return (
    <Form.Group as="span" controlId={inputId} className="score-threshold-field score-threshold-field--editable">
      {intl.formatMessage(messages.scoreThresholdLabel, {
        percent: (
          <Form.Control
            key="score-input"
            ref={inputRef}
            type="text"
            inputMode="numeric"
            size="sm"
            className="score-threshold-field__input"
            value={inputValue}
            aria-label={intl.formatMessage(messages.scoreThresholdInputAccessibleLabel)}
            aria-invalid={showAsInvalid}
            isInvalid={showAsInvalid}
            disabled={isSaving}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              void saveScoreIfChanged();
            }}
          />
        ),
      })}
      {suffixMessage && ` ${intl.formatMessage(suffixMessage)}`}
      {validationMessage && (
        <Form.Control.Feedback type="invalid" hasIcon={false}>
          {validationMessage}
        </Form.Control.Feedback>
      )}
      {!validationMessage && hint && (
        <Form.Control.Feedback type={hintIsError ? 'invalid' : 'default'} hasIcon={false}>
          {hint}
        </Form.Control.Feedback>
      )}
    </Form.Group>
  );
};

export default ScoreThresholdField;
