import userEvent from '@testing-library/user-event';
import {
  fireEvent,
  initializeMocks,
  render,
  screen,
  within,
} from '@src/testUtils';
import { buildMockCompetencyAssociationsContextValue, MockCompetencyAssociationsProvider } from '../testHelpers';
import type {
  BottomTierCompetencyCriteriaGroup,
  CompetencyCriteriaGroupsResponse,
  CompetencyRuleProfile,
  CourseCompetencyCriteriaGroup,
} from '../data/types';
import { buildCompetencyCriteriaGroupsIndex } from '../utils';
import CriteriaGroupBox from './CriteriaGroupBox';

const systemDefaultProfile: CompetencyRuleProfile = {
  id: 1,
  scopeType: 'system_default',
  ruleType: 'grade',
  rulePayload: { op: 'gte', value: 0.7, scale: 'percent' },
  archived: false,
};

// A real course-level parent for the bottom-tier group below - a bottom-tier
// group never exists without one in the real API response. Without this,
// any `canEdit`/course-id resolution derived from the tree would silently
// default to false, and a "renders read-only" test would keep passing for
// the wrong reason.
const courseGroup: CourseCompetencyCriteriaGroup = {
  id: 1,
  parentId: null,
  tagId: 42,
  courseKey: 'course-v1:OrgX+CS101+2024',
  name: 'course',
  ordering: 0,
  logicOperator: 'AND',
  archived: false,
};

const group: BottomTierCompetencyCriteriaGroup = {
  id: 10,
  parentId: 1,
  tagId: 42,
  courseKey: null,
  name: 'leaf',
  ordering: 0,
  logicOperator: 'AND',
  archived: false,
};

const response: CompetencyCriteriaGroupsResponse = {
  groups: [courseGroup, group],
  criteria: [
    {
      id: 101,
      objectId: 'block-a',
      groupId: 10,
      ruleProfileId: 1,
      ruleTypeOverride: null,
      rulePayloadOverride: null,
    },
  ],
};

const index = buildCompetencyCriteriaGroupsIndex(response);

const renderBox = (
  contextOverrides: Parameters<typeof buildMockCompetencyAssociationsContextValue>[0] = {},
  subsectionNamesByUsageKey: Record<string, string> = {},
  // Defaults to `true`, matching `testHelpers.tsx`'s own `canEditCourse: () => true`
  // convention (tests default to "editable," and opt out explicitly).
  canEdit: boolean = true,
) => (
  render(
    <MockCompetencyAssociationsProvider value={{ index, systemDefaultProfile, ...contextOverrides }}>
      <CriteriaGroupBox group={group} subsectionNamesByUsageKey={subsectionNamesByUsageKey} canEdit={canEdit} />
    </MockCompetencyAssociationsProvider>,
  )
);

describe('<CriteriaGroupBox />', () => {
  beforeEach(() => {
    initializeMocks();
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the group\'s any/all label as plain text with no control when canEdit is false', () => {
    const { container } = renderBox({}, { 'block-a': 'Subsection A' }, false);

    // The header sentence is split across sibling text nodes (plain text +
    // the any/all `<span>`), so its full text is checked via textContent
    // rather than `getByText`, which doesn't match text split across nodes.
    expect(container.querySelector('.criteria-group-box__header')).toHaveTextContent(
      'By completing all of the following',
    );
    // Two `role="button"` elements exist (the group's own header band and
    // the one rendered rule box) - neither is a `Dropdown` trigger, since
    // `canEdit` is false here.
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText('Subsection A')).toBeInTheDocument();
  });

  it('calls focusGroup with its own id when the header band is clicked', () => {
    const focusGroup = jest.fn();
    const { container } = renderBox({ focusGroup });

    fireEvent.click(container.querySelector('.criteria-group-box__header')!);
    expect(focusGroup).toHaveBeenCalledWith(10);
  });

  it('calls focusGroup when the header band is activated with Enter or Space', () => {
    const focusGroup = jest.fn();
    renderBox({ focusGroup });
    const [header] = screen.getAllByRole('button');

    fireEvent.keyDown(header, { key: 'Enter' });
    fireEvent.keyDown(header, { key: ' ' });

    expect(focusGroup).toHaveBeenCalledTimes(2);
    expect(focusGroup).toHaveBeenCalledWith(10);
  });

  it('exposes focus state via aria-pressed on the header band and the rule box', () => {
    // Queried by their own selectors, not `getAllByRole('button')` position:
    // with the default `canEdit: true`, the any/all `Dropdown` trigger is a
    // third button nested inside the header band (see the exception noted
    // on the test below), which would otherwise shift a positional index.
    const { container, unmount } = renderBox();
    const header = container.querySelector('.criteria-group-box__header')!;
    const ruleBox = container.querySelector('.rule-box')!;
    expect([header, ruleBox].map((el) => el.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    unmount();

    const { container: focusedContainer } = renderBox({ focus: { groupId: 10, ruleKey: null } });
    const focusedHeader = focusedContainer.querySelector('.criteria-group-box__header')!;
    const focusedRuleBox = focusedContainer.querySelector('.rule-box')!;
    expect([focusedHeader, focusedRuleBox].map((el) => el.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });

  it('never nests an element with role button inside another, when canEdit is false', () => {
    // Read-only exception: when `canEdit` is true, the any/all `Dropdown`
    // trigger is deliberately nested inside the header band's own
    // `role="button"` - the same "interactive control nested inside an
    // interactive row" shape `RuleBox`/`ScoreThresholdField` already use,
    // guarded against a swallowed Enter/Space by this component's own
    // `event.target === event.currentTarget` check in `handleKeyDown`, not
    // by avoiding the nesting itself.
    renderBox({}, {}, false);

    screen.getAllByRole('button').forEach((button) => {
      expect(within(button).queryByRole('button')).not.toBeInTheDocument();
    });
  });

  it('clicking a rule box inside focuses only the rule box, not also the group', () => {
    const focusGroup = jest.fn();
    const focusRuleBox = jest.fn();
    renderBox({ focusGroup, focusRuleBox });

    fireEvent.click(screen.getByRole('button', { name: /with a score of/i }));

    expect(focusRuleBox).toHaveBeenCalledTimes(1);
    expect(focusGroup).not.toHaveBeenCalled();
  });

  it(
    'scrolls its own placeholder rule box into view when focused with no rule box selected, not the group '
      + 'container itself',
    () => {
      renderBox({ focus: { groupId: 10, ruleKey: null } });
      // The placeholder rule box scrolls itself, so the container must not.
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    },
  );

  it('does not scroll the group container when a rule box within it is the focused one', () => {
    renderBox({ focus: { groupId: 10, ruleKey: 'grade:gte:0.7:percent' } });

    // Only the rule box scrolls, not the container as well.
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('"+ Add Rule" on a non-focused card starts a placeholder rule box in that card\'s own group', async () => {
    const user = userEvent.setup();
    const addPlaceholderRuleBox = jest.fn();
    renderBox({ addPlaceholderRuleBox });

    await user.click(screen.getByRole('button', { name: 'Add Rule' }));

    expect(addPlaceholderRuleBox).toHaveBeenCalledWith(10);
  });

  it('disables "Add Rule" while a placeholder exists and describes it by a tooltip on the focusable wrapper', async () => {
    const user = userEvent.setup();
    renderBox({ hasPlaceholder: true });

    const addRuleButton = screen.getByRole('button', { name: 'Add Rule' });
    expect(addRuleButton).toBeDisabled();

    // A disabled button fires no hover or focus events, so the wrapper span takes them.
    const wrapper = addRuleButton.closest('.add-control__button-wrapper')!;
    expect(wrapper).not.toHaveAttribute('aria-describedby');
    await user.tab();
    await user.hover(wrapper);
    const tooltip = await screen.findByText('Fill in the empty box before adding another.');
    expect(wrapper).toHaveAttribute('aria-describedby', tooltip.closest('[role="tooltip"]')!.id);
  });

  it('keeps the visible label "Rule" inside the accessible name "Add Rule"', () => {
    renderBox();
    expect(screen.getByRole('button', { name: 'Add Rule' })).toHaveTextContent(/Rule$/);
  });

  it('hides "Add Rule" entirely when canEdit is false', () => {
    renderBox({}, {}, false);
    expect(screen.queryByRole('button', { name: 'Add Rule' })).not.toBeInTheDocument();
  });

  it('a placeholder card\'s own operator is editable via setPlaceholderLogicOperator, not updateGroupOperator', async () => {
    const user = userEvent.setup();
    const setPlaceholderLogicOperator = jest.fn();
    const updateGroupOperator = jest.fn();
    render(
      <MockCompetencyAssociationsProvider
        value={{
          index,
          systemDefaultProfile,
          focus: { groupId: null, ruleKey: null },
          placeholder: { parentRuleGroupId: 1, logicOperator: 'AND', rulePayload: null },
          setPlaceholderLogicOperator,
          updateGroupOperator,
        }}
      >
        <CriteriaGroupBox subsectionNamesByUsageKey={{}} canEdit />
      </MockCompetencyAssociationsProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'all' }));
    await user.click(screen.getByText('any'));

    expect(setPlaceholderLogicOperator).toHaveBeenCalledWith('OR');
    expect(updateGroupOperator).not.toHaveBeenCalled();
  });

  describe('delete control', () => {
    it('calls deleteGroup with its own id when the trash button is clicked', async () => {
      const user = userEvent.setup();
      const deleteGroup = jest.fn();
      renderBox({ deleteGroup });

      await user.click(screen.getByRole('button', { name: 'Delete rule group' }));

      expect(deleteGroup).toHaveBeenCalledWith(10);
    });

    it('does not focus the group when its trash button is clicked', async () => {
      const user = userEvent.setup();
      const deleteGroup = jest.fn();
      const focusGroup = jest.fn();
      renderBox({ deleteGroup, focusGroup });

      await user.click(screen.getByRole('button', { name: 'Delete rule group' }));

      expect(deleteGroup).toHaveBeenCalledTimes(1);
      expect(focusGroup).not.toHaveBeenCalled();
    });

    it('renders no trash button when canEdit is false', () => {
      renderBox({}, {}, false);

      expect(screen.queryByRole('button', { name: 'Delete rule group' })).not.toBeInTheDocument();
    });

    it('disables the trash button while a delete is in flight', () => {
      renderBox({ isDeletingGroup: true });

      expect(screen.getByRole('button', { name: 'Delete rule group' })).toBeDisabled();
    });

    it('lets the placeholder group\'s trash button discard it without calling deleteGroup', async () => {
      const user = userEvent.setup();
      const deleteGroup = jest.fn();
      const removePlaceholderGroup = jest.fn();
      render(
        <MockCompetencyAssociationsProvider
          value={{
            index,
            systemDefaultProfile,
            focus: { groupId: null, ruleKey: null },
            deleteGroup,
            removePlaceholderGroup,
          }}
        >
          <CriteriaGroupBox subsectionNamesByUsageKey={{}} canEdit />
        </MockCompetencyAssociationsProvider>,
      );

      await user.click(screen.getByRole('button', { name: 'Delete rule group' }));

      expect(removePlaceholderGroup).toHaveBeenCalledTimes(1);
      expect(deleteGroup).not.toHaveBeenCalled();
    });

    it('takes keyboard focus on its header band when a request names it, then consumes the request', () => {
      const consumeKeyboardFocusRequest = jest.fn();
      const { container } = renderBox({
        keyboardFocusRequest: { kind: 'group', groupId: 10, expand: true },
        consumeKeyboardFocusRequest,
      });

      expect(container.querySelector('.criteria-group-box__header')).toHaveFocus();
      expect(consumeKeyboardFocusRequest).toHaveBeenCalledTimes(1);
    });

    it('ignores a keyboard focus request that names another group', () => {
      const consumeKeyboardFocusRequest = jest.fn();
      const { container } = renderBox({
        keyboardFocusRequest: { kind: 'group', groupId: 99, expand: true },
        consumeKeyboardFocusRequest,
      });

      expect(container.querySelector('.criteria-group-box__header')).not.toHaveFocus();
      expect(consumeKeyboardFocusRequest).not.toHaveBeenCalled();
    });
  });
});
