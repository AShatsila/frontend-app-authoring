import { useIntl } from '@edx/frontend-platform/i18n';
import { Badge } from '@openedx/paragon';

import CenteredSpinner from '@src/taxonomy/competency-management/CenteredSpinner';
import type { CompetencyTreeNode } from '../CompetencyTree';
import { CourseGroupList } from '../criteria-groups';
import messages from './messages';

export interface CriteriaAssociationsSectionProps {
  /** The currently selected competency, named in the "Demonstrate Mastery
   * For" line along with its Competency ID badge.
   */
  competency: CompetencyTreeNode;
  /** The status of the course list below this section, as the groups see it:
   * they are scoped to the listed courses, so `CourseGroupList` only renders
   * once that list has loaded and the context's scope matches it. The parent
   * passes `'pending'` for the commit in between (see `CourseSearchBrowse`).
   */
  courseListStatus: 'pending' | 'error' | 'success';
}

/** The associations section above "Courses & Content": the selected
 * competency's existing criteria groups, rendered as a tree of course-level
 * groups, bottom-tier groups, and rule boxes.
 *
 * `CourseGroupList` reads its own data and focus state from
 * `CompetencyAssociationsContext`; this component only renders the static
 * label/mastery lines, which need `competency` directly since the context
 * doesn't track its name.
 */
const CriteriaAssociationsSection = ({ competency, courseListStatus }: CriteriaAssociationsSectionProps) => {
  const intl = useIntl();

  return (
    <div className="course-search-browse__associations">
      <div className="course-search-browse__associations-label">
        {intl.formatMessage(messages.associationsSectionLabel)}
      </div>
      <div className="course-search-browse__associations-mastery">
        {intl.formatMessage(messages.demonstrateMasteryForLabel, {
          competencyName: <strong>{competency.value}</strong>,
        })}
        {competency.externalId && (
          <>
            <span className="sr-only">
              {intl.formatMessage(messages.competencyIdAccessibleLabel, {
                externalId: competency.externalId,
              })}
            </span>
            <Badge variant="info" className="competency-row__badge ml-2" aria-hidden="true">
              {competency.externalId}
            </Badge>
          </>
        )}
      </div>
      {courseListStatus === 'pending' && <CenteredSpinner />}
      {courseListStatus === 'success' && <CourseGroupList />}
    </div>
  );
};

export default CriteriaAssociationsSection;
