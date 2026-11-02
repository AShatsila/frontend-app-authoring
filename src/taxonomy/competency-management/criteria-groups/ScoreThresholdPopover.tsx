import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import {
  ActionRow,
  Button,
  Form,
  ModalPopup,
} from '@openedx/paragon';
import type { GradeRulePayload } from '../data/types';
import messages from './messages';
import { parseScoreInput, percentOf } from './scoreInput';
import ScoreThresholdField from './ScoreThresholdField';

export interface ScoreThresholdPopoverProps {
  rulePayload: GradeRulePayload;
  isOpen: boolean;
  onOpen: () => void;
  /** Cancel, Escape, an outside click, or Save with an unchanged value. */
  onClose: () => void;
  /** A valid, changed score. The popover stays open; the parent closes it. */
  onSave: (rulePayload: GradeRulePayload) => void;
  /** Pre-fills the input when the popover reopens with an unsaved edit. */
  initialRulePayload?: GradeRulePayload;
  getInlineValidationMessage?: (value: string) => string;
}

const OPERATOR_MESSAGE_BY_OP = {
  gte: messages.scoreOperatorGte,
  eq: messages.scoreOperatorEq,
  lte: messages.scoreOperatorLte,
};

const OPERATOR_SR_MESSAGE_BY_OP = {
  gte: messages.scoreOperatorSrGte,
  eq: messages.scoreOperatorSrEq,
  lte: messages.scoreOperatorSrLte,
};

const INPUT_LABEL_MESSAGE_BY_OP = {
  gte: messages.scoreThresholdPopoverInputLabelGte,
  eq: messages.scoreThresholdPopoverInputLabelEq,
  lte: messages.scoreThresholdPopoverInputLabelLte,
};

type ScoreFormProps = Omit<ScoreThresholdPopoverProps, 'isOpen' | 'onOpen'> & { titleId: string; };

// Mounted only while the popover is open, so the draft restarts from the saved score on each open.
const ScoreForm = ({
  rulePayload,
  initialRulePayload,
  titleId,
  onClose,
  onSave,
  getInlineValidationMessage,
}: ScoreFormProps) => {
  const intl = useIntl();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() => percentOf(initialRulePayload ?? rulePayload));
  const [validationMessage, setValidationMessage] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseScoreInput(draft, rulePayload);
    if (parsed.kind === 'empty' || parsed.kind === 'outOfRange') {
      setValidationMessage(intl.formatMessage(messages.scoreThresholdRangeValidationMessage));
      inputRef.current?.focus();
    } else if (parsed.kind === 'unchanged') {
      onClose();
    } else {
      const message = getInlineValidationMessage?.(draft) ?? '';
      setValidationMessage(message);
      if (message) {
        inputRef.current?.focus();
      } else {
        onSave(parsed.rulePayload);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div id={titleId} className="small text-gray-500 mb-2">
        {intl.formatMessage(messages.scoreThresholdPopoverTitle)}
      </div>
      <Form.Group controlId={inputId} className="mb-0">
        <div className="d-flex align-items-center">
          <span className="mr-2" aria-hidden="true">{intl.formatMessage(OPERATOR_MESSAGE_BY_OP[rulePayload.op])}</span>
          <span className="sr-only">{intl.formatMessage(OPERATOR_SR_MESSAGE_BY_OP[rulePayload.op])}</span>
          <Form.Control
            ref={inputRef}
            autoFocus
            type="text"
            inputMode="numeric"
            size="sm"
            value={draft}
            aria-label={intl.formatMessage(INPUT_LABEL_MESSAGE_BY_OP[rulePayload.op])}
            aria-invalid={!!validationMessage}
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
      </Form.Group>
      <ActionRow className="mt-3">
        <Button variant="tertiary" onClick={onClose}>
          {intl.formatMessage(messages.scoreThresholdPopoverCancelButton)}
        </Button>
        <Button type="submit">{intl.formatMessage(messages.scoreThresholdPopoverSaveButton)}</Button>
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
  initialRulePayload,
  getInlineValidationMessage,
}: ScoreThresholdPopoverProps) => {
  const titleId = useId();
  const [target, setTarget] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <Button
        ref={setTarget}
        variant="link"
        size="inline"
        className="rule-box__score-trigger align-self-start p-0 border-0"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={onOpen}
      >
        <ScoreThresholdField rulePayload={rulePayload} />
      </Button>
      <ModalPopup positionRef={target} isOpen={isOpen} onClose={onClose}>
        <div className="bg-white rounded shadow p-3" role="dialog" aria-labelledby={titleId}>
          <ScoreForm
            rulePayload={rulePayload}
            initialRulePayload={initialRulePayload}
            titleId={titleId}
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
