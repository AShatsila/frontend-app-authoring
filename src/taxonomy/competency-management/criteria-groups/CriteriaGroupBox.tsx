import { useIntl } from '@edx/frontend-platform/i18n';
import { Card } from '@openedx/paragon';
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
  } = useCompetencyAssociations();

  // `null` identifies the placeholder group, matching `CriteriaFocus`.
  const groupId = group?.id ?? null;
  const isFocused = focus?.groupId === groupId;
  const logicOperator = group ? group.logicOperator : placeholder.logicOperator;

  const operatorLabel = logicOperator === 'AND'
    ? intl.formatMessage(messages.logicOperatorAllLabel)
    : intl.formatMessage(messages.logicOperatorAnyLabel);

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
        <div className="criteria-group-box__header">
          {
            /* `.stretched-link` (Bootstrap/Paragon utility) makes the whole
          * header band clickable via this button's own `::after`, without
          * nesting the dropdown toggle below inside a `button`-role
          * ancestor - ARIA disallows interactive content inside one. */
          }
          {group && (
            <button
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
