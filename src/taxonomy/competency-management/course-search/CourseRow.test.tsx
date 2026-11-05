import { buildOutlineIndex } from '@src/course-outline/__mocks__';
import { getCourseOutlineIndexApiUrl } from '@src/course-outline/data';
import type { Course } from '@src/studio-home/data/api';
import {
  initializeMocks,
  render,
  screen,
  userEvent,
} from '@src/testUtils';
import { MockCompetencyAssociationsProvider, type MockCompetencyAssociationsOverrides } from '../__mocks__';
import CourseRow from './CourseRow';

let axiosMock: ReturnType<typeof initializeMocks>['axiosMock'];

const course: Course = {
  courseKey: 'course-v1:OrgX+CS101+2024',
  displayName: 'Intro to Testing',
  lmsLink: null,
  number: 'CS101',
  org: 'OrgX',
  rerunLink: null,
  run: '2024',
  url: '/course/course-v1:OrgX+CS101+2024',
};

const outlineApiUrl = getCourseOutlineIndexApiUrl(course.courseKey);
const archivedMessage = /This course's rules for this competency were archived/;

const outline = buildOutlineIndex({
  sections: [
    {
      id: 'section-1',
      displayName: 'Section 1',
      children: [
        { id: 'sub-1a', displayName: 'Subsection 1A', overrides: { graded: true } },
      ],
    },
  ],
});

const outlineRequests = () => axiosMock.history.get.filter((req) => req.url === outlineApiUrl);

const buildRow = (contextValue: MockCompetencyAssociationsOverrides = {}) => (
  <MockCompetencyAssociationsProvider value={contextValue}>
    <CourseRow course={course} />
  </MockCompetencyAssociationsProvider>
);

const renderRow = (contextValue: MockCompetencyAssociationsOverrides = {}) => render(buildRow(contextValue));

describe('<CourseRow />', () => {
  beforeEach(() => {
    ({ axiosMock } = initializeMocks());
    axiosMock.onGet(outlineApiUrl).reply(200, outline);
  });

  it('shows the archived message, and requests no outline, when the course group is archived', async () => {
    const user = userEvent.setup();
    renderRow({ isCourseGroupArchived: (courseId) => courseId === course.courseKey });

    await user.click(screen.getByRole('button', { name: 'Expand' }));

    const message = screen.getByText(archivedMessage);
    expect(message).toHaveTextContent(
      'This course\'s rules for this competency were archived, so no new competency criteria associations can be '
        + 'added. This applies only to this course run. Learners\' recorded progress is kept.',
    );
    expect(message).not.toHaveAttribute('role');
    expect(message).not.toHaveAttribute('aria-live');
    expect(screen.queryByText('Section 1')).not.toBeInTheDocument();
    expect(outlineRequests()).toHaveLength(0);
  });

  it('shows the archived message again after collapsing and expanding', async () => {
    const user = userEvent.setup();
    renderRow({ isCourseGroupArchived: (courseId) => courseId === course.courseKey });

    await user.click(screen.getByRole('button', { name: 'Expand' }));
    await user.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.queryByText(archivedMessage)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand' }));

    expect(screen.getByText(archivedMessage)).toBeInTheDocument();
    expect(outlineRequests()).toHaveLength(0);
  });

  it('shows only the archived message when the user cannot edit the course and its outline would fail', async () => {
    axiosMock.onGet(outlineApiUrl).reply(500);
    const user = userEvent.setup();
    renderRow({ isCourseGroupArchived: () => true, canEditCourse: () => false });

    await user.click(screen.getByRole('button', { name: 'Expand' }));

    expect(screen.getByText(archivedMessage)).toBeInTheDocument();
    expect(outlineRequests()).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the outline with no subsection select button when the associations data failed to load', async () => {
    const user = userEvent.setup();
    renderRow({ status: 'error' });

    await user.click(screen.getByRole('button', { name: 'Expand' }));
    await screen.findByText('Section 1');
    await user.click(screen.getByRole('button', { name: 'Expand' }));

    expect(screen.getByText('Subsection 1A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Subsection 1A/ })).not.toBeInTheDocument();
    expect(screen.queryByText(archivedMessage)).not.toBeInTheDocument();
  });

  describe('focus when the outline is replaced by the archived message', () => {
    const buildRowWithOutsideButton = (contextValue: MockCompetencyAssociationsOverrides = {}) => (
      <>
        <button type="button">Outside</button>
        {buildRow(contextValue)}
      </>
    );

    const expandCourseAndFocusSectionButton = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('button', { name: 'Expand' }));
      await screen.findByText('Section 1');
      // The row's own toggle now reads "Collapse", so this is the section's.
      const sectionButton = screen.getByRole('button', { name: 'Expand' });
      sectionButton.focus();
      return sectionButton;
    };

    it('moves focus to the message when focus was inside the outline', async () => {
      const user = userEvent.setup();
      const { rerender } = render(buildRowWithOutsideButton());
      const sectionButton = await expandCourseAndFocusSectionButton(user);
      expect(sectionButton).toHaveFocus();

      rerender(buildRowWithOutsideButton({ isCourseGroupArchived: () => true }));

      expect(screen.getByText(archivedMessage)).toHaveFocus();
    });

    it.each([
      ['the row toggle', 'Collapse'],
      ['a control outside the row', 'Outside'],
    ])('leaves focus on %s', async (_label, buttonName) => {
      const user = userEvent.setup();
      const { rerender } = render(buildRowWithOutsideButton());
      await user.click(screen.getByRole('button', { name: 'Expand' }));
      await screen.findByText('Section 1');
      const focused = screen.getByRole('button', { name: buttonName });
      focused.focus();

      rerender(buildRowWithOutsideButton({ isCourseGroupArchived: () => true }));

      expect(focused).toHaveFocus();
    });

    it('leaves focus on the body when focus blurred to nothing before the archive', async () => {
      const user = userEvent.setup();
      const { rerender } = render(buildRowWithOutsideButton());
      await expandCourseAndFocusSectionButton(user);
      (document.activeElement as HTMLElement).blur();
      expect(document.body).toHaveFocus();

      rerender(buildRowWithOutsideButton({ isCourseGroupArchived: () => true }));

      expect(screen.getByText(archivedMessage)).toBeInTheDocument();
      expect(document.body).toHaveFocus();
    });

    it('leaves focus where it moved once it has left the outline', async () => {
      const user = userEvent.setup();
      const { rerender } = render(buildRowWithOutsideButton());
      await expandCourseAndFocusSectionButton(user);
      const outside = screen.getByRole('button', { name: 'Outside' });
      outside.focus();

      rerender(buildRowWithOutsideButton({ isCourseGroupArchived: () => true }));

      expect(outside).toHaveFocus();
    });

    it('does not move focus on a later archive after an earlier one moved it', async () => {
      const user = userEvent.setup();
      const { rerender } = render(buildRowWithOutsideButton());
      await expandCourseAndFocusSectionButton(user);
      rerender(buildRowWithOutsideButton({ isCourseGroupArchived: () => true }));
      expect(screen.getByText(archivedMessage)).toHaveFocus();

      rerender(buildRowWithOutsideButton());
      await screen.findByText('Section 1');
      const outside = screen.getByRole('button', { name: 'Outside' });
      outside.focus();
      rerender(buildRowWithOutsideButton({ isCourseGroupArchived: () => true }));

      expect(screen.getByText(archivedMessage)).toBeInTheDocument();
      expect(outside).toHaveFocus();
    });
  });

  describe('while the associations data loads', () => {
    it('shows a spinner and requests no outline, then the archived message once ready and archived', async () => {
      const user = userEvent.setup();
      const { rerender } = renderRow({ status: 'pending' });

      await user.click(screen.getByRole('button', { name: 'Expand' }));
      const collapseButton = screen.getByRole('button', { name: 'Collapse' });

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByText(archivedMessage)).not.toBeInTheDocument();
      expect(outlineRequests()).toHaveLength(0);

      rerender(buildRow({ isCourseGroupArchived: () => true }));

      expect(screen.getByText(archivedMessage)).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Collapse' })).toBe(collapseButton);
      expect(outlineRequests()).toHaveLength(0);
    });

    it('shows no spinner on a collapsed row', () => {
      renderRow({ status: 'pending' });

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('mounts the outline once ready and not archived', async () => {
      const user = userEvent.setup();
      const { rerender } = renderRow({ status: 'pending' });

      await user.click(screen.getByRole('button', { name: 'Expand' }));
      const collapseButton = screen.getByRole('button', { name: 'Collapse' });
      expect(outlineRequests()).toHaveLength(0);

      rerender(buildRow());

      expect(await screen.findByText('Section 1')).toBeInTheDocument();
      expect(screen.queryByText(archivedMessage)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Collapse' })).toBe(collapseButton);
      expect(outlineRequests()).toHaveLength(1);
    });
  });
});
