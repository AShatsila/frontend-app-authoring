import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { Icon, ModalPopup } from '@openedx/paragon';
import { ExpandMore } from '@openedx/paragon/icons';
import type { GradeRulePayload } from '../data/types';
import ScoreSettingsPopover from './ScoreSettingsPopover';
import type { ScoreSettingsPopoverHandle } from './ScoreSettingsPopover';
import messages from './messages';

export interface ScoreThresholdFieldProps {
  rulePayload: GradeRulePayload;
  /** When given, the label is a button that opens the score settings popover. Returns a `Promise` so a
   * rejected save reverts the popover's form; the mutation itself lives in `CompetencyAssociationsContext`.
   */
  onChange?: (rulePayload: GradeRulePayload) => Promise<void>;
  /** Called with the payload about to be saved. A non-empty result blocks the save and is shown in the popover. */
  getInlineValidationMessage?: (candidate: GradeRulePayload) => string;
  /** Opens the popover on mount, with focus in the percentage input. */
  autoOpen?: boolean;
  /** Shown in the popover when another box in the group already uses this score. */
  scoreTakenHint?: string;
  /** Renders `scoreTakenHint` as an error and opens the popover with focus on the suggestion link, or on the input
   * when there is no link.
   */
  hintIsError?: boolean;
  /** Focuses the score settings button on mount, for a field that remounted while its popover was committing. */
  focusButtonOnMount?: boolean;
  /** Changes on every repeat rejection, so the popover reopens and refocuses each time. */
  rejectionCount?: number;
  /** Shown in the popover as a "Use {score}" link. */
  scoreSuggestion?: { rulePayload: GradeRulePayload; onApply: () => void; };
}

/** Label stating a rule box's score threshold, for example "With a score of 70% or higher".
 * With `onChange`, the label is a button that opens a popover to edit the comparison and the percentage.
 */
const ScoreThresholdField = ({
  rulePayload,
  onChange,
  getInlineValidationMessage,
  autoOpen = false,
  focusButtonOnMount = false,
  scoreTakenHint,
  hintIsError = false,
  rejectionCount,
  scoreSuggestion,
}: ScoreThresholdFieldProps) => {
  const intl = useIntl();
  const [isOpen, setIsOpen] = useState(autoOpen || hintIsError);
  // Held in state rather than a ref, because `ModalPopup` needs the anchor element on the first render when
  // `autoOpen` is set, and a ref object is still null then.
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const scoreSettingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const attachScoreSettingsButton = useCallback((node: HTMLButtonElement | null) => {
    scoreSettingsButtonRef.current = node;
    setAnchor(node);
  }, []);
  const panelRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<ScoreSettingsPopoverHandle>(null);
  const initialFocus = hintIsError && scoreSuggestion ? 'suggestion' : 'input';

  useEffect(() => {
    if (focusButtonOnMount) {
      // Deferred: the popover that just closed returns focus to its previous element after this effect, which would undo an immediate focus().
      requestAnimationFrame(() => scoreSettingsButtonRef.current?.focus());
    }
  }, [focusButtonOnMount]);

  useEffect(() => {
    if (!hintIsError) {
      return;
    }
    // The popover focuses its data-autofocus element only when it opens, so a repeat refusal while it is open moves focus here.
    const target = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]');
    if (target) {
      target.focus();
    } else {
      setIsOpen(true);
    }
  }, [hintIsError, rejectionCount]);

  const handleCloseRequest = async () => {
    if (!isOpen) {
      return;
    }
    const mayClose = await popoverRef.current?.commit() ?? true;
    if (mayClose) {
      setIsOpen(false);
    }
  };

  const scoreThresholdLabel = intl.formatMessage(messages.scoreThresholdLabel, {
    score: intl.formatMessage(messages.scoreThresholdPhrase, {
      op: rulePayload.op,
      value: intl.formatNumber(rulePayload.value, { style: 'percent', maximumFractionDigits: 0 }),
    }),
    threshold: (chunks: React.ReactNode[]) => (
      <span key="threshold" className="score-threshold-field__value">{chunks}</span>
    ),
  });

  if (!onChange) {
    return (
      <span className="score-threshold-field">
        <span className="score-threshold-field__sentence">{scoreThresholdLabel}</span>
      </span>
    );
  }

  return (
    <span className="score-threshold-field">
      <button
        ref={attachScoreSettingsButton}
        type="button"
        className="score-threshold-field__sentence score-threshold-field__score-settings-button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {scoreThresholdLabel}
        <Icon src={ExpandMore} size="xs" />
      </button>
      <ModalPopup
        isOpen={isOpen}
        positionRef={anchor}
        onClose={handleCloseRequest}
        placement="bottom-start"
      >
        <div ref={panelRef} className="score-threshold-field__panel shadow">
          <ScoreSettingsPopover
            rulePayload={rulePayload}
            onCommit={onChange}
            onRequestClose={() => setIsOpen(false)}
            getInlineValidationMessage={getInlineValidationMessage}
            scoreTakenHint={scoreTakenHint}
            hintIsError={hintIsError}
            scoreSuggestion={scoreSuggestion}
            initialFocus={initialFocus}
            ref={popoverRef}
          />
        </div>
      </ModalPopup>
    </span>
  );
};

export default ScoreThresholdField;
