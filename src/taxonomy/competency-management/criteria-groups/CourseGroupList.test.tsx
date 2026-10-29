import type { UseQueryResult } from '@tanstack/react-query';
import {
  act,
  initializeMocks,
  render,
  screen,
  waitFor,
} from '@src/testUtils';
import { buildMockCompetencyAssociationsContextValue, MockCompetencyAssociationsProvider } from '../testHelpers';
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

const emptyGroupsResponse: CompetencyCriteriaGroupsResponse = { groups: [], criteria: [] };

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
};

const buildQueryResult = <T,>(overrides: Partial<UseQueryResult<T>>): UseQueryResult<T> => ({
  isLoading: false,
  isError: false,
  data: undefined,
  ...overrides,
} as UseQueryResult<T>);

const loadingGroupsQuery = buildQueryResult<CompetencyCriteriaGroupsResponse>({ isLoading: true });
const loadedEmptyGroupsQuery = buildQueryResult<CompetencyCriteriaGroupsResponse>({ data: emptyGroupsResponse });
const loadedPopulatedGroupsQuery = buildQueryResult<CompetencyCriteriaGroupsResponse>({
  data: populatedGroupsResponse,
});
const erroredGroupsQuery = buildQueryResult<CompetencyCriteriaGroupsResponse>({ isError: true });

const loadingProfileQuery = buildQueryResult<CompetencyRuleProfile>({ isLoading: true });
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
    expect(screen.queryByText('No content associated.')).not.toBeInTheDocument();
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
    expect(screen.getByText('No content associated.')).toBeInTheDocument();
    expect(screen.getByText('Make content selections to associate this competency with course content.'))
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
      expect(screen.getByText('No content associated.')).toBeInTheDocument();
    },
  );

  it('renders course group sections for every accessible course-level group', async () => {
    const index = buildCompetencyCriteriaGroupsIndex(populatedGroupsResponse);
    renderList({
      groupsQuery: loadedPopulatedGroupsQuery,
      profileQuery: loadedProfileQuery,
      index,
      systemDefaultProfile,
      accessibleCourseGroups: index.courseGroups,
    });
    expect(screen.queryByText('No content associated.')).not.toBeInTheDocument();
    // The outline isn't mocked here, so it degrades to the raw course id via
    // its defensive fallback - enough to prove a real `CourseGroupSection`
    // was mounted.
    expect(await screen.findByText('course-v1:OrgX+CS101+2024')).toBeInTheDocument();
  });

  it('shows rule box menus only in the courses the author can edit', async () => {
    const courseA = 'course-v1:OrgX+CS101+2024';
    const courseB = 'course-v1:OrgX+CS102+2024';
    const defaultCriterion = { ruleProfileId: 1, ruleTypeOverride: null, rulePayloadOverride: null };
    const leaf = {
      tagId: 42,
      courseKey: null,
      name: 'leaf',
      ordering: 0,
      logicOperator: 'AND',
      archived: false,
    } as const;
    const twoCoursesResponse: CompetencyCriteriaGroupsResponse = {
      groups: [
        { ...populatedGroupsResponse.groups[0] },
        { ...populatedGroupsResponse.groups[1], courseKey: courseA },
        { ...populatedGroupsResponse.groups[1], id: 2, courseKey: courseB, ordering: 1 },
        { ...leaf, id: 10, parentId: 1 },
        { ...leaf, id: 20, parentId: 2 },
      ],
      criteria: [
        { ...defaultCriterion, id: 901, objectId: 'sub-a', groupId: 10 },
        { ...defaultCriterion, id: 902, objectId: 'sub-b', groupId: 20 },
      ],
    };
    const index = buildCompetencyCriteriaGroupsIndex(twoCoursesResponse);
    renderList({
      groupsQuery: buildQueryResult<CompetencyCriteriaGroupsResponse>({ data: twoCoursesResponse }),
      profileQuery: loadedProfileQuery,
      index,
      systemDefaultProfile,
      accessibleCourseGroups: index.courseGroups,
      canEditCourse: (courseId) => courseId === courseB,
    });

    expect(await screen.findByText(courseB)).toBeInTheDocument();
    expect(screen.getByText(courseA)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /More actions for the rule with a score of/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'More actions for this group' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: `More actions for ${courseB}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `More actions for ${courseA}` })).not.toBeInTheDocument();
  });

  it('takes keyboard focus on the empty state when a request asks for it, then consumes the request', async () => {
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

    await waitFor(() => expect(screen.getByText('No content associated.').parentElement).toHaveFocus());
    expect(consumeKeyboardFocusRequest).toHaveBeenCalledTimes(1);
  });

  it('leaves the empty state unfocused without a request', async () => {
    renderList({
      groupsQuery: loadedEmptyGroupsQuery,
      profileQuery: loadedProfileQuery,
      index: buildCompetencyCriteriaGroupsIndex(emptyGroupsResponse),
      systemDefaultProfile,
      accessibleCourseGroups: [],
    });

    await act(async () => {});
    expect(screen.getByText('No content associated.').parentElement).not.toHaveFocus();
  });
});
