import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import classNames from 'classnames';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { CompetencyCriterion, EffectiveRule, GradeRulePayload } from '../data/types';
import CriterionChipList from './CriterionChipList';
import EditConfirmationModal from './EditConfirmationModal';
import ScoreThresholdField from './ScoreThresholdField';
import { formatScoreSummary } from './scoreInput';
import ScoreThresholdPopover from './ScoreThresholdPopover';
import messages from './messages';

type EditState =
  | { kind: 'closed'; }
  | { kind: 'editing'; draft?: GradeRulePayload; }
  | { kind: 'confirming'; rulePayload: GradeRulePayload; };

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
  /** Makes the score and chips editable; without it the box is read-only. */
  canEdit?: boolean;
  /** Returns a non-empty message to block a score edit, for example a duplicate score in the group. */
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
 * persisting. A saved, editable box edits its score through
 * `ScoreThresholdPopover`, then an `EditConfirmationModal` (#785); the popover
 * is closed while the confirmation is open and reopens with the typed value if
 * the author cancels.
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
    keyboardFocusRequest,
    consumeKeyboardFocusRequest,
  } = useCompetencyAssociations();
  const isSelected = selection?.groupId === groupId && selection?.ruleKey === ruleKey;
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

  const handlePlaceholderScoreChange = (rulePayload: GradeRulePayload) => {
    setPlaceholderRulePayload(rulePayload);
  };

  const handleConfirm = async () => {
    if (!canEdit || editState.kind !== 'confirming') { return; }
    await updateRuleScore(groupId!, criteria.map((criterion) => criterion.id), editState.rulePayload);
    setEditState({ kind: 'closed' });
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
            isOpen={editState.kind === 'editing'}
            initialRulePayload={editState.kind === 'editing' ? editState.draft : undefined}
            onOpen={() => setEditState({ kind: 'editing' })}
            onClose={() => setEditState({ kind: 'closed' })}
            onSave={(rulePayload) => setEditState({ kind: 'confirming', rulePayload })}
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
            setEditState((state) =>
              state.kind === 'confirming' ? { kind: 'editing', draft: state.rulePayload } : state
            )}
        />
      )}
    </div>
  );
};

export default RuleBox;
