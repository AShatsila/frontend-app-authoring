import { useEffect, useRef } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { Button } from '@openedx/paragon';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { CompetencyCriteriaGroupsIndex } from '../utils';
import { isRuleTakenInGroup, nextUnusedScore, ruleBoxesForGroup } from '../utils';
import type { CompetencyRuleProfile, EffectiveRule, RuleBox as RuleBoxData } from '../data/types';
import RuleBox from './RuleBox';
import { formatScoreSummary } from './ScoreThresholdField';
import messages from './messages';

export interface RuleBoxListProps {
  /** `null` for the placeholder group, which renders only its placeholder rule box. */
  groupId: number | null;
  index: CompetencyCriteriaGroupsIndex;
  systemDefaultProfile: CompetencyRuleProfile;
  subsectionNamesByUsageKey: Record<string, string>;
  canEdit?: boolean;
}

/** Derives one bottom-tier group's rule boxes via `ruleBoxesForGroup` and
 * renders one `RuleBox` per box. Each `RuleBox` reads its own selection state
 * from `CompetencyAssociationsContext` directly (given `groupId` and its
 * own box key to compare against), so no selection state is threaded through
 * here.
 *
 * Appends one not-yet-saved placeholder `RuleBox` last whenever this group is
 * the one currently selected with no real rule box selected.
 */
const RuleBoxList = ({
  groupId,
  index,
  systemDefaultProfile,
  subsectionNamesByUsageKey,
  canEdit = false,
}: RuleBoxListProps) => {
  const intl = useIntl();
  const { selection, placeholder, setPlaceholderRulePayload } = useCompetencyAssociations();
  // The placeholder group has no real rule boxes.
  // The score field remounts on every score change; only "+ Rule" and the suggestion link may move focus.
  const refocusAfterSuggestion = useRef(false);
  useEffect(() => {
    refocusAfterSuggestion.current = false;
  });
  const boxes = groupId !== null ? ruleBoxesForGroup(groupId, index, systemDefaultProfile) : [];

  // Compares rounded percent + rule type + op (not `ruleKeyOf`'s raw key, which risks a
  // formatting-mismatch false negative); excludes the box being edited by its own `key`.
  const getInlineValidationMessage = (candidateBox: RuleBoxData) => (value: string): string => {
    const candidate: EffectiveRule = {
      ruleType: candidateBox.rule.ruleType,
      rulePayload: { ...candidateBox.rule.rulePayload, value: Math.round(Number(value)) / 100 },
    };
    return isRuleTakenInGroup(candidate, boxes, candidateBox.key)
      ? intl.formatMessage(messages.duplicateScoreValidationMessage)
      : '';
  };

  // For the placeholder group (`groupId === null`) this holds whenever its card renders.
  const showPlaceholder = selection?.groupId === groupId && selection?.ruleKey === null;
  const placeholderRule: EffectiveRule = {
    ruleType: systemDefaultProfile.ruleType,
    rulePayload: placeholder.rulePayload ?? systemDefaultProfile.rulePayload,
  };
  const placeholderBox: RuleBoxData = { key: '__placeholder__', rule: placeholderRule, criteria: [] };

  // An untouched default that another box already uses would merge into that box on save.
  const isPlaceholderScoreTaken = canEdit && isRuleTakenInGroup(placeholderRule, boxes);
  const suggestedScore = isPlaceholderScoreTaken ? nextUnusedScore(placeholderRule, boxes) : null;
  const placeholderHint = isPlaceholderScoreTaken && (
    <>
      {intl.formatMessage(messages.defaultScoreTakenHint, {
        score: formatScoreSummary(intl, placeholderRule.rulePayload),
      })}
      {suggestedScore && (
        <>
          {' '}
          <Button
            variant="link"
            size="inline"
            className="rule-box__use-suggestion"
            onClick={() => {
              refocusAfterSuggestion.current = true;
              setPlaceholderRulePayload(suggestedScore);
            }}
          >
            {intl.formatMessage(messages.useSuggestedScoreLink, { score: formatScoreSummary(intl, suggestedScore) })}
          </Button>
        </>
      )}
    </>
  );

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
          // Remounts when the displayed score changes, since the field never resyncs from props.
          key={`placeholder-${Math.round(placeholderRule.rulePayload.value * 100)}`}
          groupId={groupId}
          ruleKey={null}
          rule={placeholderRule}
          criteria={[]}
          subsectionNamesByUsageKey={subsectionNamesByUsageKey}
          canEdit={canEdit}
          getInlineValidationMessage={getInlineValidationMessage(placeholderBox)}
          hint={placeholderHint || undefined}
          autoFocusSelect={groupId !== null && (placeholder.rulePayload === null || refocusAfterSuggestion.current)}
        />
      )}
    </div>
  );
};

export default RuleBoxList;
