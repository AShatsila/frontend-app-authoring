import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { Card, IconButton } from '@openedx/paragon';
import { Delete, ExpandLess, ExpandMore } from '@openedx/paragon/icons';

import { useCourseOutlineIndex } from '@src/course-outline/data';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { CourseCompetencyCriteriaGroup } from '../data/types';
import { bottomTierGroupsForCourse } from '../utils';
import AddControl from './AddControl';
import CriteriaGroupBox from './CriteriaGroupBox';
import GroupConnector from './GroupConnector';
import messages from './messages';

export interface CourseGroupSectionProps {
  courseGroup: CourseCompetencyCriteriaGroup;
}

/** One accessible course-level group: its own header ("From within
 * **{course name}** ...") and its bottom-tier group cards, connected
 * pairwise by `GroupConnector`, plus its "+ Rule Group" control and, while
 * one exists, the placeholder group as a last card.
 *
 * `CourseGroupList` only mounts this for a course already confirmed
 * accessible, so `useCourseOutlineIndex` below is normally reading an
 * already-resolved, already-cached success (same hook/query key
 * `CourseOutlineSubtree` uses). The `isError`/raw-course-key fallback is
 * defensive only (e.g. a cache eviction between the check and this render),
 * not a real "inaccessible course" state.
 */
const CourseGroupSection = ({ courseGroup }: CourseGroupSectionProps) => {
  const intl = useIntl();
  const {
    index,
    canEditCourse,
    focus,
    placeholder,
    addPlaceholderGroup,
    discardPlaceholder,
    hasPlaceholder,
    deleteGroup,
    isDeletingGroup,
    keyboardFocusRequest,
    consumeKeyboardFocusRequest,
  } = useCompetencyAssociations();
  const [isCollapsed, setIsCollapsed] = useState(false);
  // `refetchOnMount: false`: mirrors `CourseOutlineSubtree` - avoids a
  // wasted refetch of already-cached data on every mount.
  const { data, isError } = useCourseOutlineIndex(courseGroup.courseKey, { refetchOnMount: false });

  const courseDisplayName = (!isError && data) ? data.courseStructure.displayName : courseGroup.courseKey;

  const subsectionNamesByUsageKey = useMemo(() => {
    const names: Record<string, string> = {};
    if (!isError && data) {
      (data.courseStructure.childInfo?.children ?? []).forEach((section) => {
        (section.childInfo?.children ?? []).forEach((subsection) => {
          // The real `course_index` response populates `.id`, never
          // `.usageKey` (see `CourseOutlineSubtree`'s `SubsectionRow`).
          names[subsection.id] = subsection.displayName;
        });
      });
    }
    return names;
  }, [data, isError]);

  // `index` is only `undefined` during `CourseGroupList`'s own loading/error
  // states, before this component ever mounts.
  const bottomTierGroups = index ? bottomTierGroupsForCourse(index, courseGroup.courseKey) : [];

  const canEdit = canEditCourse(courseGroup.courseKey);
  const showPlaceholderGroup = focus?.groupId === null && placeholder.parentRuleGroupId === courseGroup.id;
  const holdsPlaceholderRuleBox = focus?.ruleKey === null
    && focus.groupId !== null
    && bottomTierGroups.some((group) => group.id === focus.groupId);

  // A collapsed section has not mounted its cards, so one named by a pending
  // keyboard focus request is either opened for it or, when the author's
  // collapse is to be kept, the request is dropped rather than left to linger.
  const request = keyboardFocusRequest?.kind === 'group'
      && bottomTierGroups.some((group) => group.id === keyboardFocusRequest.groupId)
    ? keyboardFocusRequest
    : null;
  const holdsFocusRequestTarget = request !== null;
  const requestExpandsSection = request?.expand === true;
  useEffect(() => {
    if (!holdsFocusRequestTarget || !isCollapsed) {
      return;
    }
    if (requestExpandsSection) {
      setIsCollapsed(false);
    } else {
      consumeKeyboardFocusRequest();
    }
  }, [holdsFocusRequestTarget, requestExpandsSection, isCollapsed, consumeKeyboardFocusRequest]);

  const handleToggleCollapsed = () => {
    // A collapsed section hides its placeholder, so it is dropped instead of lingering unseen.
    if (!isCollapsed && (showPlaceholderGroup || holdsPlaceholderRuleBox)) {
      discardPlaceholder();
    }
    setIsCollapsed((prev) => !prev);
  };

  const handleAddRuleGroupClick: React.MouseEventHandler = (event) => {
    event.stopPropagation();
    addPlaceholderGroup(courseGroup.id);
  };

  const toggleLabel = isCollapsed
    ? intl.formatMessage(messages.expandCourseGroupButtonLabel)
    : intl.formatMessage(messages.collapseCourseGroupButtonLabel);

  const deleteLabel = intl.formatMessage(messages.deleteCourseGroupButtonLabel, { courseName: courseDisplayName });

  return (
    <Card className="course-group-section">
      <Card.Header
        size="sm"
        title={intl.formatMessage(messages.fromWithinCourseLabel, {
          courseName: <strong key="course-name">{courseDisplayName}</strong>,
        })}
        actions={
          <div className="d-flex">
            {canEdit && (
              <IconButton
                src={Delete}
                alt={deleteLabel}
                aria-label={deleteLabel}
                size="sm"
                disabled={isDeletingGroup}
                onClick={() => deleteGroup(courseGroup.id)}
              />
            )}
            <IconButton
              src={isCollapsed ? ExpandMore : ExpandLess}
              alt={toggleLabel}
              aria-label={toggleLabel}
              aria-expanded={!isCollapsed}
              size="sm"
              onClick={handleToggleCollapsed}
            />
          </div>
        }
      />
      {!isCollapsed && (
        <Card.Body className="course-group-section__body">
          {bottomTierGroups.map((group, groupIndex) => (
            <Fragment key={group.id}>
              {groupIndex > 0 && <GroupConnector logicOperator={courseGroup.logicOperator} />}
              <CriteriaGroupBox
                group={group}
                subsectionNamesByUsageKey={subsectionNamesByUsageKey}
                canEdit={canEdit}
              />
            </Fragment>
          ))}
          {showPlaceholderGroup && (
            <Fragment key="placeholder">
              {bottomTierGroups.length > 0 && <GroupConnector logicOperator={courseGroup.logicOperator} />}
              <CriteriaGroupBox
                subsectionNamesByUsageKey={subsectionNamesByUsageKey}
                canEdit={canEdit}
              />
            </Fragment>
          )}
          {canEdit && (
            <AddControl
              label={intl.formatMessage(messages.addRuleGroupButtonLabel)}
              disabled={hasPlaceholder}
              onClick={handleAddRuleGroupClick}
            />
          )}
        </Card.Body>
      )}
    </Card>
  );
};

export default CourseGroupSection;
