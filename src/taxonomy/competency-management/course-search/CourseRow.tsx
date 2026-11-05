import {
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { useIntl } from '@edx/frontend-platform/i18n';
import { IconButton } from '@openedx/paragon';
import { ExpandLess, ExpandMore } from '@openedx/paragon/icons';

import { LoadingSpinner } from '@src/generic/Loading';
import type { Course } from '@src/studio-home/data/api';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import CourseOutlineSubtree from './CourseOutlineSubtree';
import messages from './messages';

export interface CourseRowProps {
  course: Course;
}

interface OutlineWrapperProps {
  hadFocusRef: MutableRefObject<boolean>;
  children: ReactNode;
}

/** Records into `hadFocusRef` whether focus was inside it when it unmounts. */
const OutlineWrapper = ({ hadFocusRef, children }: OutlineWrapperProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  // A layout-effect cleanup runs before React detaches the node, so `activeElement` still points inside it.
  useLayoutEffect(() => () => {
    hadFocusRef.current = wrapperRef.current?.contains(document.activeElement) ?? false;
  }, [hadFocusRef]);
  return <div ref={wrapperRef}>{children}</div>;
};

/** CourseRow
 * One row of the competency management course search/browse list: a
 * course's title, plus a disclosure control that expands the row to show
 * its outline.
 *
 * The row's title carries no click behavior of its own - only the
 * disclosure control toggles anything, and this row is navigation-only,
 * never an association target for the active competency.
 */
const CourseRow = ({ course }: CourseRowProps) => {
  const intl = useIntl();
  const {
    notifyCourseExpanded,
    isCourseGroupArchived,
    groupsQuery,
    profileQuery,
  } = useCompetencyAssociations();
  const [isExpanded, setIsExpanded] = useState(false);

  const showsSpinner = groupsQuery.isLoading || profileQuery.isLoading;
  const isGroupArchived = isCourseGroupArchived(course.courseKey);
  const showsOutline = isExpanded && !showsSpinner && !isGroupArchived;

  const messageRef = useRef<HTMLDivElement>(null);
  const outlineHadFocus = useRef(false);

  useEffect(() => {
    if (showsOutline) {
      return;
    }
    if (outlineHadFocus.current) {
      messageRef.current?.focus();
    }
    outlineHadFocus.current = false;
  }, [showsOutline]);

  const toggleLabel = isExpanded
    ? intl.formatMessage(messages.collapseRowButtonLabel)
    : intl.formatMessage(messages.expandRowButtonLabel);

  const handleToggle = () => {
    // Reads `isExpanded` directly rather than a functional updater: React
    // may invoke a functional updater more than once, so calling
    // `notifyCourseExpanded` (another component's state setter) from inside
    // one would risk React's "Cannot update a component while rendering a
    // different component" warning.
    const next = !isExpanded;
    if (next) {
      // Only on expand, never on collapse - see `notifyCourseExpanded`'s
      // own docstring for why this direction matters.
      notifyCourseExpanded(course.courseKey);
    }
    setIsExpanded(next);
  };

  return (
    <div className="course-search-browse__group course-search-browse__group--course">
      <div className="course-search-browse__course-row d-flex align-items-center">
        <IconButton
          src={isExpanded ? ExpandLess : ExpandMore}
          alt={toggleLabel}
          aria-label={toggleLabel}
          aria-expanded={isExpanded}
          size="sm"
          onClick={handleToggle}
        />
        <div className="course-search-browse__course-title ml-2">{course.displayName}</div>
      </div>
      {isExpanded && showsSpinner && (
        <div className="course-search-browse__outline pt-2">
          <LoadingSpinner size="sm" />
        </div>
      )}
      {isExpanded && !showsSpinner && isGroupArchived && (
        <div className="course-search-browse__outline pt-2">
          <div className="small" tabIndex={-1} ref={messageRef}>
            {intl.formatMessage(messages.archivedCourseRulesMessage)}
          </div>
        </div>
      )}
      {showsOutline && (
        <OutlineWrapper hadFocusRef={outlineHadFocus}>
          <CourseOutlineSubtree courseId={course.courseKey} />
        </OutlineWrapper>
      )}
    </div>
  );
};

export default CourseRow;
