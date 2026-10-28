import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { Stack } from '@openedx/paragon';
import classNames from 'classnames';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { CompetencyCriterion, EffectiveRule, GradeRulePayload } from '../data/types';
import CriterionChipList from './CriterionChipList';
import EditConfirmationModal from './EditConfirmationModal';
import ScoreThresholdField, { formatScoreSummary } from './ScoreThresholdField';
import ScoreThresholdPopover from './ScoreThresholdPopover';
import messages from './messages';

export interface RuleBoxProps {
  /** `null` only for the placeholder rule box in the placeholder group. */
  groupId: number | null;
  /** `null` renders the not-yet-saved placeholder box: a hint instead of chips, and a score kept in the context.
   * A saved, editable box edits its score through `ScoreThresholdPopover` and an `EditConfirmationModal`.
   */
  ruleKey: string | null;
  rule: EffectiveRule;
  criteria: CompetencyCriterion[];
  subsectionNamesByUsageKey: Record<string, string>;
  /** Name of the course these criteria belong to, read aloud for an unavailable chip. */
  courseName?: string;
  /** Whether the author can edit the score threshold. */
  canEdit?: boolean;
  /** Duplicate-score check for this box, used only when `canEdit`. */
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
  } = useCompetencyAssociations();
  const isFocused = focus?.groupId === groupId && focus?.ruleKey === ruleKey;
  const isPlaceholder = ruleKey === null;
  const ref = useRef<HTMLDivElement>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [pendingRulePayload, setPendingRulePayload] = useState<GradeRulePayload | null>(null);

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
  const handlePlaceholderScoreChange = (rulePayload: GradeRulePayload): Promise<void> => {
    setPlaceholderRulePayload(rulePayload);
    return Promise.resolve();
  };

  const handlePopoverClose = () => {
    // The popover stays open under the confirmation dialog.
    if (pendingRulePayload === null) {
      setIsPopoverOpen(false);
    }
  };

  const handleConfirm = async () => {
    await updateRuleScore(groupId!, criteria.map((criterion) => criterion.id), pendingRulePayload!);
    setPendingRulePayload(null);
    setIsPopoverOpen(false);
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
                  isOpen={isPopoverOpen}
                  onOpen={() => setIsPopoverOpen(true)}
                  onClose={handlePopoverClose}
                  onSave={setPendingRulePayload}
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
      <EditConfirmationModal
        isOpen={pendingRulePayload !== null}
        title={intl.formatMessage(messages.scoreChangeConfirmationTitle, {
          newScore: pendingRulePayload ? formatScoreSummary(intl, pendingRulePayload) : '',
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
        onCancel={() => setPendingRulePayload(null)}
      />
    </Stack>
  );
};

export default RuleBox;
