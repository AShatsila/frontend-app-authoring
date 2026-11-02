import {
  initializeMocks,
  render,
  screen,
  userEvent,
  waitFor,
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
  canEdit: boolean = true,
  boxGroup: BottomTierCompetencyCriteriaGroup = group,
) => (
  render(
    <MockCompetencyAssociationsProvider value={{ index, systemDefaultProfile, ...contextOverrides }}>
      <CriteriaGroupBox group={boxGroup} subsectionNamesByUsageKey={{}} canEdit={canEdit} />
    </MockCompetencyAssociationsProvider>,
  )
);

describe('<CriteriaGroupBox /> editing (#785, #794)', () => {
  beforeEach(() => {
    initializeMocks();
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the any/all label as plain text with no dropdown when canEdit is false', () => {
    const { container } = renderBox({}, false);

    expect(screen.getByText('all')).toBeInTheDocument();
    // The group's and the rule box's select buttons exist regardless of
    // `canEdit`; there's no `Dropdown` trigger since `canEdit` is false here.
    expect(screen.queryAllByRole('button')).toHaveLength(2);
    expect(container.querySelector('.dropdown-toggle')).not.toBeInTheDocument();
  });

  const anyGroup: BottomTierCompetencyCriteriaGroup = { ...group, logicOperator: 'OR' };

  const getToggle = (name: string) => (
    screen.getAllByRole('button', { name, hidden: true }).find((el) => el.classList.contains('dropdown-toggle'))!
  );

  const getMenuItem = (name: string) => (
    screen.getAllByRole('button', { name }).find((el) => !el.classList.contains('dropdown-toggle'))!
  );

  const chooseAll = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'any' }));
    await user.click(screen.getByRole('button', { name: 'all' }));
  };

  it('choosing all on an any group shows the confirmation and saves nothing', async () => {
    const user = userEvent.setup();
    const updateGroupOperator = jest.fn().mockResolvedValue(undefined);
    renderBox({ updateGroupOperator }, true, anyGroup);

    await chooseAll(user);

    const dialog = screen.getByRole('dialog', { name: 'Require all content in this group?' });
    expect(dialog).toHaveTextContent(
      'Learners will need to meet the score on every content item in this group, not just one.',
    );
    expect(dialog).toHaveTextContent(
      'This only affects future evaluations of Test Competency. Learners already evaluated keep the status they have.',
    );
    expect(within(dialog).getByText('Test Competency').tagName).toBe('STRONG');
    expect(getToggle('all')).toBeInTheDocument();
    expect(updateGroupOperator).not.toHaveBeenCalled();
  });

  it('confirming saves the change', async () => {
    const user = userEvent.setup();
    const updateGroupOperator = jest.fn().mockResolvedValue(undefined);
    renderBox({ updateGroupOperator }, true, anyGroup);

    await chooseAll(user);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));

    expect(updateGroupOperator).toHaveBeenCalledWith(10, 'AND');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancelling switches the dropdown back', async () => {
    const user = userEvent.setup();
    const updateGroupOperator = jest.fn().mockResolvedValue(undefined);
    renderBox({ updateGroupOperator }, true, anyGroup);

    await chooseAll(user);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(getToggle('any')).toBeInTheDocument();
    expect(updateGroupOperator).not.toHaveBeenCalled();
  });

  it.each([
    {
      current: 'OR' as const,
      from: 'any',
      to: 'all',
      title: 'Require all content in this group?',
      text: 'Learners will need to meet the score on every content item in this group, not just one.',
    },
    {
      current: 'AND' as const,
      from: 'all',
      to: 'any',
      title: 'Require any content in this group?',
      text: 'Learners will need to meet the score on just one content item in this group, not every one.',
    },
  ])('choosing $to on an $from group uses the $to wording', async ({ current, from, to, title, text }) => {
    const user = userEvent.setup();
    renderBox({}, true, { ...group, logicOperator: current });

    await user.click(screen.getByRole('button', { name: from }));
    await user.click(getMenuItem(to));

    expect(screen.getByRole('dialog', { name: title })).toHaveTextContent(text);
  });

  it('closes the confirmation when a refetch shows the pending value', async () => {
    const user = userEvent.setup();
    const { rerender } = renderBox({}, true, anyGroup);

    await chooseAll(user);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(
      <MockCompetencyAssociationsProvider value={{ index, systemDefaultProfile }}>
        <CriteriaGroupBox group={group} subsectionNamesByUsageKey={{}} canEdit />
      </MockCompetencyAssociationsProvider>,
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a reopened confirmation shows no stale error after a refetch closed it', async () => {
    const user = userEvent.setup();
    const updateGroupOperator = jest.fn().mockRejectedValue(new Error('boom'));
    const { rerender } = renderBox({ updateGroupOperator }, true, anyGroup);

    await chooseAll(user);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Couldn\'t save this change')).toBeInTheDocument();

    rerender(
      <MockCompetencyAssociationsProvider value={{ index, systemDefaultProfile, updateGroupOperator }}>
        <CriteriaGroupBox group={group} subsectionNamesByUsageKey={{}} canEdit />
      </MockCompetencyAssociationsProvider>,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(getToggle('all'));
    await user.click(getMenuItem('any'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('Couldn\'t save this change')).not.toBeInTheDocument();
  });

  it('choosing the current value does nothing', async () => {
    const user = userEvent.setup();
    const updateGroupOperator = jest.fn().mockResolvedValue(undefined);
    renderBox({ updateGroupOperator });

    await user.click(screen.getByRole('button', { name: 'all' }));
    await user.click(getMenuItem('all'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateGroupOperator).not.toHaveBeenCalled();
  });

  it.each([
    { current: 'OR' as const, from: 'any', to: 'all', stillText: 'any' },
    { current: 'AND' as const, from: 'all', to: 'any', stillText: 'all' },
  ])('a failed save on an $from group shows the failure and keeps the pending value', async ({
    current,
    from,
    to,
    stillText,
  }) => {
    const user = userEvent.setup();
    const updateGroupOperator = jest.fn().mockRejectedValue(new Error('boom'));
    renderBox({ updateGroupOperator }, true, { ...group, logicOperator: current });

    await user.click(screen.getByRole('button', { name: from }));
    await user.click(getMenuItem(to));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Couldn\'t save this change')).toBeInTheDocument();
    expect(screen.getByText(
      `The group still requires ${stillText} content. Try again, or cancel to keep it as it is.`,
    )).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(getToggle(to)).toBeInTheDocument();
  });

  it.each(['Cancel', 'Save changes'])('focus returns to the dropdown toggle after %s', async (buttonName) => {
    const user = userEvent.setup();
    const updateGroupOperator = jest.fn().mockResolvedValue(undefined);
    renderBox({ updateGroupOperator }, true, anyGroup);

    await chooseAll(user);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: buttonName }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(getToggle('any')).toHaveFocus());
  });

  it('the placeholder group changes immediately with no confirmation', async () => {
    const user = userEvent.setup();
    const setPlaceholderLogicOperator = jest.fn();
    render(
      <MockCompetencyAssociationsProvider
        value={{ index, systemDefaultProfile, setPlaceholderLogicOperator }}
      >
        <CriteriaGroupBox subsectionNamesByUsageKey={{}} canEdit />
      </MockCompetencyAssociationsProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'any' }));
    await user.click(screen.getByRole('button', { name: 'all' }));

    expect(setPlaceholderLogicOperator).toHaveBeenCalledWith('AND');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
