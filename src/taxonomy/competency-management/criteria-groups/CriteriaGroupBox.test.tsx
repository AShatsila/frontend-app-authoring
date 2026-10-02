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
      // The group container no longer owns this scroll - its own
      // placeholder `RuleBox` (always rendered whenever this group is
      // focused with `ruleKey: null`) scrolls itself in instead, the more
      // specific/innermost target, the same convention a real focused rule
      // box already follows.
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    },
  );

  it('does not scroll the group container when a rule box within it is the focused one', () => {
    renderBox({ focus: { groupId: 10, ruleKey: 'grade:gte:0.7:percent' } });

    // The rule box itself still scrolls (it's the innermost focused
    // element), but the group container must not also call it a second time.
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('"+ Rule" on a non-focused card starts a placeholder rule box in that card\'s own group', () => {
    const addPlaceholderRuleBox = jest.fn();
    renderBox({ addPlaceholderRuleBox });

    fireEvent.click(screen.getByRole('button', { name: 'Rule' }));

    expect(addPlaceholderRuleBox).toHaveBeenCalledWith(10);
  });

  it('disables "+ Rule" with a tooltip while a placeholder already exists elsewhere', async () => {
    const user = userEvent.setup();
    renderBox({ hasPlaceholder: true });

    const addRuleButton = screen.getByRole('button', { name: 'Rule' });
    expect(addRuleButton).toBeDisabled();

    // A disabled `Button` itself fires no hover/focus events, so the
    // tooltip is reached via its focusable wrapper `<span>` instead (see
    // `AddControl.tsx`).
    await user.hover(addRuleButton.closest('.add-control__button-wrapper')!);
    expect(await screen.findByText('Fill in the empty box before adding another.')).toBeInTheDocument();
  });

  it('hides "+ Rule" entirely when canEdit is false', () => {
    renderBox({}, {}, false);
    expect(screen.queryByRole('button', { name: 'Rule' })).not.toBeInTheDocument();
  });

  it('a placeholder card\'s own operator is editable via setPlaceholderLogicOperator, not updateGroupOperator', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'all' }));
    fireEvent.click(screen.getByText('any'));

    expect(setPlaceholderLogicOperator).toHaveBeenCalledWith('OR');
    expect(updateGroupOperator).not.toHaveBeenCalled();
  });
});
