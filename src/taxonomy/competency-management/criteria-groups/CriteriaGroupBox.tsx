import { useEffect, useRef } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import {
  Card,
  Dropdown,
  Icon,
  IconButton,
} from '@openedx/paragon';
import { MoreVert } from '@openedx/paragon/icons';
import classNames from 'classnames';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { BottomTierCompetencyCriteriaGroup } from '../data/types';
import { RemovalTargetKind } from '@src/taxonomy/competency-management/constants';
import AddControl from './AddControl';
import LogicOperatorSelect from './LogicOperatorSelect';
import RuleBoxList from './RuleBoxList';
import messages from './messages';

const isTextEntryElement = (element: Element | null): boolean => (
  element instanceof HTMLInputElement
  || element instanceof HTMLTextAreaElement
  || element instanceof HTMLSelectElement
  || (element instanceof HTMLElement && element.isContentEditable)
);

export interface CriteriaGroupBoxProps {
  /** The persisted bottom-tier group this card represents, or `undefined`
   * for the not-yet-saved placeholder group (`#671`) - `CourseGroupSection`
   * is the only caller that ever renders one without a real `group`, and
   * only ever one at a time (see `CompetencyAssociationsContext`'s own
   * `hasPlaceholder`).
   */
  group?: BottomTierCompetencyCriteriaGroup;
  subsectionNamesByUsageKey: Record<string, string>;
  canEdit: boolean;
}

/** One bottom-tier group's "By completing any/all of the following"
 * bracket, plus its rule boxes and its own "+ Rule" control. Without a real
 * `group` (the not-yet-saved placeholder group), it reads its any/all logic
 * from the context's `placeholder` state and has no select button. It never
 * scrolls itself into view: a focused rule box, real or placeholder, does.
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
    requestRemoval,
    isDeleting,
    removePlaceholderGroup,
    keyboardFocusRequest,
    consumeKeyboardFocusRequest,
  } = useCompetencyAssociations();

  // `null` identifies the placeholder group, matching `CriteriaFocus`.
  const groupId = group?.id ?? null;
  const isFocused = focus?.groupId === groupId;
  const logicOperator = group ? group.logicOperator : placeholder.logicOperator;

  const operatorLabel = logicOperator === 'AND'
    ? intl.formatMessage(messages.logicOperatorAllLabel)
    : intl.formatMessage(messages.logicOperatorAnyLabel);
  const selectButtonRef = useRef<HTMLButtonElement>(null);
  // `preventScroll`: the focused rule box scrolls itself into view.
  const takesKeyboardFocus = group !== undefined
    && keyboardFocusRequest?.kind === 'group'
    && keyboardFocusRequest.groupId === group.id;
  useEffect(() => {
    if (takesKeyboardFocus && selectButtonRef.current) {
      // Stealing focus from a text field would blur it, and `ScoreThresholdField` saves on blur.
      if (!isTextEntryElement(document.activeElement)) {
        queueMicrotask(() => selectButtonRef.current?.focus({ preventScroll: true }));
      }
      consumeKeyboardFocusRequest();
    }
  }, [takesKeyboardFocus, consumeKeyboardFocusRequest]);

  const handleRemoveClick = () => {
    if (group) {
      requestRemoval({ kind: RemovalTargetKind.RuleGroup, groupId: group.id });
    } else {
      removePlaceholderGroup();
    }
  };

  const handleAddRuleClick: React.MouseEventHandler = () => {
    if (groupId !== null) {
      addPlaceholderRuleBox(groupId);
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
          <div className="criteria-group-box__header flex-grow-1">
            {
              /* `.stretched-link` (Bootstrap/Paragon utility) makes the whole
            * header band clickable via this button's own `::after`, without
            * nesting the dropdown toggle below inside a `button`-role
            * ancestor - ARIA disallows interactive content inside one. */
            }
            {group && (
              <button
                ref={selectButtonRef}
                type="button"
                className="stretched-link criteria-group-box__select-button"
                aria-current={isFocused}
                onClick={() => focusGroup(group.id)}
              >
                <span className="sr-only">
                  {intl.formatMessage(messages.criteriaGroupBoxLabel, { operator: operatorLabel })}
                </span>
              </button>
            )}
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
            <Dropdown>
              <Dropdown.Toggle
                id={`rule-group-menu-toggle-${group?.id ?? 'placeholder'}`}
                as={IconButton}
                src={MoreVert}
                iconAs={Icon}
                variant="primary"
                aria-label={intl.formatMessage(messages.ruleGroupMoreActionsLabel)}
                size="inline"
                disabled={isDeleting}
              />
              <Dropdown.Menu>
                <Dropdown.Item onClick={handleRemoveClick}>
                  {intl.formatMessage(messages.removeRuleGroupMenuItem)}
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
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
