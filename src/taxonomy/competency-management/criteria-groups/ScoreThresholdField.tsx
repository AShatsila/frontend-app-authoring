import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { Form } from '@openedx/paragon';
import type { GradeRulePayload } from '../data/types';
import messages from './messages';
import { parseScoreInput, percentOf } from './scoreInput';

export interface ScoreThresholdFieldProps {
  rulePayload: GradeRulePayload;
  /** When given, the percentage renders as an editable input, used by the unsaved placeholder rule box, whose
   * handler only stores the value and never rejects.
   */
  onChange?: (rulePayload: GradeRulePayload) => void;
  /** Called when saving. A non-empty result blocks the save and is shown inline. */
  getInlineValidationMessage?: (value: string) => string;
  /** Focuses and selects the input on mount. */
  autoFocusSelect?: boolean;
  /** Guidance under the field. */
  hint?: ReactNode;
  /** Renders `hint` as an error and marks the input invalid. */
  hintIsError?: boolean;
}

/** Label stating a rule box's score threshold, for example "With a score of 70% or higher".
 * The percentage is editable when `onChange` is given.
 */
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

  // Not resynced from `rulePayload` while mounted.
  const [inputValue, setInputValue] = useState(() => percentOf(rulePayload));
  const [validationMessage, setValidationMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusSelect) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [autoFocusSelect]);

  const revertToLastPersisted = () => {
    setInputValue(percentOf(rulePayload));
    setValidationMessage('');
  };

  const saveScoreIfChanged = () => {
    if (!onChange) {
      return;
    }
    const parsed = parseScoreInput(inputValue, rulePayload);
    if (parsed.kind === 'empty') {
      revertToLastPersisted();
      return;
    }
    if (parsed.kind === 'outOfRange') {
      setValidationMessage(intl.formatMessage(messages.scoreThresholdRangeValidationMessage));
      return;
    }
    if (parsed.kind === 'unchanged') {
      // Skipped so a blur with no edit does not re-send the rounded display value over the stored fraction.
      setValidationMessage('');
      return;
    }
    const message = getInlineValidationMessage ? getInlineValidationMessage(inputValue) : '';
    if (message) {
      setValidationMessage(message);
      return;
    }
    setValidationMessage('');
    onChange(parsed.rulePayload);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      saveScoreIfChanged();
    } else if (event.key === 'Escape') {
      revertToLastPersisted();
    }
  };

  // The save-time message wins over the hint when both would show.
  const showAsInvalid = !!validationMessage || (!!hint && hintIsError);

  // `rulePayload.value` is a 0.0-1.0 fraction (openedx-core ADR 0002), not a 0-100 percentage.
  const value = onChange
    ? (
      <>
        <Form.Control
          ref={inputRef}
          type="text"
          inputMode="numeric"
          size="sm"
          className="score-threshold-field__input"
          value={inputValue}
          aria-label={intl.formatMessage(messages.scoreThresholdInputAccessibleLabel)}
          aria-invalid={showAsInvalid}
          isInvalid={showAsInvalid}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            saveScoreIfChanged();
          }}
        />
        %
      </>
    )
    : intl.formatNumber(rulePayload.value, { style: 'percent', maximumFractionDigits: 0 });

  return (
    <Form.Group as="span" controlId={inputId} className="score-threshold-field">
      {intl.formatMessage(messages.scoreThresholdLabel, {
        op: rulePayload.op,
        value,
        threshold: (chunks: React.ReactNode[]) => (
          <span key="threshold" className="score-threshold-field__value">{chunks}</span>
        ),
      })}
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
