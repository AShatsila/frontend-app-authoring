import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { Stack } from '@openedx/paragon';
import classNames from 'classnames';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { CompetencyCriterion, EffectiveRule, GradeRulePayload } from '../data/types';
import CriterionChipList from './CriterionChipList';
import EditConfirmationModal from './EditConfirmationModal';
import ScoreThresholdField from './ScoreThresholdField';
import ScoreThresholdPopover from './ScoreThresholdPopover';
import { formatScoreSummary } from './scoreInput';
import messages from './messages';

type EditState =
  | { kind: 'closed'; }
  | { kind: 'editing'; draft?: GradeRulePayload; }
  | { kind: 'confirming'; rulePayload: GradeRulePayload; };

export interface RuleBoxProps {
  /** `null` only for the placeholder rule box in the placeholder group. */
  groupId: number | null;
  /** `null` renders the not-yet-saved placeholder box: a hint instead of chips, and a score kept in the context. */
  ruleKey: string | null;
  rule: EffectiveRule;
  criteria: CompetencyCriterion[];
  subsectionNamesByUsageKey: Record<string, string>;
  /** Name of the course these criteria belong to, read aloud for an unavailable chip. */
  courseName?: string;
  /** Makes the score and chips editable; without it the box is read-only. */
  canEdit?: boolean;
  /** Returns a non-empty message to block a score edit, for example a duplicate score in the group. */
  getInlineValidationMessage?: (value: string) => string;
  /** Placeholder only: guidance under the score, such as "this score is taken". */
  hint?: ReactNode;
  /** Placeholder only: focus the score input on mount. */
  autoFocusSelect?: boolean;
}

/** One rule box: its score threshold, which focuses the box, and its criterion chips, or a hint when it is the placeholder. */
const RuleBox = ({
  groupId,
  ruleKey,
  rule,
  criteria,
  subsectionNamesByUsageKey,
  courseName,
  canEdit = false,
  getInlineValidationMessage,
  hint,
  autoFocusSelect = false,
}: RuleBoxProps) => {
  const intl = useIntl();
  const {
    focus,
    competencyName,
    focusRuleBox,
    updateRuleScore,
    setPlaceholderRulePayload,
    placeholderDuplicateRejected,
    keyboardFocusRequest,
    consumeKeyboardFocusRequest,
  } = useCompetencyAssociations();
  const isFocused = focus?.groupId === groupId && focus?.ruleKey === ruleKey;
  const isPlaceholder = ruleKey === null;
  const ref = useRef<HTMLDivElement>(null);
  const [editState, setEditState] = useState<EditState>({ kind: 'closed' });
  const takesKeyboardFocus = keyboardFocusRequest?.kind === 'ruleBox'
    && keyboardFocusRequest.groupId === groupId
    && keyboardFocusRequest.ruleKey === ruleKey;

  useEffect(() => {
    if (takesKeyboardFocus) {
      ref.current?.querySelector<HTMLElement>('.rule-box__score-trigger')?.focus({ preventScroll: true });
      consumeKeyboardFocusRequest();
    }
  }, [takesKeyboardFocus, consumeKeyboardFocusRequest]);

  useEffect(() => {
    if (isFocused) {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isFocused]);

  const isRejected = isPlaceholder && !!hint && placeholderDuplicateRejected;

  useEffect(() => {
    if (isRejected) {
      const root = ref.current;
      (root?.querySelector<HTMLElement>('.rule-box__use-suggestion') ?? root?.querySelector('input'))?.focus();
    }
  }, [isRejected]);

  // With no criteria yet, the score stays in the context until content is picked.
  const handlePlaceholderScoreChange = (rulePayload: GradeRulePayload) => {
    setPlaceholderRulePayload(rulePayload);
  };

  const handleConfirm = async () => {
    if (!canEdit || editState.kind !== 'confirming') {
      return;
    }
    await updateRuleScore(groupId!, criteria.map((criterion) => criterion.id), editState.rulePayload);
    setEditState({ kind: 'closed' });
  };

  const oldScore = formatScoreSummary(intl, rule.rulePayload);
  const richText = { b: (chunks: ReactNode) => <span className="font-weight-bold">{chunks}</span> };

  const selectRuleBox = () => {
    if (groupId !== null && ruleKey !== null) {
      focusRuleBox(groupId, ruleKey);
    }
  };

  return (
    <Stack
      ref={ref}
      gap={1.5}
      className={classNames('rule-box position-relative', { 'rule-box--focused': isFocused })}
    >
      {canEdit
        ? (
          <>
            {/* The score input is a control, so the select button is a sibling laid under it. */}
            {!isPlaceholder && (
              <button
                type="button"
                className="rule-box__select-button"
                aria-current={isFocused}
                onClick={selectRuleBox}
              >
                <span className="sr-only">{intl.formatMessage(messages.selectRuleBoxButtonLabel)}</span>
              </button>
            )}
            {isPlaceholder
              ? (
                <ScoreThresholdField
                  rulePayload={rule.rulePayload}
                  onChange={handlePlaceholderScoreChange}
                  getInlineValidationMessage={getInlineValidationMessage}
                  autoFocusSelect={autoFocusSelect}
                  hint={hint}
                  hintIsError={isRejected}
                />
              )
              : (
                <ScoreThresholdPopover
                  rulePayload={rule.rulePayload}
                  isOpen={editState.kind === 'editing'}
                  initialRulePayload={editState.kind === 'editing' ? editState.draft : undefined}
                  onOpen={() => setEditState({ kind: 'editing' })}
                  onClose={() => setEditState({ kind: 'closed' })}
                  onSave={(rulePayload) => setEditState({ kind: 'confirming', rulePayload })}
                  getInlineValidationMessage={getInlineValidationMessage}
                />
              )}
          </>
        )
        : (
          <button
            type="button"
            className="rule-box__control stretched-link"
            aria-current={isFocused}
            onClick={selectRuleBox}
          >
            <ScoreThresholdField rulePayload={rule.rulePayload} />
          </button>
        )}
      {isPlaceholder
        ? (
          <div className="rule-box__placeholder-hint text-muted">
            {intl.formatMessage(messages.placeholderRuleBoxHint)}
          </div>
        )
        : (
          <CriterionChipList
            criteria={criteria}
            subsectionNamesByUsageKey={subsectionNamesByUsageKey}
            courseName={courseName}
            canEdit={canEdit}
          />
        )}
      {editState.kind === 'confirming' && (
        <EditConfirmationModal
          isOpen
          title={intl.formatMessage(messages.scoreChangeConfirmationTitle, {
            newScore: formatScoreSummary(intl, editState.rulePayload),
          })}
          body={
            <>
              <p>
                {intl.formatMessage(messages.scoreChangeConfirmationItemsText, { count: criteria.length, ...richText })}
              </p>
              <p>
                {intl.formatMessage(messages.scoreChangeConfirmationFutureText, {
                  competencyName,
                  oldScore,
                  ...richText,
                })}
              </p>
            </>
          }
          errorText={intl.formatMessage(messages.scoreChangeFailedText, { oldScore })}
          onConfirm={handleConfirm}
          onCancel={() =>
            setEditState((state) => (
              state.kind === 'confirming' ? { kind: 'editing', draft: state.rulePayload } : state
            ))}
        />
      )}
    </Stack>
  );
};

export default RuleBox;
