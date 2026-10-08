import { defineMessages } from '@edx/frontend-platform/i18n';

const messages = defineMessages({
  deleteRuleGroupButtonLabel: {
    id: 'course-authoring.competency-management.criteria-groups.delete-rule-group-button-label',
    defaultMessage: 'Delete rule group',
    description: 'Accessible label for the icon button that deletes a rule group, or discards the unsaved one.',
  },
  deleteCourseGroupButtonLabel: {
    id: 'course-authoring.competency-management.criteria-groups.delete-course-group-button-label',
    defaultMessage: 'Delete course group for {courseName}',
    description: 'Accessible label for the icon button that deletes a course group and all its rule groups. '
      + '{courseName} is the name of the course the group belongs to.',
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
    defaultMessage: 'With a score of {percent}%',
    description: 'Closed-state label for a rule box\'s score threshold, before the or-higher/or-lower suffix. '
      + '"{percent}" is a whole-number percentage (0-100), converted from the rule\'s 0.0-1.0 fraction.',
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
  unknownSubsectionLabel: {
    id: 'course-authoring.competency-management.criteria-groups.unknown-subsection-label',
    defaultMessage: 'Content unavailable',
    description: 'Fallback chip text for a criterion whose associated subsection isn\'t found in its '
      + 'course\'s outline (deleted content or search-index lag, not a permission boundary).',
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
});

export default messages;
