import { useEffect, useRef } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
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
  /** The rule this box displays, given as a prop rather than read from a
   * criterion - so this same component can later serve a not-yet-saved box
   * that has no criterion of its own yet.
   */
  rule: EffectiveRule;
  criteria: CompetencyCriterion[];
  subsectionNamesByUsageKey: Record<string, string>;
  canEdit?: boolean;
  getInlineValidationMessage?: (value: string) => string;
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
}: RuleBoxProps) => {
  const intl = useIntl();
  const { focus, focusRuleBox, updateRuleScore, setPlaceholderRulePayload } = useCompetencyAssociations();
  const isFocused = focus?.groupId === groupId && focus?.ruleKey === ruleKey;
  const isPlaceholder = ruleKey === null;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFocused) {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isFocused]);

  const handleScoreChange = (rulePayload: GradeRulePayload): Promise<void> => {
    // With no criteria yet, the score stays in placeholder state until content is picked.
    if (isPlaceholder) {
      setPlaceholderRulePayload(rulePayload);
      return Promise.resolve();
    }
    return updateRuleScore(groupId!, criteria.map((criterion) => criterion.id), rulePayload);
  };

  return (
    <div
      ref={ref}
      className={classNames('rule-box', { 'rule-box--focused': isFocused })}
    >
      {!isPlaceholder && (
        <button
          type="button"
          className="stretched-link rule-box__select-button"
          aria-current={isFocused}
          onClick={() => focusRuleBox(groupId!, ruleKey)}
        >
          <span className="sr-only">{intl.formatMessage(messages.selectRuleBoxButtonLabel)}</span>
        </button>
      )}
      <ScoreThresholdField
        rulePayload={rule.rulePayload}
        onChange={canEdit ? handleScoreChange : undefined}
        getInlineValidationMessage={canEdit ? getInlineValidationMessage : undefined}
      />
      {isPlaceholder ?
        (
          <div className="rule-box__placeholder-hint text-muted">
            {intl.formatMessage(messages.placeholderRuleBoxHint)}
          </div>
        ) :
        <CriterionChipList criteria={criteria} subsectionNamesByUsageKey={subsectionNamesByUsageKey} />}
    </div>
  );
};

export default RuleBox;
