import { defineMessages } from '@edx/frontend-platform/i18n';

const messages = defineMessages({
  ruleGroupMoreActionsLabel: {
    id: 'course-authoring.competency-management.criteria-groups.rule-group-more-actions-label',
    defaultMessage: 'More actions for this group',
    description: 'Accessible label for the ⋮ button that opens a rule group\'s actions menu.',
  },
  removeRuleGroupMenuItem: {
    id: 'course-authoring.competency-management.criteria-groups.remove-rule-group-menu-item',
    defaultMessage: 'Remove group',
    description: 'Menu item that removes a rule group, or discards the unsaved one, with its rule boxes.',
  },
  courseGroupMoreActionsLabel: {
    id: 'course-authoring.competency-management.criteria-groups.course-group-more-actions-label',
    defaultMessage: 'More actions for {courseName}',
    description: 'Accessible label for the ⋮ button that opens a course group\'s actions menu. '
      + '{courseName} is the name of the course the group belongs to.',
  },
  removeFromCompetencyMenuItem: {
    id: 'course-authoring.competency-management.criteria-groups.remove-from-competency-menu-item',
    defaultMessage: 'Remove from {competencyName}',
    description: 'Menu item that removes a course group, with all its rule groups, from the active competency. '
      + '{competencyName} is the name of that competency.',
  },
  logicOperatorAnyLabel: {
    id: 'course-authoring.competency-management.criteria-groups.logic-operator-any-label',
    defaultMessage: 'any',
    description: 'Label for a bottom-tier group\'s "or" logic operator, shown inline in '
      + '"By completing any of the following".',
  },
  logicOperatorAllLabel: {
    id: 'course-authoring.competency-management.criteria-groups.logic-operator-all-label',
    defaultMessage: 'all',
    description: 'Label for a bottom-tier group\'s "and" logic operator, shown inline in '
      + '"By completing all of the following".',
  },
  logicOperatorOrLabel: {
    id: 'course-authoring.competency-management.criteria-groups.logic-operator-or-label',
    defaultMessage: 'Or',
    description: 'Label for a course-level group\'s "or" logic operator, shown on the connector between '
      + 'two adjacent sibling bottom-tier groups.',
  },
  logicOperatorAndLabel: {
    id: 'course-authoring.competency-management.criteria-groups.logic-operator-and-label',
    defaultMessage: 'And',
    description: 'Label for a course-level group\'s "and" logic operator, shown on the connector between '
      + 'two adjacent sibling bottom-tier groups.',
  },
  criteriaGroupBoxLabel: {
    id: 'course-authoring.competency-management.criteria-groups.criteria-group-box-label',
    defaultMessage: 'By completing {operator} of the following',
    description: 'Header sentence on a bottom-tier group\'s bracket, naming how its rule boxes combine. '
      + '"{operator}" is rendered as the any/all control, not plain text.',
  },
  scoreThresholdLabel: {
    id: 'course-authoring.competency-management.criteria-groups.score-threshold-label',
    defaultMessage: 'With a score of {threshold}',
    description: 'Closed-state label for a rule box\'s score threshold. "{threshold}" is the highlighted '
      + 'value box, e.g. "75% or higher".',
  },
  scoreThresholdValue: {
    id: 'course-authoring.competency-management.criteria-groups.score-threshold-value',
    defaultMessage: '{percent}%',
    description: 'The percentage inside a rule box\'s score threshold value box, before the or-higher/or-lower '
      + 'suffix. "{percent}" is a whole-number percentage (0-100), converted from the rule\'s 0.0-1.0 fraction.',
  },
  scoreThresholdOrHigherSuffix: {
    id: 'course-authoring.competency-management.criteria-groups.score-threshold-or-higher-suffix',
    defaultMessage: 'or higher',
    description: 'Suffix appended to the score threshold label when the rule\'s comparison is "at least" '
      + '(op: gte).',
  },
  scoreThresholdOrLowerSuffix: {
    id: 'course-authoring.competency-management.criteria-groups.score-threshold-or-lower-suffix',
    defaultMessage: 'or lower',
    description: 'Suffix appended to the score threshold label when the rule\'s comparison is "at most" '
      + '(op: lte). No suffix is appended for an exact-match rule (op: eq).',
  },
  removeCriterionButtonLabel: {
    id: 'course-authoring.competency-management.criteria-groups.remove-criterion-button-label',
    defaultMessage: 'Remove the association with {subsectionName}',
    description: 'Accessible label for the "x" icon on a rule box chip that removes the subsection\'s association '
      + 'with the competency. {subsectionName} is the name of the subsection.',
  },
  unknownSubsectionLabel: {
    id: 'course-authoring.competency-management.criteria-groups.unknown-subsection-label',
    defaultMessage: 'Content unavailable',
    description: 'Chip text for a criterion whose subsection isn\'t found in its course\'s outline.',
  },
  unavailableCriterionAccessibleLabel: {
    id: 'course-authoring.competency-management.criteria-groups.unavailable-criterion-accessible-label',
    defaultMessage: 'Content unavailable in {courseName}',
    description: 'Screen-reader text for a criterion chip whose subsection can\'t be found in its course\'s '
      + 'outline. {courseName} is the name of the course the chip belongs to.',
  },
  fromWithinCourseLabel: {
    id: 'course-authoring.competency-management.criteria-groups.from-within-course-label',
    defaultMessage: 'From within {courseName} ...',
    description: 'Header sentence on a course-level group\'s card, naming the course its bottom-tier groups '
      + 'belong to. "{courseName}" is rendered in bold, not plain text.',
  },
  expandCourseGroupButtonLabel: {
    id: 'course-authoring.competency-management.criteria-groups.expand-course-group.button-label',
    defaultMessage: 'Expand',
    description: 'Accessible label for the disclosure control that expands a collapsed course-level '
      + 'associations group.',
  },
  collapseCourseGroupButtonLabel: {
    id: 'course-authoring.competency-management.criteria-groups.collapse-course-group.button-label',
    defaultMessage: 'Collapse',
    description: 'Accessible label for the disclosure control that collapses an expanded course-level '
      + 'associations group.',
  },
  courseGroupListErrorMessage: {
    id: 'course-authoring.competency-management.criteria-groups.course-group-list-error-message',
    defaultMessage: 'There was a problem loading this competency\'s associations. Please try again.',
    description: 'Inline error message shown when loading a competency\'s existing criteria groups, or the '
      + 'system default rule profile, fails.',
  },
  scoreThresholdInputAccessibleLabel: {
    id: 'course-authoring.competency-management.criteria-groups.score-threshold-input-accessible-label',
    defaultMessage: 'Score threshold percentage',
    description: 'Accessible name for the editable score-threshold input, which otherwise relies on the '
      + 'surrounding sentence ("With a score of ___% or higher") for sighted users only.',
  },
  duplicateScoreValidationMessage: {
    id: 'course-authoring.competency-management.criteria-groups.duplicate-score-validation-message',
    defaultMessage: 'Another rule box in this group already uses this score.',
    description: 'Inline validation message shown while editing a rule box\'s score threshold, when the typed '
      + 'value would exactly duplicate another rule box\'s own score, rule type, and comparison in the same '
      + 'group.',
  },
  scoreThresholdRangeValidationMessage: {
    id: 'course-authoring.competency-management.criteria-groups.score-threshold-range-validation-message',
    defaultMessage: 'Enter a whole number from 0 to 100.',
    description: 'Inline validation message shown while editing a rule box\'s score threshold, when the typed '
      + 'value is not a whole number from 0 to 100.',
  },
  selectRuleBoxButtonLabel: {
    id: 'course-authoring.competency-management.criteria-groups.select-rule-box-button-label',
    defaultMessage: 'Select this rule',
    description: 'Visually hidden accessible label for the button that selects a rule box, stretched to cover '
      + 'the whole box - the box has no single short visible phrase of its own to reuse as this label.',
  },
  defaultScoreTakenHint: {
    id: 'course-authoring.competency-management.criteria-groups.default-score-taken-hint',
    defaultMessage: 'Another rule in this group already uses {score}. Choose a different score.',
    description: 'Guidance under a new, empty rule box whose score is already used by another rule in the same '
      + 'group. "{score}" is the score as shown in the field, such as "75% or higher".',
  },
  useSuggestedScoreLink: {
    id: 'course-authoring.competency-management.criteria-groups.use-suggested-score-link',
    defaultMessage: 'Use {score}',
    description: 'Link under the "score already used" guidance that applies the nearest unused score. '
      + '"{score}" is that score as shown in the field, such as "80% or higher".',
  },
  addRuleButtonLabel: {
    id: 'course-authoring.competency-management.criteria-groups.add-rule-button-label',
    defaultMessage: 'Rule',
    description: 'Label for the button that adds a new, not-yet-saved rule box to a bottom-tier group.',
  },
  addRuleGroupButtonLabel: {
    id: 'course-authoring.competency-management.criteria-groups.add-rule-group-button-label',
    defaultMessage: 'Rule Group',
    description: 'Label for the button that adds a new, not-yet-saved bottom-tier group to a course-level group.',
  },
  addControlAccessiblePrefix: {
    id: 'course-authoring.competency-management.criteria-groups.add-control-accessible-prefix',
    defaultMessage: 'Add',
    description: 'Visually hidden word placed before the "Rule" or "Rule Group" button label, so the '
      + 'accessible name reads "Add Rule" while the visible label stays "Rule".',
  },
  addControlDisabledTooltip: {
    id: 'course-authoring.competency-management.criteria-groups.add-control-disabled-tooltip',
    defaultMessage: 'Fill in the empty box before adding another.',
    description: 'Tooltip on a disabled "+ Rule"/"+ Rule Group" button, shown while a not-yet-saved placeholder '
      + 'already exists elsewhere in the tree.',
  },
  placeholderRuleBoxHint: {
    id: 'course-authoring.competency-management.criteria-groups.placeholder-rule-box-hint',
    defaultMessage: 'Select content below to add it here.',
    description: 'Hint text shown in place of chips on a not-yet-saved placeholder rule box, which has no '
      + 'content associated with it yet.',
  },
  editConfirmationSaveButton: {
    id: 'course-authoring.competency-management.criteria-groups.edit-confirmation-save-button',
    defaultMessage: 'Save changes',
    description: 'Primary button of the dialog that confirms an edit to a saved rule or rule group.',
  },
  editConfirmationErrorHeading: {
    id: 'course-authoring.competency-management.criteria-groups.edit-confirmation-error-heading',
    defaultMessage: 'Couldn\'t save this change',
    description: 'Heading of the error alert shown in the edit confirmation dialog when saving fails.',
  },
  scoreRulePopoverTitle: {
    id: 'course-authoring.competency-management.criteria-groups.score-rule-popover-title',
    defaultMessage: 'Competency Completion Rule',
    description: 'Title of the popover where a saved rule box\'s score threshold is edited.',
  },
  scoreRulePopoverCancelButton: {
    id: 'course-authoring.competency-management.criteria-groups.score-rule-popover-cancel-button',
    defaultMessage: 'Cancel',
    description: 'Button that closes the score threshold popover without saving.',
  },
  scoreRulePopoverSaveButton: {
    id: 'course-authoring.competency-management.criteria-groups.score-rule-popover-save-button',
    defaultMessage: 'Save',
    description: 'Primary button of the score threshold popover that submits the edited score.',
  },
  scoreOperatorGte: {
    id: 'course-authoring.competency-management.criteria-groups.score-operator-gte',
    defaultMessage: '>=',
    description: 'Read-only symbol for the "at least" comparison, shown next to the score input in the popover.',
  },
  scoreOperatorEq: {
    id: 'course-authoring.competency-management.criteria-groups.score-operator-eq',
    defaultMessage: '=',
    description: 'Read-only symbol for the "exactly" comparison, shown next to the score input in the popover.',
  },
  scoreOperatorLte: {
    id: 'course-authoring.competency-management.criteria-groups.score-operator-lte',
    defaultMessage: '<=',
    description: 'Read-only symbol for the "at most" comparison, shown next to the score input in the popover.',
  },
  scoreChangeConfirmationTitle: {
    id: 'course-authoring.competency-management.criteria-groups.score-change-confirmation-title',
    defaultMessage: 'Change this rule to {newScore}?',
    description: 'Title of the dialog that confirms a new score for a saved rule. "{newScore}" is the new score, '
      + 'such as "80% or higher".',
  },
  scoreChangeConfirmationItemsText: {
    id: 'course-authoring.competency-management.criteria-groups.score-change-confirmation-items-text',
    defaultMessage: 'The new score applies to the <b>{count, plural, one {# content item} other {# content items}}'
      + '</b> in this rule.',
    description: 'First paragraph of the score change dialog. "{count}" is the number of content items in the rule.',
  },
  scoreChangeConfirmationFutureText: {
    id: 'course-authoring.competency-management.criteria-groups.score-change-confirmation-future-text',
    defaultMessage: 'This only affects future evaluations of <b>{competencyName}</b>. Learners already evaluated '
      + 'against {oldScore} keep the status they have.',
    description: 'Second paragraph of the score change dialog. "{competencyName}" is the competency being edited '
      + 'and "{oldScore}" is the score before the change, such as "70% or higher".',
  },
  scoreChangeFailedText: {
    id: 'course-authoring.competency-management.criteria-groups.score-change-failed-text',
    defaultMessage: 'The rule is still {oldScore}. Try again, or cancel to keep editing.',
    description: 'Text of the error alert in the score change dialog when saving fails. "{oldScore}" is the score '
      + 'the rule still has, such as "70% or higher".',
  },
  requireAllConfirmationTitle: {
    id: 'course-authoring.competency-management.criteria-groups.require-all-confirmation-title',
    defaultMessage: 'Require all content in this group?',
    description: 'Title of the dialog confirming a change of a saved group from "any" to "all".',
  },
  requireAllConfirmationText: {
    id: 'course-authoring.competency-management.criteria-groups.require-all-confirmation-text',
    defaultMessage: 'Learners will need to meet the score on every content item in this group, not just one.',
    description: 'First paragraph of the dialog confirming a change of a saved group from "any" to "all".',
  },
  requireAnyConfirmationTitle: {
    id: 'course-authoring.competency-management.criteria-groups.require-any-confirmation-title',
    defaultMessage: 'Require any content in this group?',
    description: 'Title of the dialog confirming a change of a saved group from "all" to "any". The copy is '
      + 'awaiting designer confirmation.',
  },
  requireAnyConfirmationText: {
    id: 'course-authoring.competency-management.criteria-groups.require-any-confirmation-text',
    defaultMessage: 'Learners will need to meet the score on just one content item in this group, not every one.',
    description: 'First paragraph of the dialog confirming a change of a saved group from "all" to "any". The copy '
      + 'is awaiting designer confirmation.',
  },
  logicChangeFutureText: {
    id: 'course-authoring.competency-management.criteria-groups.logic-change-future-text',
    defaultMessage: 'This only affects future evaluations of <b>{competencyName}</b>. Learners already evaluated '
      + 'keep the status they have.',
    description: 'Second paragraph of the any/all change dialog. "{competencyName}" is the competency being edited.',
  },
  groupStillRequiresAnyText: {
    id: 'course-authoring.competency-management.criteria-groups.group-still-requires-any-text',
    defaultMessage: 'The group still requires any content. Try again, or cancel to keep it as it is.',
    description: 'Text of the error alert in the any/all change dialog when saving fails and the group is still "any". '
      + 'The copy is awaiting designer confirmation.',
  },
  groupStillRequiresAllText: {
    id: 'course-authoring.competency-management.criteria-groups.group-still-requires-all-text',
    defaultMessage: 'The group still requires all content. Try again, or cancel to keep it as it is.',
    description: 'Text of the error alert in the any/all change dialog when saving fails and the group is still "all". '
      + 'The copy is awaiting designer confirmation.',
  },
});

export default messages;
