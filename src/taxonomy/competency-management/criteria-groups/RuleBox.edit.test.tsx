import {
  initializeMocks,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from '@src/testUtils';
import { buildMockCompetencyAssociationsContextValue, MockCompetencyAssociationsProvider } from '../testHelpers';
import type { CompetencyCriterion } from '../data/types';
import RuleBox from './RuleBox';

const criteria: CompetencyCriterion[] = [
  {
    id: 1,
    objectId: 'block-a',
    groupId: 10,
    ruleProfileId: null,
    ruleTypeOverride: 'grade',
    rulePayloadOverride: { op: 'gte', value: 0.7, scale: 'percent' },
  },
];

const rule = { ruleType: 'grade', rulePayload: { op: 'gte' as const, value: 0.7, scale: 'percent' as const } };

const render70PercentRuleBox = (
  contextOverrides: Parameters<typeof buildMockCompetencyAssociationsContextValue>[0] = {},
  props: Partial<React.ComponentProps<typeof RuleBox>> = {},
) => (
  render(
    <MockCompetencyAssociationsProvider value={contextOverrides}>
      <RuleBox
        groupId={10}
        ruleKey="grade:gte:0.7:percent"
        rule={rule}
        criteria={criteria}
        subsectionNamesByUsageKey={{ 'block-a': 'Subsection A' }}
        {...props}
      />
    </MockCompetencyAssociationsProvider>,
  )
);

describe('<RuleBox /> editing (#794)', () => {
  beforeEach(() => {
    initializeMocks();
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the score as plain text, not an input, when canEdit is omitted (default false)', () => {
    render70PercentRuleBox();

    expect(screen.getByText('70% or higher').closest('.score-threshold-field')).toHaveTextContent(
      'With a score of 70% or higher',
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  const openPopoverAndType = async (user: ReturnType<typeof userEvent.setup>, value: string) => {
    await user.click(screen.getByRole('button', { name: /70%/ }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, value);
  };

  const saveInPopover = (user: ReturnType<typeof userEvent.setup>) => (
    user.click(screen.getByRole('button', { name: 'Save' }))
  );

  it('Save in the score popover shows the confirmation and saves nothing', async () => {
    const user = userEvent.setup();
    const updateRuleScore = jest.fn().mockResolvedValue(undefined);
    render70PercentRuleBox({ updateRuleScore }, { canEdit: true });

    await openPopoverAndType(user, '85');
    await saveInPopover(user);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Change this rule to 85% or higher?')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        (_, element) =>
          element?.tagName === 'P'
          && element.textContent === 'The new score applies to the 1 content item in this rule.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('1 content item').tagName).toBe('STRONG');
    expect(within(dialog).getByText('Test Competency').tagName).toBe('STRONG');
    expect(dialog).toHaveTextContent(
      'This only affects future evaluations of Test Competency. '
        + 'Learners already evaluated against 70% or higher keep the status they have.',
    );
    expect(updateRuleScore).not.toHaveBeenCalled();
  });

  it('confirming saves the change and closes the dialog and the popover', async () => {
    const user = userEvent.setup();
    const updateRuleScore = jest.fn().mockResolvedValue(undefined);
    render70PercentRuleBox({ updateRuleScore }, { canEdit: true });

    await openPopoverAndType(user, '85');
    await saveInPopover(user);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));

    expect(updateRuleScore).toHaveBeenCalledWith(10, [1], { op: 'gte', value: 0.85, scale: 'percent' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Competency Completion Rule')).not.toBeInTheDocument();
  });

  it('cancelling keeps the edit in the popover and saves nothing', async () => {
    const user = userEvent.setup();
    const updateRuleScore = jest.fn().mockResolvedValue(undefined);
    render70PercentRuleBox({ updateRuleScore }, { canEdit: true });

    await openPopoverAndType(user, '85');
    await saveInPopover(user);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox')).toHaveValue('85');
    expect(updateRuleScore).not.toHaveBeenCalled();
  });

  it('the popover stays open while the confirmation is open', async () => {
    const user = userEvent.setup();
    render70PercentRuleBox({}, { canEdit: true });

    await openPopoverAndType(user, '85');
    await saveInPopover(user);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Competency Completion Rule')).toBeInTheDocument();
  });

  it('a failed save shows the failure and keeps the edit', async () => {
    const user = userEvent.setup();
    const updateRuleScore = jest.fn().mockRejectedValue(new Error('boom'));
    render70PercentRuleBox({ updateRuleScore }, { canEdit: true });

    await openPopoverAndType(user, '85');
    await saveInPopover(user);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Couldn\'t save this change')).toBeInTheDocument();
    expect(screen.getByText('The rule is still 70% or higher. Try again, or cancel to keep editing.'))
      .toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The open dialog hides the page behind it from the accessibility tree.
    expect(screen.getByRole('textbox', { hidden: true })).toHaveValue('85');
  });

  it('the confirmation is shown with no learner data: confirming calls only updateRuleScore', async () => {
    const user = userEvent.setup();
    const updateRuleScore = jest.fn().mockResolvedValue(undefined);
    const context = buildMockCompetencyAssociationsContextValue({ updateRuleScore });
    render70PercentRuleBox(context, { canEdit: true });

    await openPopoverAndType(user, '85');
    await saveInPopover(user);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));

    expect(updateRuleScore).toHaveBeenCalledTimes(1);
    Object.values(context).forEach((value) => {
      if (jest.isMockFunction(value) && value !== updateRuleScore) {
        expect(value).not.toHaveBeenCalled();
      }
    });
  });

  it('clicking the score trigger does not call selectRuleBox', async () => {
    const user = userEvent.setup();
    const selectRuleBox = jest.fn();
    render70PercentRuleBox({ selectRuleBox }, { canEdit: true });

    await user.click(screen.getByRole('button', { name: /70%/ }));

    expect(selectRuleBox).not.toHaveBeenCalled();
  });

  it('the placeholder rule box still edits inline with no confirmation', async () => {
    const user = userEvent.setup();
    const setPlaceholderRulePayload = jest.fn();
    render70PercentRuleBox({ setPlaceholderRulePayload }, { canEdit: true, groupId: null, ruleKey: null });

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '85');
    await user.keyboard('{Enter}');

    expect(setPlaceholderRulePayload).toHaveBeenCalledWith({ op: 'gte', value: 0.85, scale: 'percent' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows each chip\'s remove button only when the author can edit', () => {
    const { unmount } = render70PercentRuleBox({}, { canEdit: true });
    expect(screen.getByRole('button', { name: 'Remove the association with Subsection A' })).toBeInTheDocument();
    unmount();

    render70PercentRuleBox({}, { canEdit: false });
    expect(screen.queryByRole('button', { name: 'Remove the association with Subsection A' })).not.toBeInTheDocument();
  });

  it('removes the chip\'s criterion without selecting the rule box when its remove button is clicked', async () => {
    const user = userEvent.setup();
    const selectRuleBox = jest.fn();
    const removeAssociation = jest.fn();
    render70PercentRuleBox({ selectRuleBox, removeAssociation }, { canEdit: true });

    await user.click(screen.getByRole('button', { name: 'Remove the association with Subsection A' }));

    expect(removeAssociation).toHaveBeenCalledWith(1, 'group');
    expect(selectRuleBox).not.toHaveBeenCalled();
  });
});
