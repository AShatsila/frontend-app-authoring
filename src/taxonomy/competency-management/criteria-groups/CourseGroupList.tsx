import { useEffect, useRef } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';

import AlertMessage from '@src/generic/alert-message';
import { LoadingSpinner } from '@src/generic/Loading';
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
 * "Loading" covers both the groups query and the default-rule-profile query,
 * since `effectiveRuleOf` needs the profile to resolve an unoverridden
 * criterion. The empty state is decided on `accessibleCourseGroups` (already
 * filtered), never the raw payload's own counts, so a course the author
 * can't see renders identically to no associations at all. It waits for
 * `isCourseAccessResolved`, since that filter is incomplete until then.
 */
const CourseGroupList = () => {
  const intl = useIntl();
  const {
    groupsQuery,
    profileQuery,
    index,
    accessibleCourseGroups,
    isCourseAccessResolved,
    keyboardFocusRequest,
    consumeKeyboardFocusRequest,
  } = useCompetencyAssociations();
  const emptyStateRef = useRef<HTMLDivElement>(null);
  const takesKeyboardFocus = keyboardFocusRequest?.kind === 'empty';

  // The empty state mounts in the same render that last emptied the list, or
  // in the one that resolves course access, so the ref is normally set by the
  // time this runs.
  useEffect(() => {
    if (takesKeyboardFocus && emptyStateRef.current) {
      emptyStateRef.current.focus({ preventScroll: true });
      consumeKeyboardFocusRequest();
    }
  }, [takesKeyboardFocus, accessibleCourseGroups.length, isCourseAccessResolved, consumeKeyboardFocusRequest]);

  if (groupsQuery.isPending || profileQuery.isPending) {
    return (
      <div className="d-flex justify-content-center py-3">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (groupsQuery.isError || profileQuery.isError || !index || !profileQuery.data) {
    return (
      <AlertMessage
        variant="danger"
        description={intl.formatMessage(messages.courseGroupListErrorMessage)}
      />
    );
  }

  // Groups can land before their courses' outlines, which decide access; an
  // empty list then only means "not known yet", so it must not read as empty.
  if (accessibleCourseGroups.length === 0 && !isCourseAccessResolved) {
    return (
      <div className="d-flex justify-content-center py-3">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (accessibleCourseGroups.length === 0) {
    return (
      <div ref={emptyStateRef} tabIndex={-1} className="course-search-browse__associations-empty-state">
        <p>{intl.formatMessage(courseSearchMessages.noAssociationsMessage)}</p>
        <p>{intl.formatMessage(courseSearchMessages.noAssociationsPromptMessage)}</p>
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
