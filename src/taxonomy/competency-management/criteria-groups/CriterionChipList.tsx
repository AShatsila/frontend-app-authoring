import { useIntl } from '@edx/frontend-platform/i18n';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { CompetencyCriterion } from '../data/types';
import CriterionChip from './CriterionChip';
import messages from './messages';

export interface CriterionChipListProps {
  criteria: CompetencyCriterion[];
  /** Subsection display names, keyed by usage key - resolved once per
   * course by `CourseGroupSection` from its own outline fetch. A criterion
   * whose `objectId` has no entry here (deleted content or search-index
   * lag) falls back to a neutral label.
   */
  subsectionNamesByUsageKey: Record<string, string>;
  // SPIKE: shape not final
  /** Shows each chip's remove affordance. */
  canEdit?: boolean;
}

/** The chips inside one rule box, one per criterion.
 *
 * Empty (renders nothing) when given no criteria - not expected for a
 * persisted box per ADR 0002's "no empty groups" rule, but a freshly
 * created, not-yet-saved box can start with none.
 */
const CriterionChipList = ({ criteria, subsectionNamesByUsageKey, canEdit = false }: CriterionChipListProps) => {
  const intl = useIntl();
  const { removeAssociation } = useCompetencyAssociations();

  if (criteria.length === 0) {
    return null;
  }

  return (
    <div className="criterion-chip-list d-flex flex-wrap">
      {criteria.map((criterion) => (
        <CriterionChip
          key={criterion.id}
          displayName={subsectionNamesByUsageKey[criterion.objectId] ??
            intl.formatMessage(messages.unknownSubsectionLabel)}
          onRemove={canEdit ? () => removeAssociation(criterion.objectId, 'chip') : undefined}
        />
      ))}
    </div>
  );
};

export default CriterionChipList;
