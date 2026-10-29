import type { UseQueryResult } from '@tanstack/react-query';
import {
  initializeMocks,
  render,
  screen,
  within,
} from '@src/testUtils';
import {
  buildMockCompetencyAssociationsContextValue,
  byTextContent,
  MockCompetencyAssociationsProvider,
} from '../testHelpers';
import type { CompetencyCriteriaGroupsResponse, CompetencyRuleProfile } from '../data/types';
import { buildCompetencyCriteriaGroupsIndex } from '../utils';
import CourseGroupList from './CourseGroupList';

const systemDefaultProfile: CompetencyRuleProfile = {
  id: 1,
  scopeType: 'system_default',
  ruleType: 'grade',
  rulePayload: { op: 'gte', value: 0.7, scale: 'percent' },
  archived: false,
};

const emptyGroupsResponse: CompetencyCriteriaGroupsResponse = {
  groups: [],
  criteria: [],
  criteriaCount: 0,
  totalCriteriaCount: 0,
};

const populatedGroupsResponse: CompetencyCriteriaGroupsResponse = {
  groups: [
    {
      id: 100,
      parentId: null,
      tagId: 42,
      courseKey: null,
      name: 'root',
      ordering: 0,
      logicOperator: 'AND',
      archived: false,
    },
    {
      id: 1,
      parentId: 100,
      tagId: 42,
      courseKey: 'course-v1:OrgX+CS101+2024',
      name: 'course',
      ordering: 0,
      logicOperator: 'AND',
      archived: false,
    },
  ],
  criteria: [],
  criteriaCount: 0,
  totalCriteriaCount: 0,
};

const buildQueryResult = <T,>(overrides: Partial<UseQueryResult<T>>): UseQueryResult<T> => ({
  isPending: false,
  isLoading: false,
  isError: false,
  data: undefined,
  ...overrides,
} as UseQueryResult<T>);

const loadingGroupsQuery = buildQueryResult<CompetencyCriteriaGroupsResponse>({ isPending: true, isLoading: true });
/** Disabled until the course list reports its keys: pending, but not loading, since nothing is fetching. */
const awaitingCourseKeysGroupsQuery = buildQueryResult<CompetencyCriteriaGroupsResponse>({
  isPending: true,
  isLoading: false,
  fetchStatus: 'idle',
});
const loadedEmptyGroupsQuery = buildQueryResult<CompetencyCriteriaGroupsResponse>({ data: emptyGroupsResponse });
const loadedPopulatedGroupsQuery = buildQueryResult<CompetencyCriteriaGroupsResponse>({
  data: populatedGroupsResponse,
});
const erroredGroupsQuery = buildQueryResult<CompetencyCriteriaGroupsResponse>({ isError: true });

const loadingProfileQuery = buildQueryResult<CompetencyRuleProfile>({ isPending: true, isLoading: true });
const loadedProfileQuery = buildQueryResult<CompetencyRuleProfile>({ data: systemDefaultProfile });
const erroredProfileQuery = buildQueryResult<CompetencyRuleProfile>({ isError: true });

const renderList = (contextOverrides: Parameters<typeof buildMockCompetencyAssociationsContextValue>[0] = {}) => (
  render(
    <MockCompetencyAssociationsProvider value={contextOverrides}>
      <CourseGroupList />
    </MockCompetencyAssociationsProvider>,
  )
);

describe('<CourseGroupList />', () => {
  beforeEach(() => {
    initializeMocks();
  });

  it('renders a loading state while the groups query is still loading', () => {
    renderList({ groupsQuery: loadingGroupsQuery, profileQuery: loadedProfileQuery });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders a loading state, not the empty state, while the groups query waits for course keys', () => {
    renderList({ groupsQuery: awaitingCourseKeysGroupsQuery, profileQuery: loadedProfileQuery });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(byTextContent('No content associated with Test Competency yet.'))).not
      .toBeInTheDocument();
  });

  it('renders a loading state while the default-rule-profile query is still loading, even if groups already loaded', () => {
    renderList({ groupsQuery: loadedEmptyGroupsQuery, profileQuery: loadingProfileQuery });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders a loading state, not the empty state, while course outlines are still loading', () => {
    renderList({
      groupsQuery: loadedPopulatedGroupsQuery,
      profileQuery: loadedProfileQuery,
      index: buildCompetencyCriteriaGroupsIndex(populatedGroupsResponse),
      systemDefaultProfile,
      accessibleCourseGroups: [],
      areCourseOutlinesLoading: true,
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(byTextContent('No content associated with Test Competency yet.'))).not
      .toBeInTheDocument();
  });

  it('renders a failed state when the groups query errors', () => {
    renderList({ groupsQuery: erroredGroupsQuery, profileQuery: loadedProfileQuery });
    expect(screen.getByText('There was a problem loading this competency\'s associations. Please try again.'))
      .toBeInTheDocument();
  });

  it('renders no "+ Rule"/"+ Rule Group" add control on a failed load', () => {
    renderList({ groupsQuery: erroredGroupsQuery, profileQuery: loadedProfileQuery });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a failed state when the default-rule-profile query errors, even if groups already loaded', () => {
    renderList({
      groupsQuery: loadedEmptyGroupsQuery,
      profileQuery: erroredProfileQuery,
      index: buildCompetencyCriteriaGroupsIndex(emptyGroupsResponse),
    });
    expect(screen.getByText('There was a problem loading this competency\'s associations. Please try again.'))
      .toBeInTheDocument();
  });

  it('renders the empty state when accessibleCourseGroups is empty, not throwing', () => {
    renderList({
      groupsQuery: loadedEmptyGroupsQuery,
      profileQuery: loadedProfileQuery,
      index: buildCompetencyCriteriaGroupsIndex(emptyGroupsResponse),
      systemDefaultProfile,
      accessibleCourseGroups: [],
    });
    expect(screen.getByText(byTextContent('No content associated with Test Competency yet.'))).toBeInTheDocument();
    expect(screen.getByText('Make content selections to create competency criteria associations.'))
      .toBeInTheDocument();
  });

  it(
    'renders the empty state when every course-level group is inaccessible, even though the raw '
      + 'groups response has one - accessibleCourseGroups decides this, not the raw response\'s own count',
    () => {
      renderList({
        groupsQuery: loadedPopulatedGroupsQuery,
        profileQuery: loadedProfileQuery,
        index: buildCompetencyCriteriaGroupsIndex(populatedGroupsResponse),
        systemDefaultProfile,
        // The one course-level group didn't pass the outline-accessibility
        // check, so it must render identically to no associations at all.
        accessibleCourseGroups: [],
      });
      expect(screen.getByText(byTextContent('No content associated with Test Competency yet.'))).toBeInTheDocument();
    },
  );

  it('takes keyboard focus on the empty state once course outlines load, when a request was waiting', () => {
    const consumeKeyboardFocusRequest = jest.fn();
    const value = {
      groupsQuery: loadedEmptyGroupsQuery,
      profileQuery: loadedProfileQuery,
      index: buildCompetencyCriteriaGroupsIndex(emptyGroupsResponse),
      systemDefaultProfile,
      accessibleCourseGroups: [],
      keyboardFocusRequest: { kind: 'empty' } as const,
      consumeKeyboardFocusRequest,
    };
    const { rerender } = render(
      <MockCompetencyAssociationsProvider value={{ ...value, areCourseOutlinesLoading: true }}>
        <CourseGroupList />
      </MockCompetencyAssociationsProvider>,
    );
    expect(consumeKeyboardFocusRequest).not.toHaveBeenCalled();

    rerender(
      <MockCompetencyAssociationsProvider value={{ ...value, areCourseOutlinesLoading: false }}>
        <CourseGroupList />
      </MockCompetencyAssociationsProvider>,
    );

    expect(screen.getByText(byTextContent('No content associated with Test Competency yet.')).parentElement)
      .toHaveFocus();
    expect(consumeKeyboardFocusRequest).toHaveBeenCalledTimes(1);
  });

  it('renders the accessible course group sections without waiting on other courses\' outlines', async () => {
    const index = buildCompetencyCriteriaGroupsIndex(populatedGroupsResponse);
    renderList({
      groupsQuery: loadedPopulatedGroupsQuery,
      profileQuery: loadedProfileQuery,
      index,
      systemDefaultProfile,
      accessibleCourseGroups: index.courseGroups,
      areCourseOutlinesLoading: true,
    });
    expect(await screen.findByText('course-v1:OrgX+CS101+2024')).toBeInTheDocument();
  });

  it('renders course group sections for every accessible course-level group', async () => {
    const index = buildCompetencyCriteriaGroupsIndex(populatedGroupsResponse);
    renderList({
      groupsQuery: loadedPopulatedGroupsQuery,
      profileQuery: loadedProfileQuery,
      index,
      systemDefaultProfile,
      accessibleCourseGroups: index.courseGroups,
    });
    expect(screen.queryByText(byTextContent('No content associated with Test Competency yet.'))).not
      .toBeInTheDocument();
    // The outline isn't mocked here, so it degrades to the raw course id via
    // its defensive fallback - enough to prove a real `CourseGroupSection`
    // was mounted.
    expect(await screen.findByText('course-v1:OrgX+CS101+2024')).toBeInTheDocument();
  });

  it('takes keyboard focus on the empty state when a request asks for it, then consumes the request', () => {
    const consumeKeyboardFocusRequest = jest.fn();
    renderList({
      groupsQuery: loadedEmptyGroupsQuery,
      profileQuery: loadedProfileQuery,
      index: buildCompetencyCriteriaGroupsIndex(emptyGroupsResponse),
      systemDefaultProfile,
      accessibleCourseGroups: [],
      keyboardFocusRequest: { kind: 'empty' },
      consumeKeyboardFocusRequest,
    });

    expect(screen.getByText(byTextContent('No content associated with Test Competency yet.')).parentElement)
      .toHaveFocus();
    expect(consumeKeyboardFocusRequest).toHaveBeenCalledTimes(1);
  });

  it('leaves the empty state unfocused without a request', () => {
    renderList({
      groupsQuery: loadedEmptyGroupsQuery,
      profileQuery: loadedProfileQuery,
      index: buildCompetencyCriteriaGroupsIndex(emptyGroupsResponse),
      systemDefaultProfile,
      accessibleCourseGroups: [],
    });

    expect(screen.getByText(byTextContent('No content associated with Test Competency yet.')).parentElement).not
      .toHaveFocus();
  });

  describe('the empty state when no associations are in the listed courses', () => {
    const noAssociationsMessage = 'No content associated with Test Competency yet.';
    const noAssociationsPromptMessage = 'Make content selections to create competency criteria associations.';
    const outOfViewMessage = 'No content associated with Test Competency in the courses listed here.';

    /** Only the counts decide the message, so the empty arrays here needn't agree with them. */
    const buildCountsResponse = (criteriaCount: number, totalCriteriaCount: number) => ({
      ...emptyGroupsResponse,
      criteriaCount,
      totalCriteriaCount,
    });

    const renderEmptyList = (
      data: CompetencyCriteriaGroupsResponse,
      overrides: Parameters<typeof buildMockCompetencyAssociationsContextValue>[0] = {},
    ) =>
      renderList({
        groupsQuery: buildQueryResult<CompetencyCriteriaGroupsResponse>({ data }),
        profileQuery: loadedProfileQuery,
        index: buildCompetencyCriteriaGroupsIndex(data),
        systemDefaultProfile,
        accessibleCourseGroups: [],
        ...overrides,
      });

    it('says "no content associated" only when the competency has no associations anywhere', () => {
      renderEmptyList(buildCountsResponse(0, 0));
      const firstLine = screen.getByText(byTextContent(noAssociationsMessage));
      expect(firstLine).toBeInTheDocument();
      expect(within(firstLine).getByText('Test Competency', { selector: 'strong' })).toBeInTheDocument();
      expect(screen.getByText(noAssociationsPromptMessage)).toBeInTheDocument();
    });

    it.each([
      // Some of the competency's criteria are in courses not listed.
      { criteriaCount: 0, totalCriteriaCount: 1 },
      { criteriaCount: 1, totalCriteriaCount: 3 },
      // The listed courses hold every criterion, but none of those courses is accessible.
      { criteriaCount: 2, totalCriteriaCount: 2 },
    ])(
      'says none are in the listed courses, never "no content associated", when $criteriaCount of '
        + '$totalCriteriaCount associations are in them',
      ({ criteriaCount, totalCriteriaCount }) => {
        renderEmptyList(buildCountsResponse(criteriaCount, totalCriteriaCount));
        const firstLine = screen.getByText(byTextContent(outOfViewMessage));
        expect(firstLine).toBeInTheDocument();
        expect(within(firstLine).getByText('Test Competency', { selector: 'strong' })).toBeInTheDocument();
        expect(screen.getByText(noAssociationsPromptMessage)).toBeInTheDocument();
        expect(screen.queryByText(byTextContent(noAssociationsMessage))).not.toBeInTheDocument();
      },
    );

    it.each([
      { state: 'the groups query is pending', overrides: { groupsQuery: loadingGroupsQuery } },
      { state: 'the groups query waits for course keys', overrides: { groupsQuery: awaitingCourseKeysGroupsQuery } },
      { state: 'the default-rule-profile query is pending', overrides: { profileQuery: loadingProfileQuery } },
      { state: 'course outlines are loading', overrides: { areCourseOutlinesLoading: true } },
      { state: 'the groups query errored', overrides: { groupsQuery: erroredGroupsQuery } },
      { state: 'the default-rule-profile query errored', overrides: { profileQuery: erroredProfileQuery } },
    ])('shows no empty state while $state', ({ overrides }) => {
      renderEmptyList(buildCountsResponse(1, 3), overrides);
      expect(screen.queryByText(byTextContent(noAssociationsMessage))).not.toBeInTheDocument();
      expect(screen.queryByText(byTextContent(outOfViewMessage))).not.toBeInTheDocument();
      expect(screen.queryByText(noAssociationsPromptMessage)).not.toBeInTheDocument();
    });
  });
});
