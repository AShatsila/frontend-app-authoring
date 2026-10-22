import { useIntl } from '@edx/frontend-platform/i18n';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { CompetencyCriterion } from '../data/types';
import CriterionChip from './CriterionChip';
import messages from './messages';

export interface CriterionChipListProps {
  criteria: CompetencyCriterion[];
  /** Subsection display names, keyed by usage key - resolved once per
   * course by `CourseGroupSection` from its own outline fetch. A criterion
   * whose `objectId` has no entry here (deleted content, or a cached
   * outline that predates the subsection) renders as an unavailable chip.
   */
  subsectionNamesByUsageKey: Record<string, string>;
  /** Name of the course these criteria belong to, read aloud for an unavailable chip. */
  courseName?: string;
  /** Shows each chip's remove icon. */
  canEdit?: boolean;
}

/** The chips inside one rule box, one per criterion.
 *
 * Empty (renders nothing) when given no criteria - not expected for a
 * persisted box per ADR 0002's "no empty groups" rule, but a freshly
 * created, not-yet-saved box can start with none.
 */
const CriterionChipList = ({
  criteria,
  subsectionNamesByUsageKey,
  courseName,
  canEdit = false,
}: CriterionChipListProps) => {
  const intl = useIntl();
  const { removeAssociation, isDeleting } = useCompetencyAssociations();

  if (criteria.length === 0) {
    return null;
  }

  return (
    <div className="criterion-chip-list d-flex flex-wrap">
      {criteria.map((criterion) => {
        const subsectionName = subsectionNamesByUsageKey[criterion.objectId];
        const unavailable = subsectionName === undefined;
        return (
          <CriterionChip
            key={criterion.id}
            displayName={unavailable ? intl.formatMessage(messages.unknownSubsectionLabel) : subsectionName}
            unavailable={unavailable}
            courseName={courseName}
            disabled={isDeleting}
            onRemove={canEdit ? () => removeAssociation(criterion.objectId, 'chip') : undefined}
          />
        );
      })}
    </div>
  );
};

export default CriterionChipList;
