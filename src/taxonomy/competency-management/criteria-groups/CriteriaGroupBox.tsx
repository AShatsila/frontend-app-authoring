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
import { ruleBoxesForGroup } from '../utils';
import AddControl from './AddControl';
import EditConfirmationModal from './EditConfirmationModal';
import LogicOperatorSelect from './LogicOperatorSelect';
import RuleBoxList from './RuleBoxList';
import messages from './messages';

export interface CriteriaGroupBoxProps {
  /** `undefined` for the not-yet-saved placeholder group, which reads its any/all logic from the context. */
  group?: BottomTierCompetencyCriteriaGroup;
  subsectionNamesByUsageKey: Record<string, string>;
  /** Name of the course these criteria belong to, read aloud for an unavailable chip. */
  courseName?: string;
  /** Whether the author can edit this group's any/all logic and its rule boxes' scores. */
  canEdit: boolean;
}

/** One bottom-tier group's "By completing any/all of the following"
 * bracket, plus its rule boxes. The "By completing..." band focuses the
 * group; the rule boxes are its siblings, not descendants.
 *
 * At most one of the group and its rule boxes scrolls into view: a focused
 * rule box scrolls itself, and the group scrolls only when none of its boxes
 * matches the focused rule key.
 */
const CriteriaGroupBox = ({ group, subsectionNamesByUsageKey, courseName, canEdit }: CriteriaGroupBoxProps) => {
  const intl = useIntl();
  const {
    focus,
    competencyName,
    placeholder,
    focusGroup,
    status,
    groupsIndex,
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
  const ref = useRef<HTMLDivElement>(null);

  // `null` is the placeholder group's id in `CriteriaFocus`.
  const groupId = group?.id ?? null;
  const logicOperator = group ? group.logicOperator : placeholder.logicOperator;
  const isFocused = focus?.groupId === groupId;
  const boxes = status === 'success' && groupId !== null
    ? ruleBoxesForGroup(groupId, groupsIndex, systemDefaultProfile)
    : [];
  // A placeholder rule box (`ruleKey === null`) scrolls itself.
  const hasFocusedBox = isFocused && (focus.ruleKey === null || boxes.some((box) => box.key === focus.ruleKey));

  useEffect(() => {
    if (isFocused && !hasFocusedBox) {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isFocused, hasFocusedBox]);

  const selectButtonRef = useRef<HTMLButtonElement>(null);
  const operatorRef = useRef<HTMLSpanElement>(null);
  const [pendingLogicOperator, setPendingLogicOperator] = useState<CompetencyGroupLogicOperator | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(focusTimer.current), []);

  // A refetch that already shows the pending value makes the confirmation moot.
  useEffect(() => {
    if (group && pendingLogicOperator === group.logicOperator) {
      setPendingLogicOperator(null);
    }
  }, [group?.logicOperator, pendingLogicOperator]);

  // Closes the confirmation, or only if it is still for `confirmed`. react-bootstrap keeps the menu mounted but
  // hidden after it closes, so the dialog's focus return lands on the hidden menu item and fails; the toggle is
  // focused on the next tick, after that.
  const closeConfirmation = (confirmed?: CompetencyGroupLogicOperator) => {
    setPendingLogicOperator((current) => (confirmed === undefined || current === confirmed ? null : current));
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => operatorRef.current?.querySelector('button')?.focus(), 0);
  };
  const takesKeyboardFocus = group !== undefined
    && keyboardFocusRequest?.kind === 'group'
    && keyboardFocusRequest.groupId === group.id;
  useEffect(() => {
    if (takesKeyboardFocus && selectButtonRef.current) {
      // `preventScroll`: the focused rule box scrolls itself into view.
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
    const confirmed = pendingLogicOperator!;
    await updateGroupOperator(group!.id, confirmed);
    closeConfirmation(confirmed);
  };

  const requiresAll = pendingLogicOperator === 'AND';
  const richText = { b: (chunks: ReactNode) => <span className="font-weight-bold">{chunks}</span> };

  const sentenceLabel = intl.formatMessage(messages.criteriaGroupBoxLabel, {
    operator: logicOperator === 'AND'
      ? intl.formatMessage(messages.logicOperatorAllLabel)
      : intl.formatMessage(messages.logicOperatorAnyLabel),
  });
  const sentence = intl.formatMessage(messages.criteriaGroupBoxLabel, {
    operator: (
      <span key="operator" ref={operatorRef}>
        <LogicOperatorSelect
          className="criteria-group-box__header-operator"
          value={pendingLogicOperator ?? logicOperator}
          labels={{
            and: intl.formatMessage(messages.logicOperatorAllLabel),
            or: intl.formatMessage(messages.logicOperatorAnyLabel),
          }}
          onChange={canEdit ? (group ? handleLogicOperatorChange : setPlaceholderLogicOperator) : undefined}
        />
      </span>
    ),
  });

  return (
    <>
      <div
        ref={ref}
        className={classNames('criteria-group-box', { 'criteria-group-box--focused': isFocused })}
      >
        {canEdit
          ? (
            // The operator dropdown is a button, so the select control is a sibling laid over the band.
            <div className="criteria-group-box__header-row d-flex align-items-center">
              <div className="criteria-group-box__header flex-grow-1">
                {group && (
                  <button
                    ref={selectButtonRef}
                    type="button"
                    className="criteria-group-box__select-button"
                    aria-current={isFocused}
                    onClick={() => focusGroup(group.id)}
                  >
                    <span className="sr-only">{sentenceLabel}</span>
                  </button>
                )}
                {sentence}
              </div>
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
                  <Dropdown.Item onClick={() => (group ? deleteGroup(group.id) : removePlaceholderGroup())}>
                    {intl.formatMessage(messages.removeRuleGroupMenuItem)}
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </div>
          )
          : (
            <button
              type="button"
              className="criteria-group-box__header"
              aria-current={isFocused}
              onClick={() => group && focusGroup(group.id)}
            >
              {sentence}
            </button>
          )}
        {status === 'success' && (
          <div className="criteria-group-box__rules">
            <RuleBoxList
              groupId={groupId}
              boxes={boxes}
              subsectionNamesByUsageKey={subsectionNamesByUsageKey}
              courseName={courseName}
              canEdit={canEdit}
            />
            {canEdit && groupId !== null && (
              <AddControl
                label={intl.formatMessage(messages.addRuleButtonLabel)}
                disabled={hasPlaceholder}
                onClick={() => addPlaceholderRuleBox(groupId)}
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
          onCancel={() => closeConfirmation()}
        />
      )}
    </>
  );
};

export default CriteriaGroupBox;
