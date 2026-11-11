import type { ComponentProps, ContextType } from 'react';
import {
  initializeMocks,
  render,
  waitFor,
  screen,
  userEvent,
  within,
} from '@src/testUtils';
import ContentTagsDrawer from './ContentTagsDrawer';
import messages from './messages';
import { ContentTagsDrawerSheetContext } from './common/context';
import {
  mockContentData,
  mockContentTaxonomyTagsData,
  mockTaxonomyListData,
  mockTaxonomyTagsData,
} from './data/api.mocks';
import { getContentTaxonomyTagsApiUrl } from './data/api';

const path = '/content/:contentId?/*';
const mockOnClose = jest.fn();
const mockSetBlockingSheet = jest.fn();
const mockNavigate = jest.fn();
const mockSidebarAction = jest.fn();
mockContentTaxonomyTagsData.applyMock();
mockTaxonomyListData.applyMock();
mockTaxonomyTagsData.applyMock();
mockContentData.applyMock();

const {
  stagedTagsId,
  otherTagsId,
  editableOtherTagsId,
  languageWithTagsId,
  languageWithoutTagsId,
  largeTagsId,
  emptyTagsId,
  containerTagsId,
  competencyTagsId,
  competencyOtherTagsId,
  twoCompetencyTagsId,
  untypedCompetencyTagsId,
  listUntypedCompetencyTagsId,
  conflictingTypeCompetencyTagsId,
  nestedCompetencyTagsId,
  untaggableCompetencyTagsId,
} = mockContentTaxonomyTagsData;

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@src/generic/CompetencyIcon', () => {
  const actual = jest.requireActual('@src/generic/CompetencyIcon');
  return {
    __esModule: true,
    default: (props: object) => actual.default({ ...props, 'data-icon': 'competency' }),
  };
});

jest.mock('../library-authoring/common/context/SidebarContext', () => ({
  ...jest.requireActual('../library-authoring/common/context/SidebarContext'),
  useSidebarContext: () => ({ sidebarAction: mockSidebarAction() }),
}));

type SheetContextData = ContextType<typeof ContentTagsDrawerSheetContext>;
type DrawerParams = ComponentProps<typeof ContentTagsDrawer> & Partial<SheetContextData>;

const renderDrawer = (
  contentId: string | undefined,
  drawerParams: DrawerParams = {},
  renderPath = path,
  containerId = '',
) => {
  const params: Record<string, string> = { containerId };
  if (contentId !== undefined) {
    params.contentId = contentId;
  }
  return render(
    <ContentTagsDrawerSheetContext.Provider value={drawerParams as SheetContextData}>
      <ContentTagsDrawer {...drawerParams} />
    </ContentTagsDrawerSheetContext.Provider>,
    { path: renderPath, params },
  );
};

describe('<ContentTagsDrawer />', () => {
  beforeEach(async () => {
    initializeMocks();
  });

  it('should render page and page title correctly', async () => {
    renderDrawer(stagedTagsId);
    expect(screen.getByText('Manage tags')).toBeInTheDocument();
  });

  it('shows spinner before the content data query is complete', async () => {
    renderDrawer(stagedTagsId);
    const spinner = (await screen.findAllByRole('status'))[0];
    expect(spinner.textContent).toEqual('Loading'); // Uses <Spinner />
  });

  it('shows spinner before the taxonomy tags query is complete', async () => {
    renderDrawer(stagedTagsId);
    const spinner = (await screen.findAllByRole('status'))[1];
    expect(spinner.textContent).toEqual('Loading...'); // Uses <Loading />
  });

  it('shows the content display name after the query is complete in drawer variant', async () => {
    renderDrawer('test');
    expect(await screen.findByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByText('Unit 1')).toBeInTheDocument();
    expect(await screen.findByText('Manage tags')).toBeInTheDocument();
  });

  it('shows the content display name after the query is complete in component variant', async () => {
    renderDrawer('test', { variant: 'component' });
    expect(await screen.findByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Unit 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage tags')).not.toBeInTheDocument();
  });

  it('shows content using params', async () => {
    renderDrawer(undefined, { id: 'test' });
    expect(await screen.findByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByText('Unit 1')).toBeInTheDocument();
    expect(await screen.findByText('Manage tags')).toBeInTheDocument();
  });

  it('shows the taxonomies data including tag numbers after the query is complete', async () => {
    const { container } = renderDrawer(largeTagsId);
    await screen.findByText('Taxonomy 1');
    await screen.findByText('Taxonomy 2');
    const tagCountBadges = container.getElementsByClassName('taxonomy-tags-count-chip');
    expect(tagCountBadges[0].textContent).toBe('3');
    expect(tagCountBadges[1].textContent).toBe('2');
  });

  it('should be read only on first render on drawer variant', async () => {
    renderDrawer(stagedTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit tags/i })).toBeInTheDocument();

    // Not show delete tag buttons
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();

    // Not show add a tag select
    expect(screen.queryByText(/add a tag/i)).not.toBeInTheDocument();

    // Not show cancel button
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();

    // Not show save button
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('should be read only on first render on component variant', async () => {
    renderDrawer(stagedTagsId, { variant: 'component' });
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manage tags/i })).toBeInTheDocument();

    // Not show delete tag buttons
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();

    // Not show add a tag select
    expect(screen.queryByText(/add a tag/i)).not.toBeInTheDocument();

    // Not show cancel button
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();

    // Not show save button
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('should change to edit mode when click on `Edit tags` on drawer variant', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();
    const editTagsButton = screen.getByRole('button', {
      name: /edit tags/i,
    });
    await user.click(editTagsButton);

    // Show delete tag buttons
    expect(
      screen.getAllByRole('button', {
        name: /delete/i,
      }).length,
    ).toBe(2);

    // Show add a tag select
    expect(screen.getByText(/add a tag/i)).toBeInTheDocument();

    // Show cancel button
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();

    // Show save button
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('should change to edit mode when click on `Manage tags` on component variant', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId, { variant: 'component' });
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();
    const manageTagsButton = screen.getByRole('button', {
      name: /manage tags/i,
    });
    await user.click(manageTagsButton);

    // Show delete tag buttons
    expect(
      screen.getAllByRole('button', {
        name: /delete/i,
      }).length,
    ).toBe(2);

    // Show add a tag select
    expect(screen.getByText(/add a tag/i)).toBeInTheDocument();

    // Show cancel button
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();

    // Show save button
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('should change to edit mode sidebar action is set to JumpToManageTags', async () => {
    mockSidebarAction.mockReturnValueOnce('jump-to-manage-tags');
    renderDrawer(stagedTagsId, { variant: 'component' });
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

    // Show delete tag buttons
    expect(
      screen.getAllByRole('button', {
        name: /delete/i,
      }).length,
    ).toBe(2);

    // Show add a tag select
    expect(screen.getByText(/add a tag/i)).toBeInTheDocument();

    // Show cancel button
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();

    // Show save button
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('should change to read mode when click on `Cancel` on drawer variant', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();
    const editTagsButton = screen.getByRole('button', {
      name: /edit tags/i,
    });
    await user.click(editTagsButton);

    const cancelButton = screen.getByRole('button', {
      name: /cancel/i,
    });
    await user.click(cancelButton);

    // Not show delete tag buttons
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();

    // Not show add a tag select
    expect(screen.queryByText(/add a tag/i)).not.toBeInTheDocument();

    // Not show cancel button
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();

    // Not show save button
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('should change to read mode when click on `Cancel` on component variant', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId, { variant: 'component' });
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();
    const manageTagsButton = screen.getByRole('button', {
      name: /manage tags/i,
    });
    await user.click(manageTagsButton);

    const cancelButton = screen.getByRole('button', {
      name: /cancel/i,
    });
    await user.click(cancelButton);

    // Not show delete tag buttons
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();

    // Not show add a tag select
    expect(screen.queryByText(/add a tag/i)).not.toBeInTheDocument();

    // Not show cancel button
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();

    // Not show save button
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  test.each([
    {
      variant: 'drawer' as const,
      editButton: /edit tags/i,
    },
    {
      variant: 'component' as const,
      editButton: /manage tags/i,
    },
  ])(
    'should hide "$editButton" button on $variant variant if not allowed to tag object',
    async ({ variant, editButton }) => {
      renderDrawer(stagedTagsId, { variant, readOnly: true });
      expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

      expect(screen.queryByRole('button', { name: editButton })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/add a tag/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    },
  );

  it('should test adding a content tag to the staged tags for a taxonomy', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

    // To edit mode
    const editTagsButton = screen.getByRole('button', {
      name: /edit tags/i,
    });
    await user.click(editTagsButton);

    // Click on "Add a tag" button to open dropdown
    const addTagsButton = screen.getByText(messages.collapsibleAddTagsPlaceholderText.defaultMessage);
    // Press without releasing: react-select opens its menu on mouseDown, and a full click
    // would immediately toggle it back closed.
    await user.pointer({ target: addTagsButton, keys: '[MouseLeft>]' });

    // Tag 3 should only appear in dropdown selector, (i.e. the dropdown is open, since Tag 3 is not applied)
    expect((await screen.findAllByText('Tag 3')).length).toBe(1);

    // Click to check Tag 3
    const tag3 = screen.getByText('Tag 3');
    await user.click(tag3);

    // Check that Tag 3 has been staged, i.e. there should be 2 of them on the page
    expect(screen.getAllByText('Tag 3').length).toBe(2);
  });

  it('should test removing a staged content from a taxonomy', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

    // To edit mode
    const editTagsButton = screen.getByRole('button', {
      name: /edit tags/i,
    });
    await user.click(editTagsButton);

    // Click on "Add a tag" button to open dropdown
    const addTagsButton = screen.getByText(messages.collapsibleAddTagsPlaceholderText.defaultMessage);
    // Press without releasing: react-select opens its menu on mouseDown, and a full click
    // would immediately toggle it back closed.
    await user.pointer({ target: addTagsButton, keys: '[MouseLeft>]' });

    // Tag 3 should only appear in dropdown selector, (i.e. the dropdown is open, since Tag 3 is not applied)
    expect((await screen.findAllByText('Tag 3')).length).toBe(1);

    // Click to check Tag 3
    const tag3 = screen.getByText('Tag 3');
    await user.click(tag3);

    // Check that Tag 3 has been staged, i.e. there should be 2 of them on the page
    expect(screen.getAllByText('Tag 3').length).toBe(2);

    // Click it again to unstage it and confirm that there is only one on the page
    await user.click(tag3);
    expect(screen.getAllByText('Tag 3').length).toBe(1);
  });

  it('should test clearing staged tags for a taxonomy', async () => {
    const user = userEvent.setup();
    const {
      container,
    } = renderDrawer(stagedTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

    // To edit mode
    const editTagsButton = screen.getByRole('button', {
      name: /edit tags/i,
    });
    await user.click(editTagsButton);

    // Click on "Add a tag" button to open dropdown
    const addTagsButton = screen.getByText(/add a tag/i);
    // Press without releasing: react-select opens its menu on mouseDown, and a full click
    // would immediately toggle it back closed.
    await user.pointer({ target: addTagsButton, keys: '[MouseLeft>]' });

    // Tag 3 should only appear in dropdown selector, (i.e. the dropdown is open, since Tag 3 is not applied)
    expect((await screen.findAllByText('Tag 3')).length).toBe(1);

    // Click to check Tag 3
    const tag3 = screen.getByText('Tag 3');
    await user.click(tag3);

    // Check that Tag 3 has been staged, i.e. there should be 2 of them on the page
    expect(screen.getAllByText('Tag 3').length).toBe(2);

    const dropdown = container.querySelector<HTMLElement>('#content-tags-drawer > div:nth-child(1) > div')!;
    const dropdownCancel = within(dropdown).getByRole('button', { name: /cancel/i });
    await user.click(dropdownCancel);

    // Check that there are no more Tag 3 on the page, since the staged one is cleared
    // and the dropdown has been closed
    expect(screen.queryByText('Tag 3')).not.toBeInTheDocument();
  });

  it('should test adding global staged tags and cancel', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

    // To edit mode
    const editTagsButton = screen.getByRole('button', {
      name: /edit tags/i,
    });
    await user.click(editTagsButton);

    // Click on "Add a tag" button to open dropdown
    const addTagsButton = screen.getByText(/add a tag/i);
    // Press without releasing: react-select opens its menu on mouseDown, and a full click
    // would immediately toggle it back closed.
    await user.pointer({ target: addTagsButton, keys: '[MouseLeft>]' });

    // Click to check Tag 3
    const tag3 = await screen.findByText(/tag 3/i);
    await user.click(tag3);

    // Click "Add tags" to save to global staged tags
    const addTags = screen.getByRole('button', { name: /add tags/i });
    await user.click(addTags);

    expect(screen.getByText(/tag 3/i)).toBeInTheDocument();

    // Click "Cancel"
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(screen.queryByText(/tag 3/i)).not.toBeInTheDocument();
  });

  it('should test delete fetched tags and cancel', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

    // To edit mode
    const editTagsButton = screen.getByRole('button', {
      name: /edit tags/i,
    });
    await user.click(editTagsButton);

    // Delete the tag
    const tag = await screen.findByText(/tag 2/i);
    const deleteButton = within(tag).getByRole('button', {
      name: /delete/i,
    });
    await user.click(deleteButton);

    expect(tag).not.toBeInTheDocument();

    // Click "Cancel"
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(screen.getByText(/tag 2/i)).toBeInTheDocument();
  });

  it('should test delete global staged tags and cancel', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

    // To edit mode
    const editTagsButton = screen.getByRole('button', {
      name: /edit tags/i,
    });
    await user.click(editTagsButton);

    // Click on "Add a tag" button to open dropdown
    const addTagsButton = screen.getByText(/add a tag/i);
    // Press without releasing: react-select opens its menu on mouseDown, and a full click
    // would immediately toggle it back closed.
    await user.pointer({ target: addTagsButton, keys: '[MouseLeft>]' });

    // Click to check Tag 3
    const tag3 = await screen.findByText(/tag 3/i);
    await user.click(tag3);

    // Click "Add tags" to save to global staged tags
    const addTags = screen.getByRole('button', { name: /add tags/i });
    await user.click(addTags);

    const tag = screen.getByText(/tag 3/i);
    expect(screen.getByText(/tag 3/i)).toBeInTheDocument();

    // Delete the tag
    const deleteButton = within(tag).getByRole('button', {
      name: /delete/i,
    });
    await user.click(deleteButton);

    expect(tag).not.toBeInTheDocument();

    // Click "Cancel"
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(screen.queryByText(/tag 3/i)).not.toBeInTheDocument();
  });

  it('should test add removed fetched tags and cancel', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

    // To edit mode
    const editTagsButton = screen.getByRole('button', {
      name: /edit tags/i,
    });
    await user.click(editTagsButton);

    // Delete the tag
    const tag = await screen.findByText(/tag 2/i);
    const deleteButton = within(tag).getByRole('button', {
      name: /delete/i,
    });
    await user.click(deleteButton);

    expect(tag).not.toBeInTheDocument();

    // Click on "Add a tag" button to open dropdown
    const addTagsButton = screen.getByText(/add a tag/i);
    // Press without releasing: react-select opens its menu on mouseDown, and a full click
    // would immediately toggle it back closed.
    await user.pointer({ target: addTagsButton, keys: '[MouseLeft>]' });

    // Click to check Tag 2
    const tag2 = await screen.findByText(/tag 2/i);
    await user.click(tag2);

    // Click "Add tags" to save to global staged tags
    const addTags = screen.getByRole('button', { name: /add tags/i });
    await user.click(addTags);

    expect(screen.getByText(/tag 2/i)).toBeInTheDocument();

    // Click "Cancel"
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(screen.getByText(/tag 2/i)).toBeInTheDocument();
  });

  it('should call onClose when cancel is clicked', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId, { onClose: mockOnClose });

    const cancelButton = await screen.findByRole('button', {
      name: /close/i,
    });
    expect(cancelButton).toBeInTheDocument();
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should call closeManageTagsDrawer when Escape key is pressed and no selectable box is active', async () => {
    const user = userEvent.setup();
    const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

    renderDrawer(stagedTagsId);

    await user.keyboard('{Escape}');

    expect(postMessageSpy).toHaveBeenCalledWith('closeManageTagsDrawer', '*');

    postMessageSpy.mockRestore();
  });

  it('should call `onClose` when Escape key is pressed and no selectable box is active', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId, { onClose: mockOnClose });

    await user.keyboard('{Escape}');

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should not call closeManageTagsDrawer when Escape key is pressed and a selectable box is active', async () => {
    const user = userEvent.setup();
    const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

    renderDrawer(stagedTagsId);

    // Simulate that the selectable box is open by adding an element with the data attribute
    const selectableBox = document.createElement('div');
    selectableBox.setAttribute('data-selectable-box', 'taxonomy-tags');
    document.body.appendChild(selectableBox);

    await user.keyboard('{Escape}');

    expect(postMessageSpy).not.toHaveBeenCalled();

    // Remove the added element
    document.body.removeChild(selectableBox);

    postMessageSpy.mockRestore();
  });

  it('should not call `onClose` when Escape key is pressed and a selectable box is active', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId, { onClose: mockOnClose });

    // Simulate that the selectable box is open by adding an element with the data attribute
    const selectableBox = document.createElement('div');
    selectableBox.setAttribute('data-selectable-box', 'taxonomy-tags');
    document.body.appendChild(selectableBox);

    await user.keyboard('{Escape}');

    expect(mockOnClose).not.toHaveBeenCalled();

    // Remove the added element
    document.body.removeChild(selectableBox);
  });

  it('should not call closeManageTagsDrawer when Escape key is pressed and container is blocked', async () => {
    const user = userEvent.setup();
    const postMessageSpy = jest.spyOn(window.parent, 'postMessage');
    renderDrawer(stagedTagsId, { blockingSheet: true });
    await user.keyboard('{Escape}');

    expect(postMessageSpy).not.toHaveBeenCalled();

    postMessageSpy.mockRestore();
  });

  it('should not call `onClose` when Escape key is pressed and container is blocked', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId, {
      blockingSheet: true,
      onClose: mockOnClose,
    });
    await user.keyboard('{Escape}');

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should call `setBlockingSheet` on add a tag', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId, {
      blockingSheet: true,
      setBlockingSheet: mockSetBlockingSheet,
    });
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

    expect(mockSetBlockingSheet).toHaveBeenCalledWith(false);

    // To edit mode
    const editTagsButton = screen.getByRole('button', {
      name: /edit tags/i,
    });
    await user.click(editTagsButton);

    // Click on "Add a tag" button to open dropdown
    const addTagsButton = screen.getByText(/add a tag/i);
    // Press without releasing: react-select opens its menu on mouseDown, and a full click
    // would immediately toggle it back closed.
    await user.pointer({ target: addTagsButton, keys: '[MouseLeft>]' });

    // Click to check Tag 3
    const tag3 = await screen.findByText(/tag 3/i);
    await user.click(tag3);

    // Click "Add tags" to save to global staged tags
    const addTags = screen.getByRole('button', { name: /add tags/i });
    await user.click(addTags);

    expect(mockSetBlockingSheet).toHaveBeenCalledWith(true);
  });

  it('should call `setBlockingSheet` on delete a tag', async () => {
    const user = userEvent.setup();
    renderDrawer(stagedTagsId, {
      blockingSheet: true,
      setBlockingSheet: mockSetBlockingSheet,
    });
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

    expect(mockSetBlockingSheet).toHaveBeenCalledWith(false);

    // To edit mode
    const editTagsButton = screen.getByRole('button', {
      name: /edit tags/i,
    });
    await user.click(editTagsButton);

    // Delete the tag
    const tag = screen.getByText(/tag 2/i);
    const deleteButton = within(tag).getByRole('button', {
      name: /delete/i,
    });
    await user.click(deleteButton);

    expect(mockSetBlockingSheet).toHaveBeenCalledWith(true);
  });

  it('should call `updateTags` mutation on save', async () => {
    const user = userEvent.setup();
    const { axiosMock } = initializeMocks();
    const url = getContentTaxonomyTagsApiUrl(stagedTagsId);
    axiosMock.onPut(url).reply(200);
    renderDrawer(stagedTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();
    const editTagsButton = screen.getByRole('button', {
      name: /edit tags/i,
    });
    await user.click(editTagsButton);

    const saveButton = screen.getByRole('button', {
      name: /save/i,
    });
    await user.click(saveButton);

    await waitFor(() => expect(axiosMock.history.put[0].url).toEqual(url));
  });

  [
    'lct:org:lib:unit:1',
    'lib-collection:org:lib:1',
    'lb:org:lib:html:1',
  ].forEach((containerId) => {
    it(`should invalidate children query when update child tag when containerId is ${containerId}`, async () => {
      const user = userEvent.setup();
      const newPath = '/container/:containerId/';
      const { axiosMock, queryClient } = initializeMocks();
      const mockInvalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
      const url = getContentTaxonomyTagsApiUrl(containerTagsId);
      axiosMock.onPut(url).reply(200);
      renderDrawer(containerTagsId, { id: containerTagsId }, newPath, containerId);
      expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();
      const editTagsButton = screen.getByRole('button', {
        name: /edit tags/i,
      });
      await user.click(editTagsButton);

      const saveButton = screen.getByRole('button', {
        name: /save/i,
      });
      await user.click(saveButton);

      await waitFor(() => expect(axiosMock.history.put[0].url).toEqual(url));
      expect(mockInvalidateQueries).toHaveBeenCalledTimes(5);
      expect(mockInvalidateQueries).toHaveBeenNthCalledWith(5, {
        queryKey: [
          'contentLibrary',
          'lib:org:lib',
          'content',
          'container',
          containerId,
          'children',
        ],
      });
    });
  });

  it('should taxonomies must be ordered', async () => {
    renderDrawer(largeTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

    // First, taxonomies with content sorted by count implicit
    // Later, empty taxonomies sorted by name
    const expectedOrder = [
      'Taxonomy 3', // 3 tags
      'Taxonomy 1', // 2 tags
      'Taxonomy 2', // 1 tag
      '(A) Taxonomy 5',
      '(B) Taxonomy 4',
    ];

    const taxonomies = screen.getAllByText(/.*Taxonomy.*/);
    for (let i = 0; i !== taxonomies.length; i++) {
      expect(taxonomies[i].textContent).toBe(expectedOrder[i]);
    }
  });

  it('should not show "Other tags" section', async () => {
    renderDrawer(stagedTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

    expect(screen.queryByText('Other tags')).not.toBeInTheDocument();
  });

  it('should show "Other tags" section', async () => {
    renderDrawer(otherTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();

    expect(screen.getByText('Other tags')).toBeInTheDocument();
    expect(screen.getByText('Taxonomy 2')).toBeInTheDocument();
    expect(screen.getByText('Tag 3')).toBeInTheDocument();
    expect(screen.getByText('Tag 4')).toBeInTheDocument();
  });

  it('should test delete "Other tags" and cancel', async () => {
    const user = userEvent.setup();
    renderDrawer(otherTagsId);
    expect(await screen.findByText('Taxonomy 2')).toBeInTheDocument();

    // To edit mode
    const editTagsButton = screen.getByRole('button', {
      name: /edit tags/i,
    });
    await user.click(editTagsButton);

    // Delete the tag
    const tag = screen.getByText(/tag 3/i);
    const deleteButton = within(tag).getByRole('button', {
      name: /delete/i,
    });
    await user.click(deleteButton);

    expect(tag).not.toBeInTheDocument();

    // Click "Cancel"
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(screen.getByText(/tag 3/i)).toBeInTheDocument();
  });

  it('should show tags staged on an "Other tags" taxonomy', async () => {
    const user = userEvent.setup();
    renderDrawer(editableOtherTagsId);
    expect(await screen.findByText('Other tags')).toBeInTheDocument();

    // To edit mode
    await user.click(screen.getByRole('button', { name: /edit tags/i }));

    // The second "Add a tag" select belongs to the taxonomy under "Other tags";
    // the first one belongs to the regular taxonomy rendered above it.
    const addTagsSelects = screen.getAllByText(messages.collapsibleAddTagsPlaceholderText.defaultMessage);
    expect(addTagsSelects.length).toBe(2);
    // Press without releasing: react-select opens its menu on mouseDown, and a full click
    // would immediately toggle it back closed.
    await user.pointer({ target: addTagsSelects[1], keys: '[MouseLeft>]' });

    // Stage "Tag 1" on the other taxonomy
    await user.click(await screen.findByText('Tag 1'));
    await user.click(screen.getByRole('button', { name: /add tags/i }));

    // The staged tag is merged into the other taxonomy's tags, alongside the fetched one
    expect(screen.getByText('Tag 3')).toBeInTheDocument();
    expect(screen.getByText('Tag 1')).toBeInTheDocument();
  });

  it('should show Language Taxonomy', async () => {
    renderDrawer(languageWithTagsId);
    expect(await screen.findByText('Languages')).toBeInTheDocument();
  });

  it('should hide Language Taxonomy', async () => {
    renderDrawer(languageWithoutTagsId);
    expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();
    expect(screen.queryByText('Languages')).not.toBeInTheDocument();
  });

  it('should show empty drawer message', async () => {
    const user = userEvent.setup();
    renderDrawer(emptyTagsId);
    expect(await screen.findByText(/to use tags, please or contact your administrator\./i)).toBeInTheDocument();
    const enableButton = screen.getByRole('button', {
      name: /enable a taxonomy/i,
    });
    await user.click(enableButton);
    expect(mockNavigate).toHaveBeenCalledWith('/taxonomies');
  });

  describe('competency taxonomies', () => {
    const addTagPlaceholder = messages.collapsibleAddTagsPlaceholderText.defaultMessage;

    const collapsibleOf = (taxonomyName: string) =>
      within(screen.getByText(taxonomyName).closest('.taxonomy-tags-collapsible') as HTMLElement);

    const sectionHeading = () => screen.getByText(messages.competencyTagsHeader.defaultMessage);
    const sectionOf = () => within(sectionHeading().parentElement as HTMLElement);
    const linkName = new RegExp(messages.competencyTagsLink.defaultMessage);

    const renderInEditMode = async (contentId: string, firstText: string) => {
      const user = userEvent.setup();
      renderDrawer(contentId);
      expect(await screen.findByText(firstText)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /edit tags/i }));
      return user;
    };

    it.each([
      [competencyTagsId, 'Critical Thinking', 'Inference'],
      [competencyOtherTagsId, 'Nursing Competencies', 'Triage'],
      [untypedCompetencyTagsId, 'Critical Thinking', 'Inference'],
      [listUntypedCompetencyTagsId, 'Critical Thinking', 'Inference'],
      [conflictingTypeCompetencyTagsId, 'Critical Thinking', 'Inference'],
    ])('should list a competency tag in the section without a remove control (case %#)', async (
      contentId,
      taxonomyName,
      tagName,
    ) => {
      await renderInEditMode(contentId, taxonomyName);
      expect(sectionOf().getByText(taxonomyName)).toBeInTheDocument();
      expect(sectionOf().getByText(tagName)).toBeInTheDocument();
      expect(collapsibleOf(taxonomyName).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it('should keep the remove control on ordinary tags of the same object', async () => {
      await renderInEditMode(competencyTagsId, 'Critical Thinking');
      expect(collapsibleOf('Taxonomy 1').getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it('should not offer an add control on a competency taxonomy', async () => {
      const user = await renderInEditMode(competencyTagsId, 'Critical Thinking');
      expect(collapsibleOf('Critical Thinking').queryByText(addTagPlaceholder)).not.toBeInTheDocument();
      await user.click(collapsibleOf('Taxonomy 1').getByText(addTagPlaceholder));
      expect(collapsibleOf('Taxonomy 1').getByRole('button', { name: /add tags/i })).toBeInTheDocument();
      expect(collapsibleOf('Critical Thinking').queryByRole('button', { name: /add tags/i })).not.toBeInTheDocument();
    });

    it('should hide a competency taxonomy that has no tags on the object', async () => {
      const user = await renderInEditMode(competencyTagsId, 'Critical Thinking');
      expect(screen.queryByText('Empty Competencies')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByText('Empty Competencies')).not.toBeInTheDocument();
    });

    it('should keep remove and add controls when no payload carries a taxonomy type', async () => {
      await renderInEditMode(stagedTagsId, 'Taxonomy 1');
      expect(collapsibleOf('Taxonomy 1').getAllByRole('button', { name: 'Delete' }).length).toBeGreaterThan(0);
      expect(collapsibleOf('Taxonomy 1').getByText(addTagPlaceholder)).toBeInTheDocument();
    });

    it('should never focus a competency remove control with the keyboard', async () => {
      const user = await renderInEditMode(competencyTagsId, 'Critical Thinking');
      // Tabbing walks the tab order from a given taxonomy header; an open select menu can trap focus
      // in a cycle, so each walk starts at the header of the taxonomy under test.
      const tabFrom = async (taxonomyName: string) => {
        (screen.getByText(taxonomyName).closest('.collapsible-trigger') as HTMLElement).focus();
        const focused: Element[] = [];
        for (let i = 0; i < 20; i++) {
          await user.tab();
          const active = document.activeElement;
          if (!active || active === document.body) {
            break;
          }
          focused.push(active);
        }
        return focused;
      };
      const hasDeleteButton = (elements: Element[]) =>
        elements.some((el) => el.getAttribute('aria-label') === 'Delete');

      // Proves the walk reaches remove controls where they exist.
      expect(hasDeleteButton(await tabFrom('Taxonomy 1'))).toBe(true);
      expect(hasDeleteButton(await tabFrom('Critical Thinking'))).toBe(false);
    });

    it('should not send competency taxonomies in the saved payload', async () => {
      const { axiosMock } = initializeMocks();
      const url = getContentTaxonomyTagsApiUrl(competencyTagsId);
      axiosMock.onPut(url).reply(200);
      const user = userEvent.setup();
      renderDrawer(competencyTagsId);
      expect(await screen.findByText('Critical Thinking')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /edit tags/i }));
      await user.click(collapsibleOf('Taxonomy 1').getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => expect(axiosMock.history.put).toHaveLength(1));
      const { tagsData } = JSON.parse(axiosMock.history.put[0].data);
      expect(tagsData).toEqual([{ taxonomy: 123, tags: [] }]);
      expect(tagsData.map((entry: { taxonomy: number; }) => entry.taxonomy)).not.toContain(321);
    });

    describe('competency tags section', () => {
      it('should show the heading, sentence, and link when there are competency tags', async () => {
        renderDrawer(competencyTagsId);
        expect(await screen.findByText('Critical Thinking')).toBeInTheDocument();
        expect(sectionHeading()).toBeInTheDocument();
        expect(screen.getByText(messages.competencyTagsDescription.defaultMessage)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: linkName })).toBeInTheDocument();
      });

      it('should not show the section when there are no competency tags', async () => {
        renderDrawer(stagedTagsId);
        expect(await screen.findByText('Taxonomy 1')).toBeInTheDocument();
        expect(screen.queryByText(messages.competencyTagsHeader.defaultMessage)).not.toBeInTheDocument();
        expect(screen.queryByText(messages.competencyTagsDescription.defaultMessage)).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: linkName })).not.toBeInTheDocument();
      });

      it('should render a competency taxonomy in the section and ordinary ones outside it', async () => {
        renderDrawer(competencyTagsId);
        expect(await screen.findByText('Critical Thinking')).toBeInTheDocument();
        expect(sectionOf().getByText('Critical Thinking')).toBeInTheDocument();
        expect(sectionOf().queryByText('Taxonomy 1')).not.toBeInTheDocument();
        expect(screen.getByText('Taxonomy 1')).toBeInTheDocument();
      });

      it('should render a competency taxonomy outside the taxonomy list in the section, not under Other tags', async () => {
        renderDrawer(competencyOtherTagsId);
        expect(await screen.findByText('Nursing Competencies')).toBeInTheDocument();
        expect(sectionOf().getByText('Nursing Competencies')).toBeInTheDocument();
        expect(screen.queryByText(messages.otherTagsHeader.defaultMessage)).not.toBeInTheDocument();
      });

      it('should link to the competencies of the taxonomy when there is one competency taxonomy', async () => {
        renderDrawer(competencyTagsId);
        expect(await screen.findByText('Critical Thinking')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: linkName }).getAttribute('href'))
          .toMatch(/\/taxonomy\/321\/competencies$/);
      });

      it('should link to the taxonomy list when the competency taxonomy is not in the taxonomy list', async () => {
        renderDrawer(competencyOtherTagsId);
        expect(await screen.findByText('Nursing Competencies')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: linkName }).getAttribute('href')).toMatch(/\/taxonomies$/);
      });

      it('should link to the taxonomy list when the author cannot tag with the competency taxonomy', async () => {
        renderDrawer(untaggableCompetencyTagsId);
        expect(await screen.findByText('Critical Thinking')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: linkName }).getAttribute('href')).toMatch(/\/taxonomies$/);
      });

      it('should link to the taxonomy list when the drawer is read-only and there is one competency taxonomy', async () => {
        renderDrawer(competencyTagsId, { readOnly: true });
        expect(await screen.findByText('Critical Thinking')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: linkName }).getAttribute('href')).toMatch(/\/taxonomies$/);
      });

      it('should open the link in a new tab without exposing the opener', async () => {
        renderDrawer(competencyTagsId);
        expect(await screen.findByText('Critical Thinking')).toBeInTheDocument();
        const link = screen.getByRole('link', { name: linkName });
        expect(link).toHaveAttribute('target', '_blank');
        expect(link.getAttribute('rel')).toContain('noopener');
      });

      it('should show the heading and link in the read-only drawer without edit controls', async () => {
        renderDrawer(competencyTagsId, { readOnly: true });
        expect(await screen.findByText('Critical Thinking')).toBeInTheDocument();
        expect(sectionHeading()).toBeInTheDocument();
        expect(screen.getByRole('link', { name: linkName })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /edit tags/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /manage tags/i })).not.toBeInTheDocument();
      });

      it('should link to the taxonomy list when there are several competency taxonomies', async () => {
        renderDrawer(twoCompetencyTagsId);
        expect(await screen.findByText('Problem Solving')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: linkName }).getAttribute('href')).toMatch(/\/taxonomies$/);
      });

      it('should not show the empty drawer message when only competency taxonomies exist', async () => {
        renderDrawer(twoCompetencyTagsId);
        expect(await screen.findByText('Problem Solving')).toBeInTheDocument();
        const [emptyDrawerText] = messages.emptyDrawerContent.defaultMessage.split('{link}');
        expect(screen.queryByText(emptyDrawerText, { exact: false })).not.toBeInTheDocument();
      });

      it('should show the target icon on competency tags only', async () => {
        renderDrawer(competencyTagsId);
        expect(await screen.findByText('Critical Thinking')).toBeInTheDocument();
        const icons = screen.getAllByText(messages.competencyTagIconAltText.defaultMessage);
        expect(icons).toHaveLength(1);
        expect(collapsibleOf('Critical Thinking').getByText(messages.competencyTagIconAltText.defaultMessage))
          .toBe(icons[0]);
        expect(collapsibleOf('Taxonomy 1').queryByText(messages.competencyTagIconAltText.defaultMessage))
          .not.toBeInTheDocument();
        const iconsIn = (taxonomyName: string) =>
          screen.getByText(taxonomyName).closest('.taxonomy-tags-collapsible')!.querySelectorAll(
            '[data-icon="competency"]',
          );
        expect(iconsIn('Critical Thinking').length).toBeGreaterThan(0);
        expect(iconsIn('Taxonomy 1')).toHaveLength(0);
      });

      it('should announce the competency icon once per explicit tag, not once per tree node', async () => {
        renderDrawer(nestedCompetencyTagsId);
        expect(await screen.findByText('Deduction')).toBeInTheDocument();
        expect(screen.getByText('Reasoning')).toBeInTheDocument();
        expect(screen.getByText('Logic')).toBeInTheDocument();
        expect(screen.getAllByText(messages.competencyTagIconAltText.defaultMessage)).toHaveLength(1);
      });

      it('should show the heading, sentence, and link in edit mode', async () => {
        await renderInEditMode(competencyTagsId, 'Critical Thinking');
        expect(sectionHeading()).toBeInTheDocument();
        expect(screen.getByText(messages.competencyTagsDescription.defaultMessage)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: linkName })).toBeInTheDocument();
      });

      it('should not present the section as an error or warning', async () => {
        renderDrawer(competencyTagsId);
        expect(await screen.findByText('Critical Thinking')).toBeInTheDocument();
        expect(sectionOf().queryByRole('alert')).not.toBeInTheDocument();
        expect(sectionOf().getByText('Critical Thinking')).toBeVisible();
      });
    });
  });
});
