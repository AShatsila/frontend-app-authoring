import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { Form, Icon } from '@openedx/paragon';
import { ExpandMore } from '@openedx/paragon/icons';
import type { GradeRulePayload } from '../data/types';
import messages from './messages';
import { parseScoreInput, percentOf, SUFFIX_MESSAGE_BY_OP } from './scoreInput';

export interface ScoreThresholdFieldProps {
  rulePayload: GradeRulePayload;
  /** Omitted: renders plain text. Given: renders the editable input used by the unsaved placeholder
   * rule box, whose handler only stores the value and never rejects.
   */
  onChange?: (rulePayload: GradeRulePayload) => void;
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

/** Label for a rule's score threshold: "With a score of X% or higher"/"or lower"/(no suffix, for an
 * exact match). Read-only unless `onChange` is given, which serves the placeholder rule box. */
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
  // while mounted.
  const [inputValue, setInputValue] = useState(() => percentOf(rulePayload));
  const [validationMessage, setValidationMessage] = useState('');
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
        {intl.formatMessage(messages.scoreThresholdLabel, {
          threshold: (
            <span key="threshold" className="score-threshold-field__value">
              {intl.formatMessage(messages.scoreThresholdValue, { percent })}
              {suffixMessage && ` ${intl.formatMessage(suffixMessage)}`}
              <Icon src={ExpandMore} size="xs" className="score-threshold-field__chevron" />
            </span>
          ),
        })}
      </span>
    );
  }

  const revertToLastPersisted = () => {
    setInputValue(percentOf(rulePayload));
    setValidationMessage('');
  };

  const saveScoreIfChanged = () => {
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

  // The commit-time message wins over the hint when both would show.
  const showAsInvalid = !!validationMessage || (!!hint && hintIsError);

  return (
    <Form.Group as="span" controlId={inputId} className="score-threshold-field score-threshold-field--editable">
      {intl.formatMessage(messages.scoreThresholdLabel, {
        threshold: (
          <span key="threshold" className="score-threshold-field__value score-threshold-field__value--editable">
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
              onChange={(event) =>
                setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                saveScoreIfChanged();
              }}
            />
            %
          </span>
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
