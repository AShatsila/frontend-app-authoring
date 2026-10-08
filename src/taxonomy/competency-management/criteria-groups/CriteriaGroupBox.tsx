import { useEffect, useRef } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { Card, IconButton } from '@openedx/paragon';
import { Delete } from '@openedx/paragon/icons';
import classNames from 'classnames';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { BottomTierCompetencyCriteriaGroup } from '../data/types';
import AddControl from './AddControl';
import LogicOperatorSelect from './LogicOperatorSelect';
import RuleBoxList from './RuleBoxList';
import messages from './messages';

export interface CriteriaGroupBoxProps {
  /** The persisted bottom-tier group this card represents, or `undefined`
   * for the not-yet-saved placeholder group (`#671`) - `CourseGroupSection`
   * is the only caller that ever renders one without a real `group`, and
   * only ever one at a time (see `CompetencyAssociationsContext`'s own
   * `hasPlaceholder`).
   */
  group?: BottomTierCompetencyCriteriaGroup;
  subsectionNamesByUsageKey: Record<string, string>;
  /** Whether the signed-in author can edit this group's own any/all logic
   * and its rule boxes' scores - resolved once by `CourseGroupSection` via
   * `canEditCourse(courseGroup.courseKey)` and threaded down as a plain
   * prop, rather than re-derived here from `index`.
   */
  canEdit: boolean;
}

/** One bottom-tier group's "By completing any/all of the following"
 * bracket, plus its rule boxes and its own "+ Rule" control. The
 * "By completing..." band is the group's focus control; the rule boxes are
 * siblings of it, not descendants, so no interactive element contains
 * another. Without a real `group` (the not-yet-saved placeholder group), it
 * reads its any/all logic and rule boxes from the context's `placeholder`
 * state instead, and clicking it is a no-op. It never scrolls itself into
 * view: a focused rule box, real or placeholder, scrolls itself instead.
 *
 * `Card` supplies the bordered/rounded box itself; the "By completing..."
 * band is a `<div>` with its own scoped styling
 * (`criteria-groups.scss`), since neither `Card.Header` (its own distinct
 * title/subtitle typography) nor any Paragon prop covers an inline-sentence
 * band like this one.
 */
const CriteriaGroupBox = ({ group, subsectionNamesByUsageKey, canEdit }: CriteriaGroupBoxProps) => {
  const intl = useIntl();
  const {
    focus,
    placeholder,
    focusGroup,
    index,
    systemDefaultProfile,
    updateGroupOperator,
    addPlaceholderRuleBox,
    setPlaceholderLogicOperator,
    hasPlaceholder,
    deleteGroup,
    isDeletingGroup,
    removePlaceholderGroup,
    keyboardFocusRequest,
    consumeKeyboardFocusRequest,
  } = useCompetencyAssociations();

  // `null` identifies the placeholder group, matching `CriteriaFocus`.
  const groupId = group?.id ?? null;
  const isFocused = focus?.groupId === groupId;
  const logicOperator = group ? group.logicOperator : placeholder.logicOperator;

  const headerRef = useRef<HTMLDivElement>(null);
  // A delete leaves this request when the trash button that had keyboard
  // focus is gone. `preventScroll` because the focused group's own
  // scrolling is not this component's call.
  const takesKeyboardFocus = group !== undefined
    && keyboardFocusRequest?.kind === 'group'
    && keyboardFocusRequest.groupId === group.id;
  useEffect(() => {
    if (takesKeyboardFocus && headerRef.current) {
      headerRef.current.focus({ preventScroll: true });
      consumeKeyboardFocusRequest();
    }
  }, [takesKeyboardFocus, consumeKeyboardFocusRequest]);

  const handleDeleteClick: React.MouseEventHandler = () => {
    if (group) {
      deleteGroup(group.id);
    } else {
      removePlaceholderGroup();
    }
  };

  const handleClick: React.MouseEventHandler = () => {
    // The placeholder card has no real id to focus and is already focused.
    if (group) {
      focusGroup(group.id);
    }
  };

  const handleAddRuleClick: React.MouseEventHandler = () => {
    if (groupId !== null) {
      addPlaceholderRuleBox(groupId);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler = (event) => {
    // Only this wrapper's own key events, not ones bubbled up from the
    // any/all dropdown once `canEdit` is true - otherwise this handler's
    // `preventDefault` would swallow the dropdown's own Enter/Space.
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (group) {
        focusGroup(group.id);
      }
    }
  };

  return (
    // This wrapper is not itself interactive, since the rule boxes it
    // contains are; the group's own control is the header band.
    <div
      className={classNames('criteria-group-box', { 'criteria-group-box--focused': isFocused })}
    >
      <Card>
        <div className="criteria-group-box__header-row d-flex align-items-center">
          <div
            ref={headerRef}
            className="criteria-group-box__header flex-grow-1"
            role="button"
            tabIndex={0}
            aria-pressed={isFocused}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
          >
            {intl.formatMessage(messages.criteriaGroupBoxLabel, {
              operator: (
                <LogicOperatorSelect
                  key="operator"
                  className="criteria-group-box__header-operator"
                  value={logicOperator}
                  labels={{
                    and: intl.formatMessage(messages.logicOperatorAllLabel),
                    or: intl.formatMessage(messages.logicOperatorAnyLabel),
                  }}
                  onChange={canEdit
                    ? (group
                      ? (newLogicOperator) => updateGroupOperator(group.id, newLogicOperator)
                      : setPlaceholderLogicOperator)
                    : undefined}
                />
              ),
            })}
          </div>
          {canEdit && (
            <IconButton
              src={Delete}
              alt={intl.formatMessage(messages.deleteRuleGroupButtonLabel)}
              aria-label={intl.formatMessage(messages.deleteRuleGroupButtonLabel)}
              size="sm"
              disabled={isDeletingGroup}
              onClick={handleDeleteClick}
            />
          )}
        </div>
        {index && systemDefaultProfile && (
          <Card.Body className="criteria-group-box__rules">
            <RuleBoxList
              groupId={groupId}
              index={index}
              systemDefaultProfile={systemDefaultProfile}
              subsectionNamesByUsageKey={subsectionNamesByUsageKey}
              canEdit={canEdit}
            />
            {canEdit && (
              <AddControl
                label={intl.formatMessage(messages.addRuleButtonLabel)}
                disabled={hasPlaceholder}
                onClick={handleAddRuleClick}
              />
            )}
          </Card.Body>
        )}
      </Card>
    </div>
  );
};

export default CriteriaGroupBox;
