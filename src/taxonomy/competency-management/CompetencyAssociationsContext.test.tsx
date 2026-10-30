import { Error as ErrorIcon, InfoOutline } from '@openedx/paragon/icons';
import * as authzApi from '@src/authz/data/api';
import { mockWaffleFlags } from '@src/data/apiHooks.mock';
import { buildOutlineIndex } from '@src/course-outline/__mocks__';
import { getCourseOutlineIndexApiUrl } from '@src/course-outline/data';
import {
  act,
  fireEvent,
  initializeMocks,
  render,
  screen,
  waitFor,
} from '@src/testUtils';
import { CompetencyAssociationsProvider, useCompetencyAssociations } from './CompetencyAssociationsContext';
import { apiUrls } from './data/api';
import type { CompetencyCriteriaGroupsResponse } from './data/types';

let axiosMock: ReturnType<typeof initializeMocks>['axiosMock'];
let mockShowToast: ReturnType<typeof initializeMocks>['mockShowToast'];

const tagId = 42;
const courseA = 'course-v1:OrgX+CS101+2024';
const courseB = 'course-v1:OrgX+CS102+2024';
const courseOther = 'course-v1:OrgX+CS999+2024';

const groupsUrl = apiUrls.competencyCriteriaGroups(tagId);
const profileUrl = apiUrls.defaultCompetencyRuleProfile();
const createUrl = apiUrls.createCompetencyCriterion(tagId);
const updateGroupOperatorUrl = apiUrls.updateCompetencyCriteriaGroup(tagId, 10);
const updateRuleScoreUrl = apiUrls.updateCompetencyCriteriaRule(10);

/** `#773`'s real response envelope: a paginated list, not a single object -
 * see `CompetencyRuleProfileListResponse` in `./data/types`.
 */
const profileResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      scope_type: 'system_default',
      rule_type: 'grade',
      rule_payload: { op: 'gte', value: 0.7, scale: 'percent' },
      archived: false,
    },
  ],
};

/** The competency's root group (id 500, instance-wide, never rendered),
 * one course-level group (courseA, id 1) holding one leaf group (id 10)
 * with one criterion (`existing-sub`, no override - resolves through the
 * default profile above).
 */
const singleGroupResponse: CompetencyCriteriaGroupsResponse = {
  groups: [
    {
      id: 500,
      parentId: null,
      tagId,
      courseKey: null,
      name: 'root',
      ordering: 0,
      logicOperator: 'AND',
      archived: false,
    },
    {
      id: 1,
      parentId: 500,
      tagId,
      courseKey: courseA,
      name: 'course',
      ordering: 0,
      logicOperator: 'AND',
      archived: false,
    },
    { id: 10, parentId: 1, tagId, courseKey: null, name: 'leaf', ordering: 0, logicOperator: 'AND', archived: false },
  ],
  criteria: [
    {
      id: 900,
      objectId: 'existing-sub',
      groupId: 10,
      ruleProfileId: 1,
      ruleTypeOverride: null,
      rulePayloadOverride: null,
    },
  ],
};

/** Same course-level group, but two leaf groups (10 and 11) - so "exactly
 * one bottom-tier group" is false.
 */
const twoGroupsResponse: CompetencyCriteriaGroupsResponse = {
  groups: [
    {
      id: 500,
      parentId: null,
      tagId,
      courseKey: null,
      name: 'root',
      ordering: 0,
      logicOperator: 'AND',
      archived: false,
    },
    {
      id: 1,
      parentId: 500,
      tagId,
      courseKey: courseA,
      name: 'course',
      ordering: 0,
      logicOperator: 'AND',
      archived: false,
    },
    { id: 10, parentId: 1, tagId, courseKey: null, name: 'leaf', ordering: 0, logicOperator: 'AND', archived: false },
    { id: 11, parentId: 1, tagId, courseKey: null, name: 'leaf', ordering: 1, logicOperator: 'AND', archived: false },
  ],
  criteria: [],
};

/** Like `singleGroupResponse`, but its only box is gte 75%, so the 70% default is free. */
const uniqueDefaultResponse: CompetencyCriteriaGroupsResponse = {
  ...singleGroupResponse,
  criteria: [
    {
      id: 901,
      objectId: 'existing-sub',
      groupId: 10,
      ruleProfileId: null,
      ruleTypeOverride: 'grade',
      rulePayloadOverride: { op: 'gte', value: 0.75, scale: 'percent' },
    },
  ],
};

const noGroupsResponse: CompetencyCriteriaGroupsResponse = { groups: [], criteria: [] };

/** Two course-level groups under the same root: courseA (id 1, leaf group
 * 10) and courseB (id 2, leaf group 20) - used to prove a course whose own
 * outline fetch fails is excluded from `accessibleCourseGroups` while a
 * sibling course whose outline succeeds is not.
 */
const twoCoursesResponse: CompetencyCriteriaGroupsResponse = {
  groups: [
    {
      id: 500,
      parentId: null,
      tagId,
      courseKey: null,
      name: 'root',
      ordering: 0,
      logicOperator: 'AND',
      archived: false,
    },
    {
      id: 1,
      parentId: 500,
      tagId,
      courseKey: courseA,
      name: 'course',
      ordering: 0,
      logicOperator: 'AND',
      archived: false,
    },
    { id: 10, parentId: 1, tagId, courseKey: null, name: 'leaf', ordering: 0, logicOperator: 'AND', archived: false },
    {
      id: 2,
      parentId: 500,
      tagId,
      courseKey: courseB,
      name: 'course',
      ordering: 1,
      logicOperator: 'AND',
      archived: false,
    },
    { id: 20, parentId: 2, tagId, courseKey: null, name: 'leaf', ordering: 0, logicOperator: 'AND', archived: false },
  ],
  criteria: [],
};

/** courseA (id 1, leaf 10) and courseB (id 2) with two leaves listed out of
 * order: 21 (ordering 1, two rule boxes) and 20 (ordering 0). The last group
 * by `ordering` is 21, and its last rule box is the `eq` override.
 */
const courseBGroupsResponse: CompetencyCriteriaGroupsResponse = {
  groups: [
    ...twoCoursesResponse.groups.filter((group) => group.id !== 20),
    { id: 21, parentId: 2, tagId, courseKey: null, name: 'leaf', ordering: 1, logicOperator: 'AND', archived: false },
    { id: 20, parentId: 2, tagId, courseKey: null, name: 'leaf', ordering: 0, logicOperator: 'AND', archived: false },
  ],
  criteria: [
    { id: 910, objectId: 'b-sub-1', groupId: 21, ruleProfileId: 1, ruleTypeOverride: null, rulePayloadOverride: null },
    {
      id: 911,
      objectId: 'b-sub-2',
      groupId: 21,
      ruleProfileId: null,
      ruleTypeOverride: 'grade',
      rulePayloadOverride: { op: 'eq', value: 1, scale: 'percent' },
    },
  ],
};

/** Like `twoCoursesResponse`, but group 20 has a criterion, so selecting it yields a real rule key. */
const courseExpansionResponse: CompetencyCriteriaGroupsResponse = {
  ...twoCoursesResponse,
  criteria: [
    {
      id: 950,
      objectId: 'course-b-sub',
      groupId: 20,
      ruleProfileId: 1,
      ruleTypeOverride: null,
      rulePayloadOverride: null,
    },
  ],
};

const defaultRuleKey = 'grade:gte:0.7:percent';
const rule80Key = 'grade:gte:0.8:percent';

/** `twoGroupsResponse`'s two leaf groups, each holding one default-rule criterion. */
const twoGroupsWithCriteriaResponse: CompetencyCriteriaGroupsResponse = {
  ...twoGroupsResponse,
  criteria: [
    { id: 901, objectId: 'sub-a', groupId: 10, ruleProfileId: 1, ruleTypeOverride: null, rulePayloadOverride: null },
    { id: 902, objectId: 'sub-b', groupId: 11, ruleProfileId: 1, ruleTypeOverride: null, rulePayloadOverride: null },
  ],
};

/** `twoGroupsWithCriteriaResponse` after group 10 was deleted. */
const afterDeletingGroup10Response: CompetencyCriteriaGroupsResponse = {
  groups: twoGroupsWithCriteriaResponse.groups.filter((group) => group.id !== 10),
  criteria: twoGroupsWithCriteriaResponse.criteria.filter((criterion) => criterion.groupId !== 10),
};

/** One rule group (10) with two subsections at different grade thresholds, so it renders two rule boxes.
 * Removing one leaves the group alive with one box, which lets tests check the group survives and the selection
 * moves off the vanished box.
 */
const twoBoxesInGroupResponse: CompetencyCriteriaGroupsResponse = {
  ...singleGroupResponse,
  criteria: [
    { id: 901, objectId: 'sub-a', groupId: 10, ruleProfileId: 1, ruleTypeOverride: null, rulePayloadOverride: null },
    {
      id: 903,
      objectId: 'sub-c',
      groupId: 10,
      ruleProfileId: null,
      ruleTypeOverride: 'grade',
      rulePayloadOverride: { op: 'gte', value: 0.8, scale: 'percent' },
    },
  ],
};

/** Groups 10 and 11 each hold a criterion for the same subsection `sub-a` (ids 901 and 902). */
const sameSubsectionInTwoGroupsResponse: CompetencyCriteriaGroupsResponse = {
  ...twoGroupsResponse,
  criteria: [
    { id: 901, objectId: 'sub-a', groupId: 10, ruleProfileId: 1, ruleTypeOverride: null, rulePayloadOverride: null },
    { id: 902, objectId: 'sub-a', groupId: 11, ruleProfileId: 1, ruleTypeOverride: null, rulePayloadOverride: null },
  ],
};

/** `twoBoxesInGroupResponse` after `sub-a` was removed. */
const afterRemovingSubAResponse: CompetencyCriteriaGroupsResponse = {
  ...twoBoxesInGroupResponse,
  criteria: twoBoxesInGroupResponse.criteria.filter((criterion) => criterion.id !== 901),
};

/** Course A (group 10) and course B (group 20), each leaf holding one default-rule criterion. */
const twoCoursesWithCriteriaResponse: CompetencyCriteriaGroupsResponse = {
  ...twoCoursesResponse,
  criteria: [
    { id: 901, objectId: 'sub-a', groupId: 10, ruleProfileId: 1, ruleTypeOverride: null, rulePayloadOverride: null },
    { id: 902, objectId: 'sub-b', groupId: 20, ruleProfileId: 1, ruleTypeOverride: null, rulePayloadOverride: null },
  ],
};

const outlineFixture = buildOutlineIndex();

/** Exposes every context value/action as plain, clickable test hooks. */
const TestConsumer = () => {
  const ctx = useCompetencyAssociations();
  return (
    <div>
      <div data-testid="can-edit-course-b">{String(ctx.canEditCourse(courseB))}</div>
      <div data-testid="selection">{JSON.stringify(ctx.selection)}</div>
      <div data-testid="placeholder">{JSON.stringify(ctx.placeholder)}</div>
      <div data-testid="has-placeholder">{String(ctx.hasPlaceholder)}</div>
      <div data-testid="duplicate-rejected">{String(ctx.placeholderDuplicateRejected)}</div>
      <div data-testid="groups-status">{ctx.groupsQuery.isSuccess ? 'groups-success' : 'groups-pending'}</div>
      <div data-testid="profile-status">{ctx.profileQuery.isSuccess ? 'profile-success' : 'profile-pending'}</div>
      <div data-testid="accessible-course-group-ids">
        {ctx.accessibleCourseGroups.map((group) => group.courseKey).join(',')}
      </div>
      <button type="button" onClick={() => ctx.selectGroup(999)}>selection-999</button>
      <button type="button" onClick={() => ctx.selectGroup(10)}>selection-group-10</button>
      <button type="button" onClick={() => ctx.selectGroup(11)}>selection-group-11</button>
      <button type="button" onClick={() => ctx.selectGroup(20)}>selection-group-20</button>
      <button type="button" onClick={() => ctx.selectRuleBox(10, defaultRuleKey)}>selection-rulebox-10</button>
      <button type="button" onClick={() => ctx.addPlaceholderRuleBox(10)}>add-placeholder-rule-10</button>
      <button type="button" onClick={() => ctx.addPlaceholderGroup(1)}>add-placeholder-group-1</button>
      <button
        type="button"
        onClick={() => ctx.setPlaceholderRulePayload({ op: 'gte', value: 0.85, scale: 'percent' })}
      >
        set-placeholder-rule-payload
      </button>
      <button type="button" onClick={() => ctx.notifyCourseExpanded(courseB)}>expand-course-b</button>
      <button type="button" onClick={() => ctx.notifyCourseExpanded(courseA)}>expand-course-a</button>
      <button type="button" onClick={() => ctx.discardPlaceholder()}>discard-placeholder</button>
      <button type="button" onClick={() => ctx.associateSubsection('new-sub', courseA)}>associate-course-a</button>
      <button type="button" onClick={() => ctx.associateSubsection('new-sub', courseB)}>associate-course-b</button>
      <button
        type="button"
        onClick={() => ctx.associateSubsection('new-sub', courseOther)}
      >
        associate-other-course
      </button>
      <button
        type="button"
        onClick={() => ctx.associateSubsection('existing-sub', courseA)}
      >
        associate-duplicate
      </button>
      <div data-testid="is-deleting">{String(ctx.isDeleting)}</div>
      <div data-testid="keyboard-focus-request">{JSON.stringify(ctx.keyboardFocusRequest)}</div>
      <button type="button" onClick={() => ctx.deleteGroup(10)}>delete-group-10</button>
      <button type="button" onClick={() => ctx.deleteGroup(20)}>delete-group-20</button>
      <div data-testid="criterion-ids">{JSON.stringify(ctx.groupsQuery.data?.criteria.map((c) => c.id))}</div>
      <div data-testid="group-ids">{JSON.stringify(ctx.groupsQuery.data?.groups.map((g) => g.id))}</div>
      <button type="button" onClick={() => ctx.removeAssociation(900, 'group')}>remove-existing-sub</button>
      <button type="button" onClick={() => ctx.removeAssociation(901, 'group')}>remove-sub-a-chip</button>
      <button type="button" onClick={() => ctx.removeAssociation(902, 'group')}>remove-criterion-902</button>
      <button type="button" onClick={() => ctx.removeAssociation(901, 'subsection')}>remove-sub-a-subsection</button>
      <button type="button" onClick={() => ctx.removePlaceholderGroup()}>remove-placeholder-group</button>
      <button type="button" onClick={() => ctx.updateGroupOperator(10, 'OR')}>update-group-operator</button>
      <button
        type="button"
        onClick={() => {
          // Caught only to silence an unhandled-rejection warning; irrelevant to this consumer.
          ctx.updateRuleScore(10, [900], { op: 'gte', value: 0.8, scale: 'percent' }).catch(() => {});
        }}
      >
        update-rule-score
      </button>
    </div>
  );
};

const renderProvider = () =>
  render(
    <CompetencyAssociationsProvider tagId={tagId} competencyName="Competency" competencyExternalId="CCRS-1.3">
      <TestConsumer />
    </CompetencyAssociationsProvider>,
  );

describe('CompetencyAssociationsProvider', () => {
  beforeEach(() => {
    ({ axiosMock, mockShowToast } = initializeMocks());
  });

  describe('initial selection', () => {
    it('selects the sole bottom-tier group once the groups query and every visible course outline resolve', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":10');
      });
      expect(screen.getByTestId('selection')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
    });

    it('leaves selection unset when more than one bottom-tier group exists across visible course groups', async () => {
      axiosMock.onGet(groupsUrl).reply(200, twoGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success');
      });
      expect(screen.getByTestId('selection')).toHaveTextContent('null');
    });

    it('leaves selection unset when there are no visible course-level groups', async () => {
      axiosMock.onGet(groupsUrl).reply(200, noGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success');
      });
      expect(screen.getByTestId('selection')).toHaveTextContent('null');
    });

    it('a click beats a preceding auto-select and is not reverted once the data resolves', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();

      // Click before anything has resolved - at this point `selection` is
      // still unset and the initial-selection effect hasn't run yet.
      fireEvent.click(screen.getByText('selection-999'));
      expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":999');

      // Let the groups/profile/outline queries resolve - the sole
      // bottom-tier group (id 10) would otherwise be auto-selected.
      await waitFor(() => {
        expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success');
      });

      // The manual click's selection must survive - the auto-select effect
      // still marks itself as having run, but skips writing anything
      // because selection was no longer unset by the time its gate resolved.
      expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":999');
    });
  });

  describe('accessibleCourseGroups', () => {
    it('excludes a course-level group whose own outline fetch fails, keeping a sibling course\'s group', async () => {
      axiosMock.onGet(groupsUrl).reply(200, twoCoursesResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      // courseB's own outline fetch fails - e.g. a 403 on a course the
      // author can see via content search but can't read the outline of.
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(403);
      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('accessible-course-group-ids')).toHaveTextContent(courseA);
      });
      // Not shown with a missing/blank/placeholder name instead - it's
      // excluded entirely, never included at all.
      expect(screen.getByTestId('accessible-course-group-ids')).not.toHaveTextContent(courseB);
    });

    it('excludes every course-level group when every course fails, leaving the list empty (same as no associations at all)', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(403);
      renderProvider();

      // Wait for the outline request itself to actually complete (not just
      // for the unrelated groups query), so this doesn't pass vacuously
      // before the failure has even been processed.
      await waitFor(() => {
        expect(axiosMock.history.get.some((req) => req.url === getCourseOutlineIndexApiUrl(courseA))).toBe(true);
      });
      await waitFor(() => {
        expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success');
      });
      expect(screen.getByTestId('accessible-course-group-ids')).toHaveTextContent('');
    });

    it('does not auto-select a bottom-tier group that belongs to an inaccessible course', async () => {
      // A single course-level group with a single bottom-tier group - the
      // exact shape `'selects the sole bottom-tier group...'` above proves
      // auto-selects when the course IS accessible. Here, its own outline
      // fetch fails, so this bottom-tier group must not be eligible for
      // auto-select at all, even though it's still the *only* one in the raw
      // `#681` response - counting the raw response instead of
      // `accessibleCourseGroups` was exactly the bug this test guards
      // against.
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(403);
      renderProvider();

      // Wait for the outline request itself to actually complete first, so
      // the assertions below don't pass vacuously before the failure has
      // even been processed.
      await waitFor(() => {
        expect(axiosMock.history.get.some((req) => req.url === getCourseOutlineIndexApiUrl(courseA))).toBe(true);
      });
      await waitFor(() => {
        expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success');
      });
      expect(screen.getByTestId('accessible-course-group-ids')).toHaveTextContent('');
      expect(screen.getByTestId('selection')).toHaveTextContent('null');
    });
  });

  it(
    'does not delay initial selection when an unrelated, still-loading course is expanded via notifyCourseExpanded',
    async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      // Course B has no group for this competency, and its own outline
      // never resolves - simulates the author expanding an unrelated
      // course in the content panel below while this competency's own
      // course (courseA) is still loading. `notifyCourseExpanded` feeds
      // `canEditCourse`'s course list, not the initial-selection gate, so this
      // must have no bearing on when selection fires.
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(() => new Promise(() => {}));
      renderProvider();

      fireEvent.click(screen.getByText('expand-course-b'));

      // The sole bottom-tier group (courseA's group 10) still auto-selects
      // once courseA's own data resolves, unaffected by courseB's outline
      // never resolving.
      await waitFor(() => {
        expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":10');
      });
    },
  );

  it('keeps an expanded group-less course editable after the competency changes', async () => {
    mockWaffleFlags({ enableAuthzCourseAuthoring: true });
    // `initializeMocks` stubs `validateUserPermissions` (the permissions POST) to `{}`.
    jest.spyOn(authzApi, 'validateUserPermissions').mockResolvedValue({ [courseB]: true });
    axiosMock.onGet(apiUrls.competencyCriteriaGroups(tagId)).reply(200, noGroupsResponse);
    axiosMock.onGet(apiUrls.competencyCriteriaGroups(43)).reply(200, noGroupsResponse);
    axiosMock.onGet(profileUrl).reply(200, profileResponse);
    const ui = (id: number) => (
      <CompetencyAssociationsProvider tagId={id} competencyName="Competency" competencyExternalId="CCRS-1.3">
        <TestConsumer />
      </CompetencyAssociationsProvider>
    );
    const { rerender } = render(ui(tagId));

    fireEvent.click(screen.getByText('expand-course-b'));
    await waitFor(() => expect(screen.getByTestId('can-edit-course-b')).toHaveTextContent('true'));

    rerender(ui(43));
    await waitFor(() => {
      expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success');
    });

    expect(screen.getByTestId('can-edit-course-b')).toHaveTextContent('true');
  });

  describe('notifyCourseExpanded selection', () => {
    const renderWithCourseB = async () => {
      axiosMock.onGet(groupsUrl).reply(200, courseBGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('profile-success'));
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
    };

    it('moves selection from another course\'s group to the expanded course\'s last group and last rule box', async () => {
      await renderWithCourseB();
      fireEvent.click(screen.getByText('selection-group-10'));

      fireEvent.click(screen.getByText('expand-course-b'));
      const expected = JSON.stringify({ groupId: 21, ruleKey: 'grade:eq:1:percent' });
      expect(screen.getByTestId('selection')).toHaveTextContent(expected);

      fireEvent.click(screen.getByText('selection-group-10'));
      fireEvent.click(screen.getByText('expand-course-b'));
      expect(screen.getByTestId('selection')).toHaveTextContent(expected);
    });

    it('moves selection when nothing is selected', async () => {
      await renderWithCourseB();

      fireEvent.click(screen.getByText('expand-course-b'));

      expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":21');
    });

    it('leaves selection unchanged when the expanded course has no groups', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('profile-success'));
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
      fireEvent.click(screen.getByText('selection-group-10'));

      fireEvent.click(screen.getByText('expand-course-b'));

      expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":10');
    });

    it('leaves selection unchanged when it is already on a group of the expanded course', async () => {
      await renderWithCourseB();
      fireEvent.click(screen.getByText('selection-group-20'));
      const before = screen.getByTestId('selection').textContent;

      fireEvent.click(screen.getByText('expand-course-b'));

      expect(before).toContain('"groupId":20');
      expect(screen.getByTestId('selection')).toHaveTextContent(before as string);
    });

    it('associates a subsection of the expanded course into the group that expansion selected', async () => {
      await renderWithCourseB();
      axiosMock.onPost(createUrl).reply(201, {
        id: 920,
        group_id: 21,
        rule_profile_id: null,
        rule_type_override: 'grade',
        rule_payload_override: { op: 'eq', value: 1, scale: 'percent' },
        object_tag_id: tagId,
      });
      fireEvent.click(screen.getByText('selection-group-10'));
      fireEvent.click(screen.getByText('expand-course-b'));

      fireEvent.click(screen.getByText('associate-course-b'));

      await waitFor(() => expect(axiosMock.history.post).toHaveLength(1));
      expect(JSON.parse(axiosMock.history.post[0].data)).toEqual({
        object_id: 'new-sub',
        group_id: 21,
        rule_type_override: 'grade',
        rule_payload_override: { op: 'eq', value: 1, scale: 'percent' },
      });
    });
  });

  describe('placeholder lifecycle (#671)', () => {
    it('"+ Rule" starts a placeholder rule box in the given group, selecting it with ruleKey: null', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-rule-10'));

      expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":10');
      expect(screen.getByTestId('selection')).toHaveTextContent('"ruleKey":null');
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('true');
    });

    it('"+ Rule Group" replaces an existing placeholder rule box, since selection has only one slot', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-rule-10'));
      expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":10');

      fireEvent.click(screen.getByText('add-placeholder-group-1'));

      expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":null');
      expect(screen.getByTestId('placeholder')).toHaveTextContent('"parentRuleGroupId":1');
      expect(screen.getByTestId('placeholder')).toHaveTextContent('"logicOperator":"OR"');
    });

    it('selecting a different real group clears an existing placeholder', async () => {
      axiosMock.onGet(groupsUrl).reply(200, courseExpansionResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-rule-10'));
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('true');

      fireEvent.click(screen.getByText('selection-group-20'));

      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('false');
      expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":20');
      expect(screen.getByTestId('selection')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
    });

    it(
      'resolves a placeholder onto an expanded course\'s own last bottom-tier group, when one already exists',
      async () => {
        axiosMock.onGet(groupsUrl).reply(200, courseExpansionResponse);
        axiosMock.onGet(profileUrl).reply(200, profileResponse);
        axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
        axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(200, outlineFixture);
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

        fireEvent.click(screen.getByText('add-placeholder-rule-10'));
        expect(screen.getByTestId('selection')).toHaveTextContent('"ruleKey":null');

        fireEvent.click(screen.getByText('expand-course-b'));

        await waitFor(() => {
          expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":20');
        });
        expect(screen.getByTestId('selection')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
      },
    );

    it.each([
      ['rule box in a real group', 'add-placeholder-rule-10'],
      ['group', 'add-placeholder-group-1'],
    ])('keeps a placeholder %s when its own course is expanded', async (_label, addButton) => {
      axiosMock.onGet(groupsUrl).reply(200, courseExpansionResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText(addButton));
      const selectionBefore = screen.getByTestId('selection').textContent;
      fireEvent.click(screen.getByText('expand-course-a'));

      expect(screen.getByTestId('selection').textContent).toBe(selectionBefore);
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('true');
    });

    it('discardPlaceholder clears selection, and with it the placeholder', async () => {
      axiosMock.onGet(groupsUrl).reply(200, courseExpansionResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-group-1'));
      fireEvent.click(screen.getByText('discard-placeholder'));

      expect(screen.getByTestId('selection')).toHaveTextContent('null');
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('false');
    });

    it('course expansion leaves selection unchanged when no placeholder exists', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('selection')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
      });

      fireEvent.click(screen.getByText('expand-course-b'));

      expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":10');
      expect(screen.getByTestId('selection')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
    });
  });

  describe('associateSubsection', () => {
    it('sends the selected group\'s id and rule when the selection is a group belonging to the clicked subsection\'s course', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(201, {
        id: 901,
        group_id: 10,
        rule_profile_id: null,
        rule_type_override: 'grade',
        rule_payload_override: { op: 'gte', value: 0.7, scale: 'percent' },
        object_tag_id: tagId,
      });
      renderProvider();
      // `associateSubsection` no-ops until the groups/profile queries have
      // resolved (matching real usage - the content panel only offers this
      // action once `CourseGroupList`'s own loading gate has passed).
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('selection-rulebox-10'));
      fireEvent.click(screen.getByText('associate-course-a'));

      await waitFor(() => expect(axiosMock.history.post).toHaveLength(1));
      expect(JSON.parse(axiosMock.history.post[0].data)).toEqual({
        object_id: 'new-sub',
        group_id: 10,
        rule_type_override: 'grade',
        rule_payload_override: { op: 'gte', value: 0.7, scale: 'percent' },
      });
    });

    it('omits group_id and rule fields when selection is unset', async () => {
      axiosMock.onGet(groupsUrl).reply(200, noGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onPost(createUrl).reply(201, {
        id: 902,
        group_id: 20,
        rule_profile_id: 1,
        rule_type_override: null,
        rule_payload_override: null,
        object_tag_id: tagId,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('associate-course-a'));

      await waitFor(() => expect(axiosMock.history.post).toHaveLength(1));
      expect(JSON.parse(axiosMock.history.post[0].data)).toEqual({ object_id: 'new-sub' });
    });

    it('omits group_id and rule fields when selection is a group belonging to a different course', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(201, {
        id: 903,
        group_id: 20,
        rule_profile_id: 1,
        rule_type_override: null,
        rule_payload_override: null,
        object_tag_id: tagId,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('selection-rulebox-10')); // group 10 belongs to courseA
      fireEvent.click(screen.getByText('associate-other-course')); // clicked from courseOther

      await waitFor(() => expect(axiosMock.history.post).toHaveLength(1));
      expect(JSON.parse(axiosMock.history.post[0].data)).toEqual({ object_id: 'new-sub' });
    });

    it('returns early with an informational toast, sending no request, for an already-associated subsection', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('associate-duplicate'));

      expect(axiosMock.history.post).toHaveLength(0);
      expect(mockShowToast).toHaveBeenCalledWith(
        'This content is already associated with this competency.',
        undefined,
        undefined,
        InfoOutline,
      );
    });

    it('selects the response\'s group and rule after a successful create, not a stale local read', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      // Group 999 doesn't exist anywhere in the local tree - if selection were
      // derived via `lastRealRuleKeyIn` against the (stale, not-yet-refetched)
      // local index, it would find nothing and resolve a `null` rule key.
      axiosMock.onPost(createUrl).reply(201, {
        id: 904,
        group_id: 999,
        rule_profile_id: null,
        rule_type_override: 'grade',
        rule_payload_override: { op: 'eq', value: 1, scale: 'percent' },
        object_tag_id: tagId,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('associate-course-a'));

      await waitFor(() => {
        expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":999');
      });
      expect(screen.getByTestId('selection')).toHaveTextContent('"ruleKey":"grade:eq:1:percent"');
    });

    it('shows a specific toast when the create request 400s with a tag_id field error', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(400, {
        tag_id: ['A parent or child competency already has criteria in this course.'],
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('associate-course-a'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'This competency can\'t be associated with this content because a parent or child '
            + 'competency already has criteria in this course.',
          undefined,
          undefined,
          ErrorIcon,
        );
      });
    });

    it('shows the generic toast for a 400 that is not a tag_id field error', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(400, { object_id: ['This field is required.'] });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('associate-course-a'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'There was a problem creating this association. Please try again.',
          undefined,
          undefined,
          ErrorIcon,
        );
      });
    });

    it('sends only group_id for a placeholder rule box whose score the author has not changed', async () => {
      axiosMock.onGet(groupsUrl).reply(200, uniqueDefaultResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(201, {
        id: 905,
        group_id: 10,
        rule_profile_id: 1,
        rule_type_override: null,
        rule_payload_override: null,
        object_tag_id: tagId,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-rule-10'));
      fireEvent.click(screen.getByText('associate-course-a'));

      await waitFor(() => expect(axiosMock.history.post).toHaveLength(1));
      expect(JSON.parse(axiosMock.history.post[0].data)).toEqual({ object_id: 'new-sub', group_id: 10 });
    });

    it('sends no request and flags a rejection for an untouched placeholder whose default score is taken', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-rule-10'));
      fireEvent.click(screen.getByText('associate-course-a'));

      expect(axiosMock.history.post).toHaveLength(0);
      expect(screen.getByTestId('duplicate-rejected')).toHaveTextContent('true');
    });

    it('clears the rejection once the placeholder score changes, and then posts', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(201, {
        id: 910,
        group_id: 10,
        rule_profile_id: null,
        rule_type_override: 'grade',
        rule_payload_override: { op: 'gte', value: 0.85, scale: 'percent' },
        object_tag_id: tagId,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-rule-10'));
      fireEvent.click(screen.getByText('associate-course-a'));
      expect(screen.getByTestId('duplicate-rejected')).toHaveTextContent('true');

      fireEvent.click(screen.getByText('set-placeholder-rule-payload'));
      expect(screen.getByTestId('duplicate-rejected')).toHaveTextContent('false');

      fireEvent.click(screen.getByText('associate-course-a'));
      await waitFor(() => expect(axiosMock.history.post).toHaveLength(1));
    });

    it('sends group_id and both rule fields for a placeholder rule box whose score the author has changed', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(201, {
        id: 906,
        group_id: 10,
        rule_profile_id: null,
        rule_type_override: 'grade',
        rule_payload_override: { op: 'gte', value: 0.85, scale: 'percent' },
        object_tag_id: tagId,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-rule-10'));
      fireEvent.click(screen.getByText('set-placeholder-rule-payload'));
      fireEvent.click(screen.getByText('associate-course-a'));

      await waitFor(() => expect(axiosMock.history.post).toHaveLength(1));
      expect(JSON.parse(axiosMock.history.post[0].data)).toEqual({
        object_id: 'new-sub',
        group_id: 10,
        rule_type_override: 'grade',
        rule_payload_override: { op: 'gte', value: 0.85, scale: 'percent' },
      });
    });

    it('sends logic_operator (uppercased) but no group_id for a placeholder group belonging to the clicked course', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(201, {
        id: 907,
        group_id: 11,
        rule_profile_id: 1,
        rule_type_override: null,
        rule_payload_override: null,
        object_tag_id: tagId,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-group-1'));
      fireEvent.click(screen.getByText('associate-course-a'));

      await waitFor(() => expect(axiosMock.history.post).toHaveLength(1));
      expect(JSON.parse(axiosMock.history.post[0].data)).toEqual({ object_id: 'new-sub', logic_operator: 'OR' });
    });

    it('sends logic_operator and both rule fields together for a placeholder group whose score the author set', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(201, {
        id: 908,
        group_id: 11,
        rule_profile_id: null,
        rule_type_override: 'grade',
        rule_payload_override: { op: 'gte', value: 0.85, scale: 'percent' },
        object_tag_id: tagId,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-group-1'));
      fireEvent.click(screen.getByText('set-placeholder-rule-payload'));
      fireEvent.click(screen.getByText('associate-course-a'));

      await waitFor(() => expect(axiosMock.history.post).toHaveLength(1));
      expect(JSON.parse(axiosMock.history.post[0].data)).toEqual({
        object_id: 'new-sub',
        logic_operator: 'OR',
        rule_type_override: 'grade',
        rule_payload_override: { op: 'gte', value: 0.85, scale: 'percent' },
      });
    });

    it('omits every optional field for a placeholder group when the subsection is from a different course', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(201, {
        id: 909,
        group_id: 20,
        rule_profile_id: 1,
        rule_type_override: null,
        rule_payload_override: null,
        object_tag_id: tagId,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-group-1'));
      fireEvent.click(screen.getByText('associate-other-course'));

      await waitFor(() => expect(axiosMock.history.post).toHaveLength(1));
      expect(JSON.parse(axiosMock.history.post[0].data)).toEqual({ object_id: 'new-sub' });
    });
  });

  describe('updateGroupOperator', () => {
    it('sends the new operator, with no toast, on success', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPatch(updateGroupOperatorUrl).reply(200, {
        id: 10,
        parent_id: 1,
        tag_id: tagId,
        course_key: null,
        name: 'leaf',
        ordering: 0,
        logic_operator: 'OR',
        archived: false,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('update-group-operator'));

      await waitFor(() => expect(axiosMock.history.patch).toHaveLength(1));
      expect(axiosMock.history.patch[0].url).toEqual(updateGroupOperatorUrl);
      expect(JSON.parse(axiosMock.history.patch[0].data)).toEqual({ logic_operator: 'OR' });
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('shows a failure toast on rejection', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPatch(updateGroupOperatorUrl).reply(500);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('update-group-operator'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'There was a problem updating this group\'s logic. Please try again.',
        );
      });
    });
  });

  describe('updateRuleScore', () => {
    it(
      'sends the batch payload and derives the new selection key from the response\'s own values, not the '
        + 'request\'s, on success',
      async () => {
        axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
        axiosMock.onGet(profileUrl).reply(200, profileResponse);
        axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
        // The request (below) sends an explicit override of 0.8; the mocked response simulates
        // the backend's "reset to default" behavior instead, reassigning the criterion to the
        // shared default profile (0.7) with both override fields cleared. An implementation that
        // (incorrectly) derived the new selection key from the request would compute 0.8's key here.
        axiosMock.onPatch(updateRuleScoreUrl).reply(200, [
          {
            id: 900,
            object_id: 'existing-sub',
            group_id: 10,
            rule_profile_id: 1,
            rule_type_override: null,
            rule_payload_override: null,
          },
        ]);
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

        fireEvent.click(screen.getByText('update-rule-score'));

        await waitFor(() => expect(axiosMock.history.patch).toHaveLength(1));
        expect(axiosMock.history.patch[0].url).toEqual(updateRuleScoreUrl);
        expect(JSON.parse(axiosMock.history.patch[0].data)).toEqual({
          criterion_ids: [900],
          rule_type_override: 'grade',
          rule_payload_override: { op: 'gte', value: 0.8, scale: 'percent' },
        });

        await waitFor(() => {
          expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":10');
        });
        expect(screen.getByTestId('selection')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
      },
    );

    it('shows a failure toast on rejection, without changing selection', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPatch(updateRuleScoreUrl).reply(500);
      renderProvider();
      await waitFor(() => {
        expect(screen.getByTestId('selection')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
      });

      fireEvent.click(screen.getByText('update-rule-score'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'There was a problem updating this rule\'s score. Please try again.',
        );
      });
      expect(screen.getByTestId('selection')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
    });
  });

  describe('deleteGroup', () => {
    const deleteUrl = apiUrls.updateCompetencyCriteriaGroup(tagId, 10);

    /** Serves `initial` once, then `refetched` (held until `release` is called) for every later GET. */
    const mockGroupsReads = (
      initial: CompetencyCriteriaGroupsResponse,
      refetched: CompetencyCriteriaGroupsResponse,
    ) => {
      const control = { release: () => {} };
      axiosMock.onGet(groupsUrl).replyOnce(200, initial);
      axiosMock.onGet(groupsUrl).reply(() => (
        new Promise((resolve) => {
          control.release = () => resolve([200, refetched]);
        })
      ));
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      return control;
    };

    const renderWithSelectionOnGroup10 = async () => {
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
      fireEvent.click(screen.getByText('selection-group-10'));
      expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":10');
    };

    it('stays pending until the refetch lands, then selects the neighbor and requests keyboard focus for it', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderWithSelectionOnGroup10();

      fireEvent.click(screen.getByText('delete-group-10'));

      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('true'));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      // The delete itself has resolved, but the refetch has not.
      expect(screen.getByTestId('is-deleting')).toHaveTextContent('true');
      expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":10');

      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
      expect(screen.getByTestId('selection')).toHaveTextContent(`{"groupId":11,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":11,"expand":true}',
      );
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('treats a 404 as success: no toast, and selection still moves off the vanished group', async () => {
      axiosMock.onDelete(deleteUrl).reply(404);
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderWithSelectionOnGroup10();

      fireEvent.click(screen.getByText('delete-group-10'));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":11'));
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('toasts on a failure, keeps the selection when the group is still there, and requests no keyboard focus', async () => {
      axiosMock.onDelete(deleteUrl).reply(500);
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, twoGroupsWithCriteriaResponse);
      await renderWithSelectionOnGroup10();

      fireEvent.click(screen.getByText('delete-group-10'));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
      expect(mockShowToast).toHaveBeenCalledWith('Couldn\'t remove the group. The panel was refreshed.');
      expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":10');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('null');
    });

    it('requests the empty state when the delete leaves no course group', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(singleGroupResponse, noGroupsResponse);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('selection')).toHaveTextContent('"groupId":10'));

      fireEvent.click(screen.getByText('delete-group-10'));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('{"kind":"empty"}'));
      expect(screen.getByTestId('selection')).toHaveTextContent('null');
    });

    it('clears the keyboard focus request when the selection is written some other way', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderWithSelectionOnGroup10();
      fireEvent.click(screen.getByText('delete-group-10'));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });
      await waitFor(() => expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('"groupId":11'));

      fireEvent.click(screen.getByText('selection-group-11'));

      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('null');
    });

    it('moves selection to the course group above when deleting the only rule group cascades its course group away', async () => {
      axiosMock.onDelete(apiUrls.updateCompetencyCriteriaGroup(tagId, 20)).reply(200, {});
      const reads = mockGroupsReads(twoCoursesWithCriteriaResponse, {
        groups: twoCoursesWithCriteriaResponse.groups.filter((group) => group.id !== 2 && group.id !== 20),
        criteria: twoCoursesWithCriteriaResponse.criteria.filter((criterion) => criterion.groupId === 10),
      });
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
      await waitFor(() => expect(screen.getByTestId('accessible-course-group-ids')).toHaveTextContent(courseB));
      fireEvent.click(screen.getByText('selection-group-20'));

      fireEvent.click(screen.getByText('delete-group-20'));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => {
        expect(screen.getByTestId('selection')).toHaveTextContent(`{"groupId":10,"ruleKey":"${defaultRuleKey}"}`);
      });
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":10,"expand":true}',
      );
    });

    it('leaves selection alone, and asks to keep sections as they are, when the deleted group was not selected', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
      fireEvent.click(screen.getByText('selection-group-11'));
      const selectionBefore = screen.getByTestId('selection').textContent;

      fireEvent.click(screen.getByText('delete-group-10'));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
      expect(screen.getByTestId('selection').textContent).toEqual(selectionBefore);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":11,"expand":false}',
      );
    });

    it('respects a click made on another group while the delete is pending', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderWithSelectionOnGroup10();

      fireEvent.click(screen.getByText('delete-group-10'));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      fireEvent.click(screen.getByText('selection-group-11'));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
      expect(screen.getByTestId('selection')).toHaveTextContent(`{"groupId":11,"ruleKey":"${defaultRuleKey}"}`);
    });

    it('requests the empty state when only a course group the author cannot see is left', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(403);
      const reads = mockGroupsReads(twoCoursesWithCriteriaResponse, {
        groups: twoCoursesWithCriteriaResponse.groups.filter((group) => group.id !== 1 && group.id !== 10),
        criteria: twoCoursesWithCriteriaResponse.criteria.filter((criterion) => criterion.groupId === 20),
      });
      await renderWithSelectionOnGroup10();

      fireEvent.click(screen.getByText('delete-group-10'));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('{"kind":"empty"}'));
      expect(screen.getByTestId('selection')).toHaveTextContent('null');
    });
  });

  describe('removeAssociation', () => {
    const deleteUrl = apiUrls.deleteCompetencyCriterion(tagId, 901);

    /** Serves `initial` once, then `refetched` (held until `release` is called) for every later GET. */
    const mockGroupsReads = (
      initial: CompetencyCriteriaGroupsResponse,
      refetched: CompetencyCriteriaGroupsResponse,
    ) => {
      const control = { release: () => {} };
      axiosMock.onGet(groupsUrl).replyOnce(200, initial);
      axiosMock.onGet(groupsUrl).reply(() => (
        new Promise((resolve) => {
          control.release = () => resolve([200, refetched]);
        })
      ));
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      return control;
    };

    const renderLoaded = async () => {
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
    };

    const clickAndSettle = async (
      label: string,
      reads: { release: () => void; },
      expectedUrl: string = deleteUrl,
    ) => {
      fireEvent.click(screen.getByText(label));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });
      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
      expect(axiosMock.history.delete[0].url).toEqual(expectedUrl);
    };

    it('stays in the deleting state until the groups refetch lands', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901, archived: false });
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      await renderLoaded();

      fireEvent.click(screen.getByText('remove-sub-a-chip'));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      // The DELETE has returned but the groups refetch is held, so the panel still counts as deleting.
      expect(screen.getByTestId('is-deleting')).toHaveTextContent('true');
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
    });

    it('keeps the group and its other criteria, and asks the group box to take focus without expanding', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901, archived: false });
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      await renderLoaded();
      fireEvent.click(screen.getByText('selection-group-10'));

      await clickAndSettle('remove-sub-a-chip', reads);

      expect(screen.getByTestId('group-ids')).toHaveTextContent('[500,1,10]');
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[903]');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":10,"expand":false}',
      );
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('moves the selection off a vanished rule box to the group\'s first remaining one', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901, archived: false });
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      await renderLoaded();
      fireEvent.click(screen.getByText('selection-rulebox-10'));
      expect(screen.getByTestId('selection')).toHaveTextContent(`{"groupId":10,"ruleKey":"${defaultRuleKey}"}`);

      await clickAndSettle('remove-sub-a-chip', reads);

      expect(screen.getByTestId('selection')).toHaveTextContent(`{"groupId":10,"ruleKey":"${rule80Key}"}`);
    });

    it('selects the neighbor group when the removal cascades the group away', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901, archived: false });
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderLoaded();
      fireEvent.click(screen.getByText('selection-group-10'));

      await clickAndSettle('remove-sub-a-chip', reads);

      expect(screen.getByTestId('selection')).toHaveTextContent(`{"groupId":11,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":11,"expand":true}',
      );
    });

    it('requests the empty state when the removal cascades away the last group', async () => {
      axiosMock.onDelete(apiUrls.deleteCompetencyCriterion(tagId, 900)).reply(200, { id: 900, archived: false });
      const reads = mockGroupsReads(singleGroupResponse, noGroupsResponse);
      await renderLoaded();
      fireEvent.click(screen.getByText('selection-group-10'));

      await clickAndSettle('remove-existing-sub', reads, apiUrls.deleteCompetencyCriterion(tagId, 900));

      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('{"kind":"empty"}');
    });

    it('treats a 404 as success when the refetch no longer has the criterion: no toast, focus returns to the group', async () => {
      axiosMock.onDelete(deleteUrl).reply(404);
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      await renderLoaded();
      fireEvent.click(screen.getByText('selection-group-10'));

      await clickAndSettle('remove-sub-a-chip', reads);

      expect(mockShowToast).not.toHaveBeenCalled();
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[903]');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":10,"expand":false}',
      );
    });

    it('toasts on a 404 when the refetch still has the criterion', async () => {
      axiosMock.onDelete(deleteUrl).reply(404);
      const reads = mockGroupsReads(twoBoxesInGroupResponse, twoBoxesInGroupResponse);
      await renderLoaded();

      await clickAndSettle('remove-sub-a-chip', reads);

      expect(mockShowToast).toHaveBeenCalledWith('Couldn\'t remove the association. The panel was refreshed.');
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[901,903]');
    });

    it('toasts on a failure and requests no keyboard focus, since the association is still there', async () => {
      axiosMock.onDelete(deleteUrl).reply(500);
      const reads = mockGroupsReads(twoBoxesInGroupResponse, twoBoxesInGroupResponse);
      await renderLoaded();
      fireEvent.click(screen.getByText('selection-group-10'));

      await clickAndSettle('remove-sub-a-chip', reads);

      expect(mockShowToast).toHaveBeenCalledWith('Couldn\'t remove the association. The panel was refreshed.');
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[901,903]');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('null');
    });

    it('toasts on a failure and still returns focus to the subsection row', async () => {
      axiosMock.onDelete(deleteUrl).reply(500);
      const reads = mockGroupsReads(twoBoxesInGroupResponse, twoBoxesInGroupResponse);
      await renderLoaded();

      await clickAndSettle('remove-sub-a-subsection', reads);

      expect(mockShowToast).toHaveBeenCalledWith('Couldn\'t remove the association. The panel was refreshed.');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"subsection","objectId":"sub-a"}',
      );
    });

    it('deletes the criterion with the given id when another group holds one for the same subsection', async () => {
      const urlOf902 = apiUrls.deleteCompetencyCriterion(tagId, 902);
      axiosMock.onDelete(urlOf902).reply(200, { id: 902, archived: false });
      const reads = mockGroupsReads(
        sameSubsectionInTwoGroupsResponse,
        { ...sameSubsectionInTwoGroupsResponse, criteria: sameSubsectionInTwoGroupsResponse.criteria.slice(0, 1) },
      );
      await renderLoaded();

      await clickAndSettle('remove-criterion-902', reads, urlOf902);

      expect(axiosMock.history.delete).toHaveLength(1);
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[901]');
    });

    it('drops a second call made while the first is still deleting, so one request is sent', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901, archived: false });
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      await renderLoaded();
      fireEvent.click(screen.getByText('remove-sub-a-chip'));
      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('true'));

      await clickAndSettle('remove-sub-a-chip', reads);

      expect(axiosMock.history.delete).toHaveLength(1);
    });

    it('requests keyboard focus for the subsection row when the removal came from Browse Courses', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901, archived: false });
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      await renderLoaded();
      fireEvent.click(screen.getByText('selection-group-10'));

      await clickAndSettle('remove-sub-a-subsection', reads);

      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"subsection","objectId":"sub-a"}',
      );
    });
  });

  describe('removePlaceholderGroup', () => {
    it('sends no request, and selects the last saved group of the placeholder\'s course with a keyboard request', async () => {
      axiosMock.onGet(groupsUrl).reply(200, twoGroupsWithCriteriaResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
      fireEvent.click(screen.getByText('add-placeholder-group-1'));
      expect(screen.getByTestId('selection')).toHaveTextContent('{"groupId":null,"ruleKey":null}');

      fireEvent.click(screen.getByText('remove-placeholder-group'));

      expect(screen.getByTestId('selection')).toHaveTextContent(`{"groupId":11,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":11,"expand":true}',
      );
      expect(axiosMock.history.delete).toHaveLength(0);
      expect(axiosMock.history.patch).toHaveLength(0);
      expect(axiosMock.history.post).toHaveLength(0);
    });

    it('clears the selection, with no keyboard request, when the placeholder\'s course group has no saved group', async () => {
      axiosMock.onGet(groupsUrl).reply(200, {
        groups: singleGroupResponse.groups.filter((group) => group.id !== 10),
        criteria: [],
      });
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
      fireEvent.click(screen.getByText('add-placeholder-group-1'));

      fireEvent.click(screen.getByText('remove-placeholder-group'));

      expect(screen.getByTestId('selection')).toHaveTextContent('null');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('null');
    });
  });
});
