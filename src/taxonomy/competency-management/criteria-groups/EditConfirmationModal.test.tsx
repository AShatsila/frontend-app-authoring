import { initializeMocks, render, screen, userEvent, waitFor } from '@src/testUtils';

import EditConfirmationModal from './EditConfirmationModal';

const renderModal = (overrides: Partial<React.ComponentProps<typeof EditConfirmationModal>> = {}) => {
  const props = {
    isOpen: true,
    title: 'Change the score?',
    body: <p>Body paragraph</p>,
    errorText: 'Try again later.',
    onConfirm: jest.fn().mockResolvedValue(undefined),
    onCancel: jest.fn(),
    ...overrides,
  };
  const result = render(<EditConfirmationModal {...props} />);
  return { ...result, props };
};

describe('<EditConfirmationModal />', () => {
  beforeEach(() => {
    initializeMocks();
  });

  it('renders the title, body and both buttons when open', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Change the score?' })).toBeInTheDocument();
    expect(screen.getByText('Body paragraph')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('calls onConfirm once and ignores a second click while it is pending', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn().mockReturnValue(new Promise<void>(() => {}));
    renderModal({ onConfirm });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await user.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the error alert and stays open when onConfirm rejects', async () => {
    const user = userEvent.setup();
    renderModal({ onConfirm: jest.fn().mockRejectedValue(new Error('boom')) });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn\'t save this change');
    expect(alert).toHaveTextContent('Try again later.');
    expect(screen.getByRole('dialog', { name: 'Change the score?' })).toBeInTheDocument();
  });

  it('removes the alert when a retry succeeds', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    renderModal({ onConfirm });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('calls onCancel from the Cancel button', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on Escape', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.keyboard('{Escape}');
    expect(props.onCancel).toHaveBeenCalled();
  });

  it('moves focus into the dialog when it opens', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  it('shows no alert after closing and reopening following a failure', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn().mockRejectedValue(new Error('boom'));
    const { rerender, props } = renderModal({ onConfirm });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('alert');
    rerender(<EditConfirmationModal {...props} isOpen={false} />);
    rerender(<EditConfirmationModal {...props} isOpen />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
