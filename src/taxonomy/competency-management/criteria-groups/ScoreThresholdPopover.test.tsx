import {
  initializeMocks,
  render,
  screen,
  userEvent,
} from '@src/testUtils';
import ScoreThresholdPopover from './ScoreThresholdPopover';

const rulePayload = { op: 'gte' as const, value: 0.7, scale: 'percent' as const };

describe('<ScoreThresholdPopover />', () => {
  const onOpen = jest.fn();
  const onClose = jest.fn();
  const onSave = jest.fn();

  beforeEach(() => {
    initializeMocks();
    jest.clearAllMocks();
  });

  const renderOpen = (props = {}) =>
    render(
      <ScoreThresholdPopover
        rulePayload={rulePayload}
        isOpen
        onOpen={onOpen}
        onClose={onClose}
        onSave={onSave}
        {...props}
      />,
    );

  it('calls onOpen when the trigger is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ScoreThresholdPopover
        rulePayload={rulePayload}
        isOpen={false}
        onOpen={onOpen}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'With a score of 70% or higher' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Competency Completion Rule')).not.toBeInTheDocument();
  });

  it('shows the title, operator, focused input and buttons when open', () => {
    renderOpen();
    expect(screen.getByText('Competency Completion Rule')).toBeInTheDocument();
    expect(screen.getByText('>=')).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'Score threshold percentage' });
    expect(input).toHaveValue('70');
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('saves a changed score with the Save button and keeps the popover open', async () => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByRole('textbox', { name: 'Score threshold percentage' });
    await user.clear(input);
    await user.type(input, '85');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ op: 'gte', value: 0.85, scale: 'percent' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('saves a changed score with Enter', async () => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByRole('textbox', { name: 'Score threshold percentage' });
    await user.clear(input);
    await user.type(input, '85{Enter}');
    expect(onSave).toHaveBeenCalledWith({ op: 'gte', value: 0.85, scale: 'percent' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes without saving when the value is unchanged', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each(['', '101'])('shows the range message for "%s" and calls neither callback', async (typed) => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByRole('textbox', { name: 'Score threshold percentage' });
    await user.clear(input);
    if (typed) {
      await user.type(input, typed);
    }
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a whole number from 0 to 100.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the message from getInlineValidationMessage and calls neither callback', async () => {
    const user = userEvent.setup();
    renderOpen({ getInlineValidationMessage: () => 'Taken' });
    const input = screen.getByRole('textbox', { name: 'Score threshold percentage' });
    await user.clear(input);
    await user.type(input, '85');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Taken')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Cancel', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('starts the draft from the saved score on every open', async () => {
    const user = userEvent.setup();
    const { rerender } = renderOpen();
    const input = screen.getByRole('textbox', { name: 'Score threshold percentage' });
    await user.clear(input);
    await user.type(input, '85');
    const renderWith = (isOpen: boolean) => (
      <ScoreThresholdPopover
        rulePayload={rulePayload}
        isOpen={isOpen}
        onOpen={onOpen}
        onClose={onClose}
        onSave={onSave}
      />
    );
    rerender(renderWith(false));
    rerender(renderWith(true));
    expect(screen.getByRole('textbox', { name: 'Score threshold percentage' })).toHaveValue('70');
  });
});
