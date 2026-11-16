import { useIntl } from '@edx/frontend-platform/i18n';
import { Stack } from '@openedx/paragon';

import AlertMessage from '@src/generic/alert-message';
import CenteredSpinner from '../CenteredSpinner';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import CourseGroupSection from './CourseGroupSection';
import messages from './messages';
import './criteria-groups.scss';

export interface CourseGroupListProps {
  /** The selected competency's name, shown in bold in the empty state. */
  competencyName: string;
}

/** The associations tree for the selected competency: loading, failed, empty, or the
 * accessible course-level groups. A course whose outline returns 403 or 404 is hidden,
 * and any other outline failure shows the error state.
 *
 * The fetch is scoped to the listed courses, so an empty list means one of
 * two things, told apart by the response's instance-wide `totalCriteriaCount`:
 * the competency has no associations anywhere, or it has some and none of
 * them are in the listed courses. Each gets its own message (#683).
 */
const CourseGroupList = ({ competencyName }: CourseGroupListProps) => {
  const intl = useIntl();
  const {
    status,
    accessibleCourseGroups,
    criteriaCounts,
  } = useCompetencyAssociations();

  if (status === 'pending') {
    return <CenteredSpinner />;
  }

  if (status === 'error' || !criteriaCounts) {
    return (
      <AlertMessage
        variant="danger"
        description={intl.formatMessage(messages.courseGroupListErrorMessage)}
      />
    );
  }

  if (accessibleCourseGroups.length === 0) {
    const name = <strong>{competencyName}</strong>;
    return (
      <div className="course-group-list__empty-state">
        <p className="mb-0">
          {criteriaCounts.totalCriteriaCount === 0
            ? intl.formatMessage(messages.noAssociationsMessage, { competencyName: name })
            : intl.formatMessage(messages.noAssociationsInListedCoursesMessage, {
              competencyName: name,
              count: criteriaCounts.totalCriteriaCount - criteriaCounts.criteriaCount,
            })}
        </p>
        <p className="mb-0">{intl.formatMessage(messages.noAssociationsPromptMessage)}</p>
      </div>
    );
  }

  return (
    <Stack gap={3} className="course-group-list">
      {accessibleCourseGroups.map((courseGroup) => (
        <CourseGroupSection
          key={courseGroup.id}
          courseGroup={courseGroup}
        />
      ))}
    </Stack>
  );
};

export default CourseGroupList;
