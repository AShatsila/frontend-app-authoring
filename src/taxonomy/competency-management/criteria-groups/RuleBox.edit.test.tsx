import {
  initializeMocks,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from '@src/testUtils';
import { mockScrollIntoView, MockCompetencyAssociationsProvider, criterion, gteRule } from '../__mocks__';
import type { MockCompetencyAssociationsOverrides } from '../__mocks__';
import RuleBox from './RuleBox';

const criteria = [criterion(1, 'block-a', 10)];
const rule = { ruleType: 'grade', rulePayload: gteRule };

const renderRuleBox = (
  contextOverrides: MockCompetencyAssociationsOverrides = {},
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
  mockScrollIntoView();
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    initializeMocks();
    user = userEvent.setup();
  });

  it('renders the score as plain text, not an input, when canEdit is omitted', () => {
    renderRuleBox();

    expect(screen.getByRole('button', { name: 'With a score of 70% or higher' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  const openPopoverAndType = async (value: string) => {
    await user.click(screen.getByRole('button', { name: /70%/ }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, value);
  };

  const saveInPopover = () => user.click(screen.getByRole('button', { name: 'Save' }));

  it('Save in the score popover shows the confirmation and saves nothing', async () => {
    const updateRuleScore = jest.fn().mockResolvedValue(undefined);
    renderRuleBox({ updateRuleScore }, { canEdit: true });

    await openPopoverAndType('85');
    await saveInPopover();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Change this rule to 85% or higher?')).toBeInTheDocument();
    expect(within(dialog).getByText('1 content item')).toHaveClass('font-weight-bold');
    expect(within(dialog).getByText('Competency')).toHaveClass('font-weight-bold');
    expect(dialog).toHaveTextContent('The new score applies to the 1 content item in this rule.');
    expect(dialog).toHaveTextContent(
      'This only affects future evaluations of Competency. '
        + 'Learners already evaluated against 70% or higher keep the status they have.',
    );
    expect(updateRuleScore).not.toHaveBeenCalled();
  });

  it('confirming saves the change with the group id and every criterion id, then closes both', async () => {
    const updateRuleScore = jest.fn().mockResolvedValue(undefined);
    renderRuleBox({ updateRuleScore }, { canEdit: true });

    await openPopoverAndType('85');
    await saveInPopover();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));

    expect(updateRuleScore).toHaveBeenCalledWith(10, [1], { op: 'gte', value: 0.85, scale: 'percent' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Competency Completion Rule')).not.toBeInTheDocument();
  });

  it('cancelling keeps the edit in the popover and saves nothing', async () => {
    const updateRuleScore = jest.fn().mockResolvedValue(undefined);
    renderRuleBox({ updateRuleScore }, { canEdit: true });

    await openPopoverAndType('85');
    await saveInPopover();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox')).toHaveValue('85');
    expect(updateRuleScore).not.toHaveBeenCalled();
  });

  it('keeps the popover open while the confirmation is open', async () => {
    renderRuleBox({}, { canEdit: true });

    await openPopoverAndType('85');
    await saveInPopover();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Competency Completion Rule')).toBeInTheDocument();
  });

  it('shows the failure and keeps the edit when the save is rejected', async () => {
    const updateRuleScore = jest.fn().mockRejectedValue(new Error('boom'));
    renderRuleBox({ updateRuleScore }, { canEdit: true });

    await openPopoverAndType('85');
    await saveInPopover();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Couldn\'t save this change')).toBeInTheDocument();
    expect(screen.getByText('The rule is still 70% or higher. Try again, or cancel to keep editing.'))
      .toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The open dialog hides the page behind it from the accessibility tree.
    expect(screen.getByRole('textbox', { hidden: true })).toHaveValue('85');
  });

  it('blocks Save and shows the message when getInlineValidationMessage flags a duplicate', async () => {
    const updateRuleScore = jest.fn().mockResolvedValue(undefined);
    const getInlineValidationMessage = jest.fn().mockReturnValue(
      'Another rule box in this group already uses this score.',
    );
    renderRuleBox({ updateRuleScore }, { canEdit: true, getInlineValidationMessage });

    await openPopoverAndType('85');
    await saveInPopover();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateRuleScore).not.toHaveBeenCalled();
    expect(screen.getByText('Another rule box in this group already uses this score.')).toBeInTheDocument();
  });

  it('closes the popover without confirmation when Save has an unchanged score', async () => {
    const updateRuleScore = jest.fn().mockResolvedValue(undefined);
    renderRuleBox({ updateRuleScore }, { canEdit: true });

    await user.click(screen.getByRole('button', { name: /70%/ }));
    await saveInPopover();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateRuleScore).not.toHaveBeenCalled();
  });

  it('keeps the placeholder rule box editing inline, with no confirmation', async () => {
    const setPlaceholderRulePayload = jest.fn();
    renderRuleBox({ setPlaceholderRulePayload }, { canEdit: true, groupId: null, ruleKey: null });

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '85');
    await user.keyboard('{Enter}');

    expect(setPlaceholderRulePayload).toHaveBeenCalledWith({ op: 'gte', value: 0.85, scale: 'percent' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not focus the rule box when the score trigger is clicked', async () => {
    const focusRuleBox = jest.fn();
    renderRuleBox({ focusRuleBox }, { canEdit: true });

    await user.click(screen.getByRole('button', { name: /70%/ }));

    expect(focusRuleBox).not.toHaveBeenCalled();
  });

  it('focuses the rule box when its select button is clicked', async () => {
    const focusRuleBox = jest.fn();
    renderRuleBox({ focusRuleBox }, { canEdit: true });

    await user.click(screen.getByRole('button', { name: 'Select this rule' }));

    expect(focusRuleBox).toHaveBeenCalledWith(10, 'grade:gte:0.7:percent');
  });

  it('shows each chip\'s remove button only when the author can edit', () => {
    const { unmount } = renderRuleBox({}, { canEdit: true });
    expect(screen.getByRole('button', { name: 'Remove the association with Subsection A' })).toBeInTheDocument();
    unmount();

    renderRuleBox({}, { canEdit: false });
    expect(screen.queryByRole('button', { name: 'Remove the association with Subsection A' })).not.toBeInTheDocument();
  });

  it('removes the chip\'s criterion without selecting the rule box when its remove button is clicked', async () => {
    const user = userEvent.setup();
    const focusRuleBox = jest.fn();
    const removeAssociation = jest.fn();
    renderRuleBox({ focusRuleBox, removeAssociation }, { canEdit: true });

    await user.click(screen.getByRole('button', { name: 'Remove the association with Subsection A' }));

    expect(removeAssociation).toHaveBeenCalledWith(1, 'group');
    expect(focusRuleBox).not.toHaveBeenCalled();
  });
});
