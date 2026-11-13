import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Ref } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import {
  Card,
  Dropdown,
  Icon,
  IconButton,
  Stack,
} from '@openedx/paragon';
import { ExpandLess, ExpandMore, MoreVert } from '@openedx/paragon/icons';
import classNames from 'classnames';

import { useCourseOutlineIndex } from '@src/course-outline/data';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import { courseKeyOfSelection } from '@src/taxonomy/competency-management/criterionTarget';
import type { CourseCompetencyCriteriaGroup } from '../data/types';
import { bottomTierGroupsForCourse } from '../utils';
import AddControl from './AddControl';
import type { AddControlProps } from './AddControl';
import CriteriaGroupBox from './CriteriaGroupBox';
import GroupConnector from './GroupConnector';
import messages from './messages';

export interface CourseGroupSectionProps {
  courseGroup: CourseCompetencyCriteriaGroup;
}

interface CourseGroupMenuProps {
  toggleRef: Ref<HTMLButtonElement>;
  id: string;
  toggleLabel: string;
  removeLabel: string;
  disabled: boolean;
  onRemove: () => void;
}

// `Card.Header` clones every action, and the elements inside it, with its own `size`, which would turn the toggle's
// inline size into the header's. Taking explicit props instead of children keeps the injected `size` off the toggle.
const CourseGroupMenu = ({ toggleRef, id, toggleLabel, removeLabel, disabled, onRemove }: CourseGroupMenuProps) => (
  <Dropdown>
    <Dropdown.Toggle
      ref={toggleRef}
      id={id}
      as={IconButton}
      src={MoreVert}
      iconAs={Icon}
      variant="primary"
      aria-label={toggleLabel}
      size="inline"
      disabled={disabled}
    />
    <Dropdown.Menu>
      <Dropdown.Item onClick={onRemove}>{removeLabel}</Dropdown.Item>
    </Dropdown.Menu>
  </Dropdown>
);

/** One accessible course-level group: its own header ("From within
 * **{course name}** ...") and its bottom-tier group cards, with an Or/And connector
 * between each adjacent pair. Renders nothing until the course outline has loaded.
 */
const CourseGroupSection = ({ courseGroup }: CourseGroupSectionProps) => {
  const intl = useIntl();
  const {
    canEditCourse,
    expansionCountByCourseId,
    selection,
    groupsIndex,
    status,
    placeholder,
    addPlaceholderGroup,
    discardPlaceholder,
    hasPlaceholder,
    isAssociating,
    competencyName,
    deleteGroup,
    isDeletingGroup,
    keyboardFocusRequest,
    consumeKeyboardFocusRequest,
  } = useCompetencyAssociations();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sectionToggleRef = useRef<HTMLButtonElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const { data } = useCourseOutlineIndex(courseGroup.courseKey, { refetchOnMount: false });

  const subsectionNamesByUsageKey = useMemo(() => {
    const names: Record<string, string> = {};
    (data?.courseStructure.childInfo?.children ?? []).forEach((section) => {
      (section.childInfo?.children ?? []).forEach((subsection) => {
        names[subsection.id] = subsection.displayName;
      });
    });
    return names;
  }, [data]);

  // A placeholder group (`selection.groupId === null`) is shown as one more card after the real ones.
  const showPlaceholderGroup = selection?.groupId === null && placeholder.parentRuleGroupId === courseGroup.id;
  const containsSelection = status === 'success' &&
    courseKeyOfSelection(selection, placeholder, groupsIndex) === courseGroup.courseKey;
  const holdsPlaceholderRuleBox = selection?.ruleKey === null
    && selection.groupId !== null
    && groupsIndex?.groupsById.get(selection.groupId)?.parentId === courseGroup.id;

  const bottomTierGroups = status === 'success' ? bottomTierGroupsForCourse(groupsIndex, courseGroup.courseKey) : [];

  // A collapsed section has not mounted its cards. A request that moves selection into it is opened by the selection
  // effect below. One that keeps the author's collapse, or a menu request, lands on the section's expand toggle instead.
  const request = (keyboardFocusRequest?.kind === 'group' || keyboardFocusRequest?.kind === 'menu')
      && bottomTierGroups.some((group) => group.id === keyboardFocusRequest.groupId)
    ? keyboardFocusRequest
    : null;
  const holdsFocusRequestTarget = request !== null;
  const requestExpandsSection = request?.kind === 'group' && request.expand;
  useEffect(() => {
    if (holdsFocusRequestTarget && isCollapsed && !requestExpandsSection) {
      sectionToggleRef.current?.focus();
      consumeKeyboardFocusRequest();
    }
  }, [holdsFocusRequestTarget, requestExpandsSection, isCollapsed, consumeKeyboardFocusRequest]);

  const isMenuDisabled = isDeletingGroup || isAssociating;
  const canEdit = canEditCourse(courseGroup.courseKey);
  const isRendered = status === 'success' && Boolean(data);
  // Waits for the toggle to render and be enabled again, since a disabled button cannot take focus.
  const takesMenuFocus = isRendered
    && canEdit
    && keyboardFocusRequest?.kind === 'menu'
    && keyboardFocusRequest.groupId === courseGroup.id
    && !isMenuDisabled;
  useEffect(() => {
    if (takesMenuFocus && menuToggleRef.current) {
      menuToggleRef.current.focus();
      consumeKeyboardFocusRequest();
    }
  }, [takesMenuFocus, consumeKeyboardFocusRequest]);

  const handleToggleCollapsed = () => {
    // A collapsed section hides its placeholder, so it is dropped instead of lingering unseen.
    if (!isCollapsed && (showPlaceholderGroup || holdsPlaceholderRuleBox)) {
      discardPlaceholder();
    }
    setIsCollapsed((prev) => !prev);
  };

  const expansionCount = expansionCountByCourseId[courseGroup.courseKey] ?? 0;

  // A collapsed card reopens when the selection moves into it or its course is expanded, so the selected box is visible.
  useEffect(() => {
    if (containsSelection) {
      setIsCollapsed(false);
    }
  }, [selection, containsSelection, expansionCount]);

  if (status !== 'success' || !data) {
    return null;
  }

  const courseName = data.courseStructure.displayName;
  const toggleLabel = intl.formatMessage(
    isCollapsed ? messages.expandCourseGroupButtonLabel : messages.collapseCourseGroupButtonLabel,
    { courseName },
  );

  let disabledReason: AddControlProps['disabledReason'] = null;
  if (isAssociating) {
    disabledReason = 'saving';
  } else if (isDeletingGroup) {
    disabledReason = 'deleting';
  } else if (hasPlaceholder) {
    disabledReason = 'placeholder';
  }

  return (
    <Card className={classNames('course-group-section', { 'course-group-section--selected': containsSelection })}>
      <Card.Header
        size="sm"
        title={
          <Stack direction="horizontal" gap={1} className="course-group-section__title">
            <IconButton
              ref={sectionToggleRef}
              src={isCollapsed ? ExpandMore : ExpandLess}
              alt={toggleLabel}
              aria-label={toggleLabel}
              aria-expanded={!isCollapsed}
              size="inline"
              onClick={handleToggleCollapsed}
            />
            <h3 className="course-group-section__heading">
              {intl.formatMessage(messages.fromWithinCourseLabel, {
                courseName: <span key="course-name" className="font-weight-bold">{courseName}</span>,
              })}
            </h3>
          </Stack>
        }
        actions={canEdit && (
          <CourseGroupMenu
            toggleRef={menuToggleRef}
            id={`course-group-menu-toggle-${courseGroup.id}`}
            toggleLabel={intl.formatMessage(messages.courseGroupMoreActionsLabel, { courseName })}
            removeLabel={intl.formatMessage(messages.removeFromCompetencyMenuItem, { competencyName })}
            disabled={isMenuDisabled}
            onRemove={() => deleteGroup(courseGroup.id)}
          />
        )}
      />
      {!isCollapsed && (
        <Card.Body className="course-group-section__body">
          <Stack gap={2}>
            {bottomTierGroups.map((group, groupIndex) => (
              <Fragment key={group.id}>
                {groupIndex > 0 && <GroupConnector logicOperator={courseGroup.logicOperator} />}
                <CriteriaGroupBox
                  group={group}
                  subsectionNamesByUsageKey={subsectionNamesByUsageKey}
                  canEdit={canEdit}
                  position={groupIndex + 1}
                  courseName={courseName}
                />
              </Fragment>
            ))}
            {showPlaceholderGroup && (
              <Fragment key="placeholder">
                {bottomTierGroups.length > 0 && <GroupConnector logicOperator={courseGroup.logicOperator} />}
                <CriteriaGroupBox
                  subsectionNamesByUsageKey={subsectionNamesByUsageKey}
                  canEdit={canEdit}
                  position={bottomTierGroups.length + 1}
                  courseName={courseName}
                />
              </Fragment>
            )}
            {canEdit && (
              <AddControl
                label={intl.formatMessage(messages.addRuleGroupButtonLabel)}
                accessibleLabel={intl.formatMessage(messages.addRuleGroupAccessibleLabel)}
                disabledReason={disabledReason}
                onClick={() => addPlaceholderGroup(courseGroup.id)}
              />
            )}
          </Stack>
        </Card.Body>
      )}
    </Card>
  );
};

export default CourseGroupSection;
