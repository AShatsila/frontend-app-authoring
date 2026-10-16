import { useEffect, useRef } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import {
  Dropdown,
  Icon,
  IconButton,
} from '@openedx/paragon';
import { MoreVert } from '@openedx/paragon/icons';
import classNames from 'classnames';
import { useCompetencyAssociations } from '../CompetencyAssociationsContext';
import type { BottomTierCompetencyCriteriaGroup } from '../data/types';
import { ruleBoxesForGroup } from '../utils';
import AddControl from './AddControl';
import type { AddControlProps } from './AddControl';
import LogicOperatorSelect from './LogicOperatorSelect';
import RuleBoxList from './RuleBoxList';
import messages from './messages';

export interface CriteriaGroupBoxProps {
  /** `undefined` for the not-yet-saved placeholder group, which reads its any/all logic from the context. */
  group?: BottomTierCompetencyCriteriaGroup;
  subsectionNamesByUsageKey: Record<string, string>;
  /** Whether the author can edit this group's any/all logic and its rule boxes' scores. */
  canEdit: boolean;
}

/** One bottom-tier group's "By completing any/all of the following"
 * bracket, plus its rule boxes. The "By completing..." band focuses the
 * group; the rule boxes are its siblings, not descendants.
 *
 * A focused rule box scrolls itself into view; the group scrolls only when
 * it is focused and none of its rule boxes is. A saved group with no criteria
 * has no rule key to match, so it is focused as its placeholder rule box by
 * design, and that box scrolls.
 */
const CriteriaGroupBox = ({ group, subsectionNamesByUsageKey, canEdit }: CriteriaGroupBoxProps) => {
  const intl = useIntl();
  const {
    focus,
    placeholder,
    focusGroup,
    status,
    groupsIndex,
    systemDefaultProfile,
    updateGroupOperator,
    addPlaceholderRuleBox,
    setPlaceholderLogicOperator,
    hasPlaceholder,
    isAssociating,
    deleteGroup,
    isDeletingGroup,
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
  const hasFocusedBox = isFocused && (focus.ruleKey === null || boxes.some((box) => box.key === focus.ruleKey));

  useEffect(() => {
    if (isFocused && !hasFocusedBox) {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isFocused, hasFocusedBox]);

  const selectButtonRef = useRef<HTMLButtonElement>(null);
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

  const sentenceLabel = intl.formatMessage(messages.criteriaGroupBoxLabel, {
    operator: logicOperator === 'AND'
      ? intl.formatMessage(messages.logicOperatorAllLabel)
      : intl.formatMessage(messages.logicOperatorAnyLabel),
  });
  const sentence = intl.formatMessage(messages.criteriaGroupBoxLabel, {
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
          ? (newLogicOperator) => (
            group ? updateGroupOperator(group.id, newLogicOperator) : setPlaceholderLogicOperator(newLogicOperator)
          )
          : undefined}
      />
    ),
  });

  let disabledReason: AddControlProps['disabledReason'] = null;
  if (isAssociating) {
    disabledReason = 'saving';
  } else if (hasPlaceholder) {
    disabledReason = 'placeholder';
  }

  return (
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
                disabled={isDeletingGroup}
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
            canEdit={canEdit}
          />
          {canEdit && groupId !== null && (
            <AddControl
              label={intl.formatMessage(messages.addRuleButtonLabel)}
              accessibleLabel={intl.formatMessage(messages.addRuleAccessibleLabel)}
              disabledReason={disabledReason}
              onClick={() => addPlaceholderRuleBox(groupId)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default CriteriaGroupBox;
