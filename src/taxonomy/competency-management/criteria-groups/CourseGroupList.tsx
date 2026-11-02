import { useEffect, useRef } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';

import AlertMessage from '@src/generic/alert-message';
import CenteredSpinner from '../CenteredSpinner';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import courseSearchMessages from '../course-search/messages';
import CourseGroupSection from './CourseGroupSection';
import messages from './messages';
// @ts-ignore
import './criteria-groups.scss';

/** The top-of-panel associations tree for the currently selected
 * competency: loading, failed, empty, or the list of accessible course-level
 * groups. Reads everything from `CompetencyAssociationsContext`.
 *
 * "Loading" covers the groups and default-rule-profile queries. The empty
 * state is decided on `accessibleCourseGroups`, never the raw payload, so a
 * course the author can't see renders as no associations. An empty list waits
 * for `areCourseOutlinesLoading`, since that filter is incomplete until then;
 * accessible groups render without waiting on other courses' outlines.
 *
 * The fetch is scoped to the listed courses, so an empty list means one of
 * two things, told apart by the response's instance-wide `totalCriteriaCount`:
 * the competency has no associations anywhere, or it has some and none of
 * them are in the listed courses. Each gets its own message (#683).
 */
const CourseGroupList = () => {
  const intl = useIntl();
  const {
    groupsQuery,
    profileQuery,
    index,
    accessibleCourseGroups,
    areCourseOutlinesLoading,
    keyboardFocusRequest,
    consumeKeyboardFocusRequest,
    competencyName,
  } = useCompetencyAssociations();
  const emptyStateRef = useRef<HTMLDivElement>(null);
  const takesKeyboardFocus = keyboardFocusRequest?.kind === 'empty';

  // The empty state mounts in the same render that last emptied the list, or
  // in the one that finishes loading course outlines, so the ref is normally set by the
  // time this runs.
  useEffect(() => {
    if (takesKeyboardFocus && emptyStateRef.current) {
      emptyStateRef.current.focus({ preventScroll: true });
      consumeKeyboardFocusRequest();
    }
  }, [takesKeyboardFocus, accessibleCourseGroups.length, areCourseOutlinesLoading, consumeKeyboardFocusRequest]);

  if (groupsQuery.isPending || profileQuery.isPending) {
    return <CenteredSpinner />;
  }

  const counts = groupsQuery.data;
  if (groupsQuery.isError || profileQuery.isError || !index || !profileQuery.data || !counts) {
    return (
      <AlertMessage
        variant="danger"
        description={intl.formatMessage(messages.courseGroupListErrorMessage)}
      />
    );
  }

  // Groups can land before their courses' outlines, which decide access; an
  // empty list then only means "not known yet", so it must not read as empty.
  if (accessibleCourseGroups.length === 0 && areCourseOutlinesLoading) {
    return <CenteredSpinner />;
  }

  if (accessibleCourseGroups.length === 0) {
    const { totalCriteriaCount } = counts;
    return (
      <div ref={emptyStateRef} tabIndex={-1} className="course-search-browse__associations-empty-state">
        <p className="mb-0">
          {totalCriteriaCount === 0
            ? intl.formatMessage(courseSearchMessages.noAssociationsMessage, {
              competencyName: <strong>{competencyName}</strong>,
            })
            : intl.formatMessage(courseSearchMessages.noAssociationsInListedCoursesMessage, {
              competencyName: <strong>{competencyName}</strong>,
            })}
        </p>
        <p className="mb-0">{intl.formatMessage(courseSearchMessages.noAssociationsPromptMessage)}</p>
      </div>
    );
  }

  return (
    <div className="course-group-list">
      {accessibleCourseGroups.map((courseGroup) => (
        <CourseGroupSection
          key={courseGroup.id}
          courseGroup={courseGroup}
        />
      ))}
    </div>
  );
};

export default CourseGroupList;
