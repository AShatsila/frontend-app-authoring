import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { Card } from '@openedx/paragon';
import classNames from 'classnames';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { CompetencyCriterion, EffectiveRule, GradeRulePayload } from '../data/types';
import CriterionChipList from './CriterionChipList';
import ScoreThresholdField from './ScoreThresholdField';
import messages from './messages';

export interface RuleBoxProps {
  /** The group this box belongs to, and this box's own rule key - together
   * this box's identity for focus comparisons against
   * `CompetencyAssociationsContext`'s `focus`. `null` only for the
   * placeholder rule box inside the placeholder group itself - a real rule
   * box (`ruleKey !== null`) always belongs to a real group.
   */
  groupId: number | null;
  /** `null` renders this as the not-yet-saved placeholder rule box: no
   * `focusRuleBox` on click, a dashed hint box instead of chips, and its
   * `ScoreThresholdField` writes to the placeholder instead of persisting.
   */
  ruleKey: string | null;
  /** The rule this box displays, given as a prop so a placeholder box with
   * no criterion of its own can use the same component.
   */
  rule: EffectiveRule;
  criteria: CompetencyCriterion[];
  subsectionNamesByUsageKey: Record<string, string>;
  /** Threaded down from `RuleBoxList` (originally resolved by
   * `CourseGroupSection` via `canEditCourse`) - see `CriteriaGroupBoxProps.canEdit`.
   * Optional, defaulting to `false`, so every caller that predates this prop
   * keeps working unchanged.
   */
  canEdit?: boolean;
  /** Built once by `RuleBoxList` for this specific box (the duplicate-score
   * check) - passed straight through to `ScoreThresholdField`. Only
   * meaningful when `canEdit` is true.
   */
  getInlineValidationMessage?: (value: string) => string;
  /** Placeholder only: guidance under the score, such as "this score is taken". */
  hint?: ReactNode;
  /** Placeholder only: focus the score input on mount. */
  autoFocusSelect?: boolean;
}

/** One rule box: the rule it's given, its chips, and focus/click behavior.
 * Scrolls itself into view (`block: 'nearest'`) when it becomes the focused
 * box - the innermost focused element, so its containing `CriteriaGroupBox`
 * does not also scroll itself in that case. `ruleKey === null` instead
 * renders the not-yet-saved placeholder rule box (`#671`): a dashed hint
 * box instead of chips, no `focusRuleBox` on click, and a score field that
 * writes to `CompetencyAssociationsContext`'s `placeholder` state instead of
 * persisting.
 */
const RuleBox = ({
  groupId,
  ruleKey,
  rule,
  criteria,
  subsectionNamesByUsageKey,
  canEdit = false,
  getInlineValidationMessage,
  hint,
  autoFocusSelect = false,
}: RuleBoxProps) => {
  const intl = useIntl();
  const {
    focus,
    focusRuleBox,
    updateRuleScore,
    setPlaceholderRulePayload,
    placeholderDuplicateRejected,
  } = useCompetencyAssociations();
  const isFocused = focus?.groupId === groupId && focus?.ruleKey === ruleKey;
  const isPlaceholder = ruleKey === null;
  const ref = useRef<HTMLDivElement>(null);

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

  const handleClick: React.MouseEventHandler = () => {
    // The placeholder is already focused by the control that created it.
    if (!isPlaceholder) {
      focusRuleBox(groupId!, ruleKey);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler = (event) => {
    // Only this wrapper's own key events, not ones bubbled up from the
    // score input once `canEdit` is true - otherwise this handler's
    // `preventDefault` would swallow the input's own Enter/Escape.
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isPlaceholder) {
        focusRuleBox(groupId!, ruleKey);
      }
    }
  };

  const handleScoreChange = (rulePayload: GradeRulePayload): Promise<void> => {
    // With no criteria yet, the score stays in placeholder state until content is picked.
    if (isPlaceholder) {
      setPlaceholderRulePayload(rulePayload);
      return Promise.resolve();
    }
    return updateRuleScore(groupId!, criteria.map((criterion) => criterion.id), rulePayload);
  };

  return (
    // Interactive/focus/scroll semantics live on this wrapping `<div>`, not
    // `Card` itself: `Card`'s `ref` forwarding doesn't reliably reach a real
    // DOM node (confirmed directly - `ref.current` had no `scrollIntoView`).
    <div
      ref={ref}
      className={classNames('rule-box', { 'rule-box--focused': isFocused })}
      role="button"
      tabIndex={0}
      aria-pressed={isFocused}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <Card>
        <Card.Body className="rule-box__body">
          <ScoreThresholdField
            rulePayload={rule.rulePayload}
            onChange={canEdit ? handleScoreChange : undefined}
            getInlineValidationMessage={canEdit ? getInlineValidationMessage : undefined}
            autoFocusSelect={autoFocusSelect}
            hint={hint}
            hintIsError={isRejected}
          />
          {isPlaceholder ?
            (
              <div className="rule-box__placeholder-hint text-muted">
                {intl.formatMessage(messages.placeholderRuleBoxHint)}
              </div>
            ) :
            <CriterionChipList criteria={criteria} subsectionNamesByUsageKey={subsectionNamesByUsageKey} />}
        </Card.Body>
      </Card>
    </div>
  );
};

export default RuleBox;
