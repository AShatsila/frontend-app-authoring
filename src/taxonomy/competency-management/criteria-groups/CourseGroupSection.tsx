import { Fragment, useMemo, useState } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { Card, IconButton } from '@openedx/paragon';
import { ExpandLess, ExpandMore } from '@openedx/paragon/icons';

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
 * pairwise by `GroupConnector`, plus its own "+ Rule Group" control
 * (`#671`) for starting a not-yet-saved placeholder bottom-tier group -
 * rendered as one more card, after the real ones, counted the same as a
 * real card for connector purposes.
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
    hasPlaceholder,
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
  // The not-yet-saved placeholder group (`#671`) belongs to this
  // course-level group - shown as one more card, after the real ones.
  const showPlaceholderGroup = focus?.groupId === null && placeholder.parentRuleGroupId === courseGroup.id;

  const handleAddRuleGroupClick: React.MouseEventHandler = (event) => {
    event.stopPropagation();
    addPlaceholderGroup(courseGroup.id);
  };

  const toggleLabel = isCollapsed
    ? intl.formatMessage(messages.expandCourseGroupButtonLabel)
    : intl.formatMessage(messages.collapseCourseGroupButtonLabel);

  return (
    <Card className="course-group-section">
      <Card.Header
        size="sm"
        title={intl.formatMessage(messages.fromWithinCourseLabel, {
          courseName: <strong key="course-name">{courseDisplayName}</strong>,
        })}
        actions={
          <IconButton
            src={isCollapsed ? ExpandMore : ExpandLess}
            alt={toggleLabel}
            aria-label={toggleLabel}
            aria-expanded={!isCollapsed}
            size="sm"
            onClick={() => setIsCollapsed((prev) => !prev)}
          />
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
