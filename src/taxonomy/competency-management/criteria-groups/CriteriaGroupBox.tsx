import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import {
  Dropdown,
  Icon,
  IconButton,
} from '@openedx/paragon';
import { MoreVert } from '@openedx/paragon/icons';
import classNames from 'classnames';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { BottomTierCompetencyCriteriaGroup, CompetencyGroupLogicOperator } from '../data/types';
import AddControl from './AddControl';
import EditConfirmationModal from './EditConfirmationModal';
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
  /** Name of the course these criteria belong to, read aloud for an unavailable chip. */
  courseName?: string;
  canEdit: boolean;
}

/** One bottom-tier group's "By completing any/all of the following"
 * bracket, plus its rule boxes and its own "+ Rule" control. The "By
 * completing..." band is the group's selection control; the rule boxes are
 * siblings of it, not descendants, so no interactive element contains another.
 * Without a real `group` (the not-yet-saved placeholder group), it reads its
 * any/all logic from the context's `placeholder` state and has no select
 * button. It never scrolls itself into view: a selected rule box, real or
 * placeholder, does.
 */
const CriteriaGroupBox = ({ group, subsectionNamesByUsageKey, courseName, canEdit }: CriteriaGroupBoxProps) => {
  const intl = useIntl();
  const {
    selection,
    competencyName,
    placeholder,
    selectGroup,
    index,
    systemDefaultProfile,
    updateGroupOperator,
    addPlaceholderRuleBox,
    setPlaceholderLogicOperator,
    hasPlaceholder,
    deleteGroup,
    isDeleting,
    removePlaceholderGroup,
    keyboardFocusRequest,
    consumeKeyboardFocusRequest,
  } = useCompetencyAssociations();

  // `null` identifies the placeholder group, matching `CriteriaSelection`.
  const groupId = group?.id ?? null;
  const isSelected = selection?.groupId === groupId;
  const logicOperator = group ? group.logicOperator : placeholder.logicOperator;

  const operatorLabel = logicOperator === 'AND'
    ? intl.formatMessage(messages.logicOperatorAllLabel)
    : intl.formatMessage(messages.logicOperatorAnyLabel);
  const selectButtonRef = useRef<HTMLButtonElement>(null);
  const operatorRef = useRef<HTMLSpanElement>(null);
  const [pendingLogicOperator, setPendingLogicOperator] = useState<CompetencyGroupLogicOperator | null>(null);
  const hadPendingLogicOperator = useRef(false);
  // The dialog's focus trap returns focus to the clicked menu item after this
  // effect runs, so the toggle is focused one tick later.
  useEffect(() => {
    if (pendingLogicOperator !== null) {
      hadPendingLogicOperator.current = true;
      return undefined;
    }
    if (!hadPendingLogicOperator.current) {
      return undefined;
    }
    hadPendingLogicOperator.current = false;
    const timer = setTimeout(() => operatorRef.current?.querySelector('button')?.focus(), 0);
    return () => clearTimeout(timer);
  }, [pendingLogicOperator]);
  // `preventScroll`: the selected rule box scrolls itself into view.
  const takesKeyboardFocus = group !== undefined
    && keyboardFocusRequest?.kind === 'group'
    && keyboardFocusRequest.groupId === group.id;

  useEffect(() => {
    if (takesKeyboardFocus && selectButtonRef.current) {
      selectButtonRef.current.focus({ preventScroll: true });
      consumeKeyboardFocusRequest();
    }
  }, [takesKeyboardFocus, consumeKeyboardFocusRequest]);

  const handleLogicOperatorChange = (newLogicOperator: CompetencyGroupLogicOperator) => {
    if (newLogicOperator !== group?.logicOperator) {
      setPendingLogicOperator(newLogicOperator);
    }
  };

  const handleConfirm = async () => {
    await updateGroupOperator(group!.id, pendingLogicOperator!);
    setPendingLogicOperator(null);
  };

  const requiresAll = pendingLogicOperator === 'AND';
  const richText = { b: (chunks: ReactNode) => <strong>{chunks}</strong> };

  const handleRemoveClick = () => {
    if (group) {
      deleteGroup(group.id);
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
    <>
      {
        /* Not itself interactive, since the rule boxes it contains are; the
      group's own control is the header. */
      }
      <div
        className={classNames('criteria-group-box', { 'criteria-group-box--selected': isSelected })}
      >
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
                aria-current={isSelected}
                onClick={() => selectGroup(group.id)}
              >
                <span className="sr-only">
                  {intl.formatMessage(messages.criteriaGroupBoxLabel, { operator: operatorLabel })}
                </span>
              </button>
            )}
            {intl.formatMessage(messages.criteriaGroupBoxLabel, {
              operator: (
                <span key="operator" ref={operatorRef}>
                  <LogicOperatorSelect
                    className="criteria-group-box__header-operator"
                    value={pendingLogicOperator ?? logicOperator}
                    labels={{
                      and: intl.formatMessage(messages.logicOperatorAllLabel),
                      or: intl.formatMessage(messages.logicOperatorAnyLabel),
                    }}
                    onChange={canEdit
                      ? (group ? handleLogicOperatorChange : setPlaceholderLogicOperator)
                      : undefined}
                  />
                </span>
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
          <div className="criteria-group-box__rules">
            <RuleBoxList
              groupId={groupId}
              index={index}
              systemDefaultProfile={systemDefaultProfile}
              subsectionNamesByUsageKey={subsectionNamesByUsageKey}
              courseName={courseName}
              canEdit={canEdit}
            />
            {canEdit && (
              <AddControl
                label={intl.formatMessage(messages.addRuleButtonLabel)}
                disabled={hasPlaceholder}
                onClick={handleAddRuleClick}
              />
            )}
          </div>
        )}
      </div>
      {group && (
        <EditConfirmationModal
          isOpen={pendingLogicOperator !== null}
          title={intl.formatMessage(
            requiresAll ? messages.requireAllConfirmationTitle : messages.requireAnyConfirmationTitle,
          )}
          body={
            <>
              <p>
                {intl.formatMessage(
                  requiresAll ? messages.requireAllConfirmationText : messages.requireAnyConfirmationText,
                )}
              </p>
              <p>{intl.formatMessage(messages.logicChangeFutureText, { competencyName, ...richText })}</p>
            </>
          }
          errorText={intl.formatMessage(
            group.logicOperator === 'OR' ? messages.groupStillRequiresAnyText : messages.groupStillRequiresAllText,
          )}
          onConfirm={handleConfirm}
          onCancel={() => setPendingLogicOperator(null)}
        />
      )}
    </>
  );
};

export default CriteriaGroupBox;
