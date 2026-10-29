import userEvent from '@testing-library/user-event';
import {
  act,
  fireEvent,
  initializeMocks,
  render,
  screen,
  waitFor,
  within,
} from '@src/testUtils';
import { buildMockCompetencyAssociationsContextValue, MockCompetencyAssociationsProvider } from '../testHelpers';
import type {
  BottomTierCompetencyCriteriaGroup,
  CompetencyCriteriaGroupsResponse,
  CompetencyRuleProfile,
} from '../data/types';
import { RemovalTargetKind } from '@src/taxonomy/competency-management/constants';
import { buildCompetencyCriteriaGroupsIndex } from '../utils';
import CriteriaGroupBox from './CriteriaGroupBox';

const systemDefaultProfile: CompetencyRuleProfile = {
  id: 1,
  scopeType: 'system_default',
  ruleType: 'grade',
  rulePayload: { op: 'gte', value: 0.7, scale: 'percent' },
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
  groups: [group],
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

  it('renders the group\'s any/all label as plain text with no dropdown when canEdit is false', () => {
    const { container } = renderBox({}, { 'block-a': 'Subsection A' }, false);

    // The header sentence is split across sibling text nodes (plain text +
    // the any/all `<span>`), so its full text is checked via textContent
    // rather than `getByText`, which doesn't match text split across nodes.
    expect(container.querySelector('.criteria-group-box__header')).toHaveTextContent(
      'By completing all of the following',
    );
    // The group's and the rule box's select buttons exist regardless of
    // `canEdit` - selecting either doesn't require edit permission; there's
    // no `Dropdown` trigger since `canEdit` is false here.
    expect(screen.queryAllByRole('button')).toHaveLength(2);
    expect(screen.getByText('Subsection A')).toBeInTheDocument();
  });

  it('calls focusGroup with its own id when the select button is clicked', () => {
    const focusGroup = jest.fn();
    const { container } = renderBox({ focusGroup });

    fireEvent.click(container.querySelector('.criteria-group-box__select-button')!);
    expect(focusGroup).toHaveBeenCalledWith(10);
  });

  it('shows aria-current false on both select buttons when nothing is focused', () => {
    const { container } = renderBox();
    const groupSelectButton = container.querySelector('.criteria-group-box__select-button')!;
    const ruleBoxSelectButton = container.querySelector('.rule-box__select-button')!;
    expect([groupSelectButton, ruleBoxSelectButton].map((el) => el.getAttribute('aria-current')))
      .toEqual(['false', 'false']);
  });

  it(
    'shows aria-current true on the group\'s select button and false on the rule box\'s when the group is '
      + 'focused with no rule box focused',
    () => {
      const { container } = renderBox({ focus: { groupId: 10, ruleKey: null } });
      const groupSelectButton = container.querySelector('.criteria-group-box__select-button')!;
      const ruleBoxSelectButton = container.querySelector('.rule-box__select-button')!;
      expect([groupSelectButton, ruleBoxSelectButton].map((el) => el.getAttribute('aria-current')))
        .toEqual(['true', 'false']);
    },
  );

  it('never nests an element with role button inside another', () => {
    renderBox();

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => {
      expect(within(button).queryByRole('button')).not.toBeInTheDocument();
    });
  });

  it('clicking a rule box\'s own select button focuses only the rule box, not also the group', () => {
    const focusGroup = jest.fn();
    const focusRuleBox = jest.fn();
    const { container } = renderBox({ focusGroup, focusRuleBox });

    fireEvent.click(container.querySelector('.rule-box__select-button')!);

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

  describe('group menu', () => {
    const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('button', { name: 'More actions for this group' }));
    };

    it('requests its own removal, without focusing the group, when Remove group is chosen', async () => {
      const user = userEvent.setup();
      const requestRemoval = jest.fn();
      const focusGroup = jest.fn();
      renderBox({ requestRemoval, focusGroup });

      await openMenu(user);
      await user.click(screen.getByRole('button', { name: 'Remove group' }));

      expect(requestRemoval).toHaveBeenCalledTimes(1);
      expect(requestRemoval).toHaveBeenCalledWith({ kind: RemovalTargetKind.RuleGroup, groupId: 10 });
      expect(focusGroup).not.toHaveBeenCalled();
    });

    it('renders no menu when canEdit is false', () => {
      renderBox({}, {}, false);

      expect(screen.queryByRole('button', { name: 'More actions for this group' })).not.toBeInTheDocument();
    });

    it('disables the menu button while a delete is in flight', () => {
      renderBox({ isDeleting: true });

      expect(screen.getByRole('button', { name: 'More actions for this group' })).toBeDisabled();
    });

    it('lets the placeholder group\'s menu discard it without requesting a removal', async () => {
      const user = userEvent.setup();
      const requestRemoval = jest.fn();
      const removePlaceholderGroup = jest.fn();
      render(
        <MockCompetencyAssociationsProvider
          value={{
            index,
            systemDefaultProfile,
            focus: { groupId: null, ruleKey: null },
            requestRemoval,
            removePlaceholderGroup,
          }}
        >
          <CriteriaGroupBox subsectionNamesByUsageKey={{}} canEdit />
        </MockCompetencyAssociationsProvider>,
      );

      await openMenu(user);
      await user.click(screen.getByRole('button', { name: 'Remove group' }));

      expect(removePlaceholderGroup).toHaveBeenCalledTimes(1);
      expect(requestRemoval).not.toHaveBeenCalled();
    });

    it('gives the placeholder group\'s own rule box no menu, since the group\'s menu removes both', () => {
      render(
        <MockCompetencyAssociationsProvider
          value={{ index, systemDefaultProfile, focus: { groupId: null, ruleKey: null } }}
        >
          <CriteriaGroupBox subsectionNamesByUsageKey={{}} canEdit />
        </MockCompetencyAssociationsProvider>,
      );

      expect(screen.getByText('Select content below to add it here.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'More actions for this group' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /More actions for the (rule|new rule)/ })).not.toBeInTheDocument();
    });

    it('takes keyboard focus on its select button when a request names it, then consumes the request', async () => {
      const consumeKeyboardFocusRequest = jest.fn();
      renderBox({
        keyboardFocusRequest: { kind: 'group', groupId: 10, expand: true },
        consumeKeyboardFocusRequest,
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'By completing all of the following' })).toHaveFocus();
      });
      expect(consumeKeyboardFocusRequest).toHaveBeenCalledTimes(1);
    });

    it('leaves focus in a text field, and still consumes the request', async () => {
      const user = userEvent.setup();
      const consumeKeyboardFocusRequest = jest.fn();
      const { rerender } = renderBox();
      await user.click(screen.getByRole('textbox'));

      rerender(
        <MockCompetencyAssociationsProvider
          value={{
            index,
            systemDefaultProfile,
            keyboardFocusRequest: { kind: 'group', groupId: 10, expand: true },
            consumeKeyboardFocusRequest,
          }}
        >
          <CriteriaGroupBox group={group} subsectionNamesByUsageKey={{}} canEdit />
        </MockCompetencyAssociationsProvider>,
      );

      await act(async () => {});
      expect(screen.getByRole('textbox')).toHaveFocus();
      expect(consumeKeyboardFocusRequest).toHaveBeenCalledTimes(1);
    });

    it('ignores a keyboard focus request that names another group', async () => {
      const consumeKeyboardFocusRequest = jest.fn();
      renderBox({
        keyboardFocusRequest: { kind: 'group', groupId: 99, expand: true },
        consumeKeyboardFocusRequest,
      });

      await act(async () => {});
      expect(screen.getByRole('button', { name: 'By completing all of the following' })).not.toHaveFocus();
      expect(consumeKeyboardFocusRequest).not.toHaveBeenCalled();
    });
  });
});
