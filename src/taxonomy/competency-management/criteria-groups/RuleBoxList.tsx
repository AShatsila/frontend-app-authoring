import { useIntl } from '@edx/frontend-platform/i18n';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { CompetencyCriteriaGroupsIndex } from '../utils';
import { ruleBoxesForGroup } from '../utils';
import type { CompetencyRuleProfile, EffectiveRule, RuleBox as RuleBoxData } from '../data/types';
import RuleBox from './RuleBox';
import messages from './messages';

export interface RuleBoxListProps {
  /** `null` for the placeholder group, which renders only its placeholder rule box. */
  groupId: number | null;
  index: CompetencyCriteriaGroupsIndex;
  systemDefaultProfile: CompetencyRuleProfile;
  subsectionNamesByUsageKey: Record<string, string>;
  /** Threaded down from `CriteriaGroupBox` (originally resolved by
   * `CourseGroupSection` via `canEditCourse`) - see `CriteriaGroupBoxProps.canEdit`.
   * Optional, defaulting to `false`, so every caller that predates this prop
   * keeps working unchanged.
   */
  canEdit?: boolean;
}

/** Derives one bottom-tier group's rule boxes via `ruleBoxesForGroup` and
 * renders one `RuleBox` per box. Each `RuleBox` reads its own focus state
 * from `CompetencyAssociationsContext` directly (given `groupId` and its
 * own box key to compare against), so no focus state is threaded through
 * here.
 *
 * Also builds each box's own `getInlineValidationMessage` (the
 * duplicate-score check) here, using `boxes`/`index`/`systemDefaultProfile`,
 * which this component already has - `RuleBox` takes no new data dependency
 * for it.
 *
 * Appends one not-yet-saved placeholder `RuleBox` last (`#671`) whenever
 * this group is the one currently focused with no real rule box selected -
 * see `groupId`'s own docstring for the placeholder-group case.
 */
const RuleBoxList = ({
  groupId,
  index,
  systemDefaultProfile,
  subsectionNamesByUsageKey,
  canEdit = false,
}: RuleBoxListProps) => {
  const intl = useIntl();
  const { focus, placeholder } = useCompetencyAssociations();
  // The placeholder group has no real rule boxes.
  const boxes = groupId !== null ? ruleBoxesForGroup(groupId, index, systemDefaultProfile) : [];

  // Compares rounded percent + rule type + op, not `ruleKeyOf`'s raw string
  // key (built from a raw fraction, which risks a formatting mismatch that
  // silently never fires). Excludes the box being edited by its own `key`.
  const getInlineValidationMessage = (candidateBox: RuleBoxData) => (value: string): string => {
    const candidatePercent = Math.round(Number(value));
    const isDuplicate = boxes.some((other) => (
      other.key !== candidateBox.key
      && other.rule.ruleType === candidateBox.rule.ruleType
      && other.rule.rulePayload.op === candidateBox.rule.rulePayload.op
      && Math.round(other.rule.rulePayload.value * 100) === candidatePercent
    ));
    return isDuplicate ? intl.formatMessage(messages.duplicateScoreValidationMessage) : '';
  };

  // For the placeholder group (`groupId === null`) this holds whenever its card renders.
  const showPlaceholder = focus?.groupId === groupId && focus?.ruleKey === null;
  const placeholderRule: EffectiveRule = {
    ruleType: systemDefaultProfile.ruleType,
    rulePayload: placeholder.rulePayload ?? systemDefaultProfile.rulePayload,
  };
  const placeholderBox: RuleBoxData = { key: '__placeholder__', rule: placeholderRule, criteria: [] };

  return (
    <div className="rule-box-list">
      {boxes.map((box) => (
        <RuleBox
          key={box.key}
          groupId={groupId}
          ruleKey={box.key}
          rule={box.rule}
          criteria={box.criteria}
          subsectionNamesByUsageKey={subsectionNamesByUsageKey}
          canEdit={canEdit}
          getInlineValidationMessage={getInlineValidationMessage(box)}
        />
      ))}
      {showPlaceholder && (
        <RuleBox
          key="placeholder"
          groupId={groupId}
          ruleKey={null}
          rule={placeholderRule}
          criteria={[]}
          subsectionNamesByUsageKey={subsectionNamesByUsageKey}
          canEdit={canEdit}
          getInlineValidationMessage={getInlineValidationMessage(placeholderBox)}
        />
      )}
    </div>
  );
};

export default RuleBoxList;
