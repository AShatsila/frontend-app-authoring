import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import classNames from 'classnames';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { CompetencyCriterion, EffectiveRule, GradeRulePayload } from '../data/types';
import CriterionChipList from './CriterionChipList';
import EditConfirmationModal from './EditConfirmationModal';
import ScoreThresholdField, { formatScoreSummary } from './ScoreThresholdField';
import ScoreThresholdPopover from './ScoreThresholdPopover';
import messages from './messages';

export interface RuleBoxProps {
  /** The group this box belongs to, and this box's own rule key - together
   * this box's identity for selection comparisons against
   * `CompetencyAssociationsContext`'s `selection`. `null` only for the
   * placeholder rule box inside the placeholder group itself - a real rule
   * box (`ruleKey !== null`) always belongs to a real group.
   */
  groupId: number | null;
  /** `null` renders this as the not-yet-saved placeholder rule box: no
   * `selectRuleBox` on click, a dashed hint box instead of chips, and its
   * `ScoreThresholdField` writes to the placeholder instead of persisting.
   * A saved, editable box edits its score through `ScoreThresholdPopover`
   * and an `EditConfirmationModal`.
   */
  ruleKey: string | null;
  /** The rule this box displays, given as a prop so a placeholder box with
   * no criterion of its own can use the same component.
   */
  rule: EffectiveRule;
  criteria: CompetencyCriterion[];
  subsectionNamesByUsageKey: Record<string, string>;
  /** Name of the course these criteria belong to, read aloud for an unavailable chip. */
  courseName?: string;
  canEdit?: boolean;
  getInlineValidationMessage?: (value: string) => string;
  /** Placeholder only: guidance under the score, such as "this score is taken". */
  hint?: ReactNode;
  /** Placeholder only: focus the score input on mount. */
  autoFocusSelect?: boolean;
}

/** One rule box: the rule it's given, its chips, and selection/click behavior.
 * Scrolls itself into view (`block: 'nearest'`) when it becomes the selected
 * box - the innermost selected element, so its containing `CriteriaGroupBox`
 * does not also scroll itself in that case. `ruleKey === null` instead
 * renders the not-yet-saved placeholder rule box (`#671`): a dashed hint
 * box instead of chips, no `selectRuleBox` on click, and a score field that
 * writes to `CompetencyAssociationsContext`'s `placeholder` state instead of
 * persisting.
 */
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
    selection,
    competencyName,
    selectRuleBox,
    updateRuleScore,
    setPlaceholderRulePayload,
    placeholderDuplicateRejected,
  } = useCompetencyAssociations();
  const isSelected = selection?.groupId === groupId && selection?.ruleKey === ruleKey;
  const isPlaceholder = ruleKey === null;
  const ref = useRef<HTMLDivElement>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [pendingRulePayload, setPendingRulePayload] = useState<GradeRulePayload | null>(null);

  useEffect(() => {
    if (isSelected) {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isSelected]);

  const isRejected = isPlaceholder && !!hint && placeholderDuplicateRejected;

  useEffect(() => {
    if (isRejected) {
      const root = ref.current;
      (root?.querySelector<HTMLElement>('.rule-box__use-suggestion') ?? root?.querySelector('input'))?.focus();
    }
  }, [isRejected]);

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
  const richText = { b: (chunks: ReactNode) => <strong>{chunks}</strong> };

  return (
    <div
      ref={ref}
      className={classNames('rule-box', { 'rule-box--selected': isSelected })}
    >
      {!isPlaceholder && (
        <button
          type="button"
          className="stretched-link rule-box__select-button"
          aria-current={isSelected}
          onClick={() => selectRuleBox(groupId!, ruleKey)}
        >
          <span className="sr-only">{intl.formatMessage(messages.selectRuleBoxButtonLabel)}</span>
        </button>
      )}
      {canEdit && !isPlaceholder ?
        (
          <ScoreThresholdPopover
            rulePayload={rule.rulePayload}
            isOpen={isPopoverOpen}
            onOpen={() => setIsPopoverOpen(true)}
            onClose={handlePopoverClose}
            onSave={setPendingRulePayload}
            getInlineValidationMessage={getInlineValidationMessage}
          />
        ) :
        (
          <ScoreThresholdField
            rulePayload={rule.rulePayload}
            onChange={canEdit ? handlePlaceholderScoreChange : undefined}
            getInlineValidationMessage={canEdit ? getInlineValidationMessage : undefined}
            autoFocusSelect={autoFocusSelect}
            hint={hint}
            hintIsError={isRejected}
          />
        )}
      {isPlaceholder ?
        (
          <div className="rule-box__placeholder-hint text-muted">
            {intl.formatMessage(messages.placeholderRuleBoxHint)}
          </div>
        ) :
        (
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
    </div>
  );
};

export default RuleBox;
