import { useState } from 'react';
import type { FormEvent } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import {
  ActionRow,
  Button,
  Form,
  Icon,
  ModalPopup,
} from '@openedx/paragon';
import { ExpandMore } from '@openedx/paragon/icons';
import type { GradeRulePayload } from '../data/types';
import messages from './messages';
import { parseScoreInput, percentOf } from './scoreInput';
import { SUFFIX_MESSAGE_BY_OP } from './ScoreThresholdField';

export interface ScoreThresholdPopoverProps {
  rulePayload: GradeRulePayload;
  isOpen: boolean;
  onOpen: () => void;
  /** Cancel, Escape, an outside click, or Save with an unchanged value. */
  onClose: () => void;
  /** A valid, changed score. The popover stays open; the parent closes it. */
  onSave: (rulePayload: GradeRulePayload) => void;
  getInlineValidationMessage?: (value: string) => string;
}

const OPERATOR_MESSAGE_BY_OP = {
  gte: messages.scoreOperatorGte,
  eq: messages.scoreOperatorEq,
  lte: messages.scoreOperatorLte,
};

type ScoreFormProps = Omit<ScoreThresholdPopoverProps, 'isOpen' | 'onOpen'>;

// Mounted only while the popover is open, so the draft restarts from the saved score on each open.
const ScoreForm = ({ rulePayload, onClose, onSave, getInlineValidationMessage }: ScoreFormProps) => {
  const intl = useIntl();
  const [draft, setDraft] = useState(() => percentOf(rulePayload));
  const [validationMessage, setValidationMessage] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseScoreInput(draft, rulePayload);
    if (parsed.kind === 'empty' || parsed.kind === 'outOfRange') {
      setValidationMessage(intl.formatMessage(messages.scoreThresholdRangeValidationMessage));
    } else if (parsed.kind === 'unchanged') {
      onClose();
    } else {
      const message = getInlineValidationMessage?.(draft) ?? '';
      setValidationMessage(message);
      if (!message) {
        onSave(parsed.rulePayload);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="small text-gray-500 mb-2">{intl.formatMessage(messages.scoreRulePopoverTitle)}</div>
      <div className="d-flex align-items-center">
        <span className="mr-2">{intl.formatMessage(OPERATOR_MESSAGE_BY_OP[rulePayload.op])}</span>
        <Form.Control
          autoFocus
          type="text"
          inputMode="numeric"
          size="sm"
          value={draft}
          aria-label={intl.formatMessage(messages.scoreThresholdInputAccessibleLabel)}
          isInvalid={!!validationMessage}
          onChange={(event) => setDraft(event.target.value)}
        />
        <span className="ml-2">%</span>
      </div>
      {validationMessage && (
        <Form.Control.Feedback type="invalid" hasIcon={false}>
          {validationMessage}
        </Form.Control.Feedback>
      )}
      <ActionRow className="mt-3">
        <Button variant="tertiary" onClick={onClose}>
          {intl.formatMessage(messages.scoreRulePopoverCancelButton)}
        </Button>
        <Button type="submit">{intl.formatMessage(messages.scoreRulePopoverSaveButton)}</Button>
      </ActionRow>
    </form>
  );
};

const ScoreThresholdPopover = ({
  rulePayload,
  isOpen,
  onOpen,
  onClose,
  onSave,
  getInlineValidationMessage,
}: ScoreThresholdPopoverProps) => {
  const intl = useIntl();
  const [target, setTarget] = useState<HTMLButtonElement | null>(null);
  const percent = Math.round(rulePayload.value * 100);
  const suffixMessage = SUFFIX_MESSAGE_BY_OP[rulePayload.op];

  return (
    <>
      <Button ref={setTarget} variant="link" size="inline" className="score-threshold-field" onClick={onOpen}>
        {intl.formatMessage(messages.scoreThresholdLabel, {
          threshold: (
            <span key="threshold" className="score-threshold-field__value">
              {intl.formatMessage(messages.scoreThresholdValue, { percent })}
              {suffixMessage && ` ${intl.formatMessage(suffixMessage)}`}
              <Icon src={ExpandMore} size="xs" className="score-threshold-field__chevron" />
            </span>
          ),
        })}
      </Button>
      <ModalPopup positionRef={target} isOpen={isOpen} onClose={onClose}>
        <div className="bg-white rounded shadow p-3">
          <ScoreForm
            rulePayload={rulePayload}
            onClose={onClose}
            onSave={onSave}
            getInlineValidationMessage={getInlineValidationMessage}
          />
        </div>
      </ModalPopup>
    </>
  );
};

export default ScoreThresholdPopover;
