import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import {
  Card,
  Dropdown,
  Icon,
  IconButton,
} from '@openedx/paragon';
import { ExpandLess, ExpandMore, MoreVert } from '@openedx/paragon/icons';
import classNames from 'classnames';

import { useCourseOutlineIndex } from '@src/course-outline/data';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import { courseKeyOfSelection } from '../criterionTarget';
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
    selection,
    placeholder,
    addPlaceholderGroup,
    discardPlaceholder,
    hasPlaceholder,
    competencyName,
    deleteGroup,
    isDeleting,
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
  const showPlaceholderGroup = selection?.groupId === null && placeholder.parentRuleGroupId === courseGroup.id;
  const containsSelection = !!index && courseKeyOfSelection(selection, placeholder, index) === courseGroup.courseKey;
  const holdsPlaceholderRuleBox = selection?.ruleKey === null
    && selection.groupId !== null
    && bottomTierGroups.some((group) => group.id === selection.groupId);

  // A collapsed section has not mounted its cards: open it for the request, or drop the request.
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

  return (
    <Card className={classNames('course-group-section', { 'course-group-section--selected': containsSelection })}>
      <Card.Header
        size="sm"
        title={
          <div className="course-group-section__title">
            <IconButton
              src={isCollapsed ? ExpandMore : ExpandLess}
              alt={toggleLabel}
              aria-label={toggleLabel}
              aria-expanded={!isCollapsed}
              size="inline"
              onClick={handleToggleCollapsed}
            />
            <span>
              {intl.formatMessage(messages.fromWithinCourseLabel, {
                courseName: <strong key="course-name">{courseDisplayName}</strong>,
              })}
            </span>
          </div>
        }
        actions={canEdit && (
          <Dropdown>
            <Dropdown.Toggle
              id={`course-group-menu-toggle-${courseGroup.id}`}
              as={IconButton}
              src={MoreVert}
              iconAs={Icon}
              variant="primary"
              aria-label={intl.formatMessage(messages.courseGroupMoreActionsLabel, {
                courseName: courseDisplayName,
              })}
              size="inline"
              disabled={isDeleting}
            />
            <Dropdown.Menu>
              <Dropdown.Item onClick={() => deleteGroup(courseGroup.id)}>
                {intl.formatMessage(messages.removeFromCompetencyMenuItem, { competencyName })}
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        )}
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
