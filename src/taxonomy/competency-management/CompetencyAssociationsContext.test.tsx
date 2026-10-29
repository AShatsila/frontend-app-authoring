import { Error as ErrorIcon, InfoOutline } from '@openedx/paragon/icons';
import { buildOutlineIndex } from '@src/course-outline/__mocks__';
import { getCourseOutlineIndexApiUrl } from '@src/course-outline/data';
import {
  act,
  fireEvent,
  initializeMocks,
  render,
  screen,
  userEvent,
  waitFor,
} from '@src/testUtils';
import { CompetencyAssociationsProvider, useCompetencyAssociations } from './CompetencyAssociationsContext';
import { RemovalTargetKind } from './constants';
import { apiUrls } from './data/api';
import type { CompetencyCriteriaGroupsResponse, CompetencyCriterion } from './data/types';
import { ruleBoxesForGroup } from './utils';

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

/** Like `twoCoursesResponse`, but group 20 has a criterion, so focusing it yields a real rule key. */
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
const rule90Key = 'grade:gte:0.9:percent';

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
 * Removing one leaves the group alive with one box, which lets tests check the group survives and focus
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

/** A criterion in group `groupId` at `percent`, or one resolving through the 70% default profile when `percent` is null. */
const criterionAt = (id: number, groupId: number, percent: number | null): CompetencyCriterion => (
  percent === null
    ? { id, objectId: `sub-${id}`, groupId, ruleProfileId: 1, ruleTypeOverride: null, rulePayloadOverride: null }
    : {
      id,
      objectId: `sub-${id}`,
      groupId,
      ruleProfileId: null,
      ruleTypeOverride: 'grade',
      rulePayloadOverride: { op: 'gte', value: percent / 100, scale: 'percent' },
    }
);

const withoutCriteria = (response: CompetencyCriteriaGroupsResponse, criterionIds: number[]) => ({
  ...response,
  criteria: response.criteria.filter((criterion) => !criterionIds.includes(criterion.id)),
});

/** Group 10 holds three rule boxes (70%, 80%, 90%) and group 11 one, so a box can vanish while its group survives. */
const threeBoxesInGroupResponse: CompetencyCriteriaGroupsResponse = {
  ...twoGroupsResponse,
  criteria: [
    criterionAt(901, 10, null),
    criterionAt(903, 10, 80),
    criterionAt(904, 10, 90),
    criterionAt(902, 11, null),
  ],
};

/** `threeBoxesInGroupResponse` plus a fourth box (95%) in group 10, so a removed box has a neighbor on each side. */
const fourBoxesInGroupResponse: CompetencyCriteriaGroupsResponse = {
  ...threeBoxesInGroupResponse,
  criteria: [...threeBoxesInGroupResponse.criteria, criterionAt(907, 10, 95)],
};

/** Group 10's 70% box holds three criteria (901, 905, 906) and its 80% box one (903). */
const boxOfThreeResponse: CompetencyCriteriaGroupsResponse = {
  ...singleGroupResponse,
  criteria: [
    criterionAt(901, 10, null),
    criterionAt(905, 10, null),
    criterionAt(906, 10, null),
    criterionAt(903, 10, 80),
  ],
};

const outlineFixture = buildOutlineIndex();

/** Exposes every context value/action as plain, clickable test hooks. */
const TestConsumer = () => {
  const ctx = useCompetencyAssociations();
  // The ids a rendered rule box holds, which is what `RuleBox` hands to `requestRemoval`; none for a key the group lacks.
  const boxIds = (groupId: number, ruleKey: string) => (
    ctx.index && ctx.systemDefaultProfile
      ? ruleBoxesForGroup(groupId, ctx.index, ctx.systemDefaultProfile)
        .find((box) => box.key === ruleKey)?.criteria.map((criterion) => criterion.id) ?? []
      : []
  );
  return (
    <div>
      <div data-testid="focus">{JSON.stringify(ctx.focus)}</div>
      <div data-testid="placeholder">{JSON.stringify(ctx.placeholder)}</div>
      <div data-testid="has-placeholder">{String(ctx.hasPlaceholder)}</div>
      <div data-testid="duplicate-rejected">{String(ctx.placeholderDuplicateRejected)}</div>
      <div data-testid="groups-status">{ctx.groupsQuery.isSuccess ? 'groups-success' : 'groups-pending'}</div>
      <div data-testid="profile-status">{ctx.profileQuery.isSuccess ? 'profile-success' : 'profile-pending'}</div>
      <div data-testid="accessible-course-group-ids">
        {ctx.accessibleCourseGroups.map((group) => group.courseKey).join(',')}
      </div>
      <button type="button" onClick={() => ctx.focusGroup(999)}>focus-999</button>
      <button type="button" onClick={() => ctx.focusGroup(10)}>focus-group-10</button>
      <button type="button" onClick={() => ctx.focusGroup(11)}>focus-group-11</button>
      <button type="button" onClick={() => ctx.focusGroup(20)}>focus-group-20</button>
      <button type="button" onClick={() => ctx.focusRuleBox(10, defaultRuleKey)}>focus-rulebox-10</button>
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
      <div data-testid="pending-removal">
        {ctx.pendingRemoval
          ? JSON.stringify({ kind: ctx.pendingRemoval.target.kind, failure: ctx.pendingRemoval.failure })
          : 'closed'}
      </div>
      <div data-testid="pending-summary">{JSON.stringify(ctx.pendingRemoval?.summary ?? null)}</div>
      <button type="button" onClick={() => ctx.confirmRemoval()}>confirm-removal</button>
      <button type="button" onClick={() => Promise.all([ctx.confirmRemoval(), ctx.confirmRemoval()])}>
        confirm-removal-twice
      </button>
      <button type="button" onClick={() => ctx.cancelRemoval()}>cancel-removal</button>
      <button type="button" onClick={() => ctx.requestRemoval({ kind: RemovalTargetKind.RuleGroup, groupId: 10 })}>
        delete-group-10
      </button>
      <button type="button" onClick={() => ctx.requestRemoval({ kind: RemovalTargetKind.RuleGroup, groupId: 20 })}>
        delete-group-20
      </button>
      <button type="button" onClick={() => ctx.requestRemoval({ kind: RemovalTargetKind.RuleGroup, groupId: 11 })}>
        request-remove-group-11
      </button>
      <button type="button" onClick={() => ctx.requestRemoval({ kind: RemovalTargetKind.CourseGroup, groupId: 1 })}>
        request-remove-course-group-1
      </button>
      <div data-testid="criterion-ids">{JSON.stringify(ctx.groupsQuery.data?.criteria.map((c) => c.id))}</div>
      <div data-testid="group-ids">{JSON.stringify(ctx.groupsQuery.data?.groups.map((g) => g.id))}</div>
      <button
        type="button"
        onClick={() =>
          ctx.requestRemoval({ kind: RemovalTargetKind.Association, criterionId: 900, returnFocusTo: 'group' })}
      >
        remove-existing-sub
      </button>
      <button
        type="button"
        onClick={() =>
          ctx.requestRemoval({ kind: RemovalTargetKind.Association, criterionId: 901, returnFocusTo: 'group' })}
      >
        remove-sub-a-chip
      </button>
      <button
        type="button"
        onClick={() =>
          ctx.requestRemoval({ kind: RemovalTargetKind.Association, criterionId: 902, returnFocusTo: 'group' })}
      >
        remove-criterion-902
      </button>
      <button
        type="button"
        onClick={() =>
          ctx.requestRemoval({ kind: RemovalTargetKind.Association, criterionId: 901, returnFocusTo: 'subsection' })}
      >
        remove-sub-a-subsection
      </button>
      <button type="button" onClick={() => ctx.removePlaceholderGroup()}>remove-placeholder-group</button>
      <button type="button" onClick={() => ctx.focusRuleBox(10, rule80Key)}>focus-rulebox-10-80</button>
      <button type="button" onClick={() => ctx.focusRuleBox(10, rule90Key)}>focus-rulebox-10-90</button>
      <button
        type="button"
        onClick={() =>
          ctx.requestRemoval({
            kind: RemovalTargetKind.RuleBox,
            groupId: 10,
            criterionIds: boxIds(10, defaultRuleKey),
          })}
      >
        delete-rule-box-10-70
      </button>
      <button
        type="button"
        onClick={() =>
          ctx.requestRemoval({ kind: RemovalTargetKind.RuleBox, groupId: 10, criterionIds: boxIds(10, rule80Key) })}
      >
        delete-rule-box-10-80
      </button>
      <button
        type="button"
        onClick={() =>
          ctx.requestRemoval({ kind: RemovalTargetKind.RuleBox, groupId: 10, criterionIds: boxIds(10, rule90Key) })}
      >
        delete-rule-box-10-90
      </button>
      <button
        type="button"
        onClick={() =>
          ctx.requestRemoval({
            kind: RemovalTargetKind.RuleBox,
            groupId: 11,
            criterionIds: boxIds(11, defaultRuleKey),
          })}
      >
        delete-rule-box-11-70
      </button>
      <button
        type="button"
        onClick={() =>
          ctx.requestRemoval({
            kind: RemovalTargetKind.RuleBox,
            groupId: 20,
            criterionIds: boxIds(20, defaultRuleKey),
          })}
      >
        delete-rule-box-20-70
      </button>
      <button
        type="button"
        onClick={() => ctx.requestRemoval({ kind: RemovalTargetKind.RuleBox, groupId: 10, criterionIds: [999] })}
      >
        delete-rule-box-ids-999
      </button>
      <button type="button" onClick={() => ctx.removePlaceholderRuleBox()}>remove-placeholder-rule-box</button>
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

/** Opens the confirmation for `requestLabel`'s removal, then confirms it. */
const requestAndConfirm = (requestLabel: string) => {
  fireEvent.click(screen.getByText(requestLabel));
  fireEvent.click(screen.getByText('confirm-removal'));
};

const renderProvider = () =>
  render(
    <CompetencyAssociationsProvider tagId={tagId} competencyName="Competency" competencyExternalId="CCRS-1.3">
      <TestConsumer />
    </CompetencyAssociationsProvider>,
  );

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

describe('CompetencyAssociationsProvider', () => {
  beforeEach(() => {
    ({ axiosMock, mockShowToast } = initializeMocks());
  });

  describe('initial focus', () => {
    it('focuses the sole bottom-tier group once the groups query and every visible course outline resolve', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":10');
      });
      expect(screen.getByTestId('focus')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
    });

    it('leaves focus unset when more than one bottom-tier group exists across visible course groups', async () => {
      axiosMock.onGet(groupsUrl).reply(200, twoGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success');
      });
      expect(screen.getByTestId('focus')).toHaveTextContent('null');
    });

    it('leaves focus unset when there are no visible course-level groups', async () => {
      axiosMock.onGet(groupsUrl).reply(200, noGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success');
      });
      expect(screen.getByTestId('focus')).toHaveTextContent('null');
    });

    it('a click beats a preceding auto-focus and is not reverted once the data resolves', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();

      // Click before anything has resolved - at this point `focus` is
      // still unset and the initial-focus effect hasn't run yet.
      fireEvent.click(screen.getByText('focus-999'));
      expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":999');

      // Let the groups/profile/outline queries resolve - the sole
      // bottom-tier group (id 10) would otherwise be auto-focused.
      await waitFor(() => {
        expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success');
      });

      // The manual click's focus must survive - the auto-focus effect
      // still marks itself as having run, but skips writing anything
      // because focus was no longer unset by the time its gate resolved.
      expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":999');
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

    it('does not auto-focus a bottom-tier group that belongs to an inaccessible course', async () => {
      // A single course-level group with a single bottom-tier group - the
      // exact shape `'focuses the sole bottom-tier group...'` above proves
      // auto-focuses when the course IS accessible. Here, its own outline
      // fetch fails, so this bottom-tier group must not be eligible for
      // auto-focus at all, even though it's still the *only* one in the raw
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
      expect(screen.getByTestId('focus')).toHaveTextContent('null');
    });
  });

  it(
    'does not delay initial focus when an unrelated, still-loading course is expanded via notifyCourseExpanded',
    async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      // Course B has no group for this competency, and its own outline
      // never resolves - simulates the author expanding an unrelated
      // course in the content panel below while this competency's own
      // course (courseA) is still loading. `notifyCourseExpanded` feeds
      // `canEditCourse`'s course list, not the initial-focus gate, so this
      // must have no bearing on when focus fires.
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(() => new Promise(() => {}));
      renderProvider();

      fireEvent.click(screen.getByText('expand-course-b'));

      // The sole bottom-tier group (courseA's group 10) still auto-focuses
      // once courseA's own data resolves, unaffected by courseB's outline
      // never resolving.
      await waitFor(() => {
        expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":10');
      });
    },
  );

  describe('notifyCourseExpanded focus', () => {
    const renderWithCourseB = async () => {
      axiosMock.onGet(groupsUrl).reply(200, courseBGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('profile-success'));
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
    };

    it('moves focus from another course\'s group to the expanded course\'s last group and last rule box', async () => {
      await renderWithCourseB();
      fireEvent.click(screen.getByText('focus-group-10'));

      fireEvent.click(screen.getByText('expand-course-b'));
      const expected = JSON.stringify({ groupId: 21, ruleKey: 'grade:eq:1:percent' });
      expect(screen.getByTestId('focus')).toHaveTextContent(expected);

      fireEvent.click(screen.getByText('focus-group-10'));
      fireEvent.click(screen.getByText('expand-course-b'));
      expect(screen.getByTestId('focus')).toHaveTextContent(expected);
    });

    it('moves focus when nothing is focused', async () => {
      await renderWithCourseB();

      fireEvent.click(screen.getByText('expand-course-b'));

      expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":21');
    });

    it('leaves focus unchanged when the expanded course has no groups', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('profile-success'));
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
      fireEvent.click(screen.getByText('focus-group-10'));

      fireEvent.click(screen.getByText('expand-course-b'));

      expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":10');
    });

    it('leaves focus unchanged when it is already on a group of the expanded course', async () => {
      await renderWithCourseB();
      fireEvent.click(screen.getByText('focus-group-20'));
      const before = screen.getByTestId('focus').textContent;

      fireEvent.click(screen.getByText('expand-course-b'));

      expect(before).toContain('"groupId":20');
      expect(screen.getByTestId('focus')).toHaveTextContent(before as string);
    });

    it('associates a subsection of the expanded course into the group that expansion focused', async () => {
      await renderWithCourseB();
      axiosMock.onPost(createUrl).reply(201, {
        id: 920,
        group_id: 21,
        rule_profile_id: null,
        rule_type_override: 'grade',
        rule_payload_override: { op: 'eq', value: 1, scale: 'percent' },
        object_tag_id: tagId,
      });
      fireEvent.click(screen.getByText('focus-group-10'));
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
    it('"+ Rule" starts a placeholder rule box in the given group, focusing it with ruleKey: null', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-rule-10'));

      expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":10');
      expect(screen.getByTestId('focus')).toHaveTextContent('"ruleKey":null');
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('true');
    });

    it('"+ Rule Group" replaces an existing placeholder rule box, since focus has only one slot', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-rule-10'));
      expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":10');

      fireEvent.click(screen.getByText('add-placeholder-group-1'));

      expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":null');
      expect(screen.getByTestId('placeholder')).toHaveTextContent('"parentRuleGroupId":1');
      expect(screen.getByTestId('placeholder')).toHaveTextContent('"logicOperator":"OR"');
    });

    it('focusing a different real group clears an existing placeholder', async () => {
      axiosMock.onGet(groupsUrl).reply(200, courseExpansionResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-rule-10'));
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('true');

      fireEvent.click(screen.getByText('focus-group-20'));

      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('false');
      expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":20');
      expect(screen.getByTestId('focus')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
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
        expect(screen.getByTestId('focus')).toHaveTextContent('"ruleKey":null');

        fireEvent.click(screen.getByText('expand-course-b'));

        await waitFor(() => {
          expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":20');
        });
        expect(screen.getByTestId('focus')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
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
      const focusBefore = screen.getByTestId('focus').textContent;
      fireEvent.click(screen.getByText('expand-course-a'));

      expect(screen.getByTestId('focus').textContent).toBe(focusBefore);
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('true');
    });

    it('discardPlaceholder clears focus, and with it the placeholder', async () => {
      axiosMock.onGet(groupsUrl).reply(200, courseExpansionResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));

      fireEvent.click(screen.getByText('add-placeholder-group-1'));
      fireEvent.click(screen.getByText('discard-placeholder'));

      expect(screen.getByTestId('focus')).toHaveTextContent('null');
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('false');
    });

    it('course expansion leaves focus unchanged when no placeholder exists', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('focus')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
      });

      fireEvent.click(screen.getByText('expand-course-b'));

      expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":10');
      expect(screen.getByTestId('focus')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
    });
  });

  describe('associateSubsection', () => {
    it('sends the focused group\'s id and rule when the focus is a group belonging to the clicked subsection\'s course', async () => {
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

      fireEvent.click(screen.getByText('focus-rulebox-10'));
      fireEvent.click(screen.getByText('associate-course-a'));

      await waitFor(() => expect(axiosMock.history.post).toHaveLength(1));
      expect(JSON.parse(axiosMock.history.post[0].data)).toEqual({
        object_id: 'new-sub',
        group_id: 10,
        rule_type_override: 'grade',
        rule_payload_override: { op: 'gte', value: 0.7, scale: 'percent' },
      });
    });

    it('omits group_id and rule fields when focus is unset', async () => {
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

    it('omits group_id and rule fields when focus is a group belonging to a different course', async () => {
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

      fireEvent.click(screen.getByText('focus-rulebox-10')); // group 10 belongs to courseA
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

    it('focuses the response\'s group and rule after a successful create, not a stale local read', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      // Group 999 doesn't exist anywhere in the local tree - if focus were
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
        expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":999');
      });
      expect(screen.getByTestId('focus')).toHaveTextContent('"ruleKey":"grade:eq:1:percent"');
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
      'sends the batch payload and derives the new focus key from the response\'s own values, not the '
        + 'request\'s, on success',
      async () => {
        axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
        axiosMock.onGet(profileUrl).reply(200, profileResponse);
        axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
        // The request (below) sends an explicit override of 0.8; the mocked response simulates
        // the backend's "reset to default" behavior instead, reassigning the criterion to the
        // shared default profile (0.7) with both override fields cleared. An implementation that
        // (incorrectly) derived the new focus key from the request would compute 0.8's key here.
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
          expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":10');
        });
        expect(screen.getByTestId('focus')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
      },
    );

    it('shows a failure toast on rejection, without changing focus', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      axiosMock.onPatch(updateRuleScoreUrl).reply(500);
      renderProvider();
      await waitFor(() => {
        expect(screen.getByTestId('focus')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
      });

      fireEvent.click(screen.getByText('update-rule-score'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'There was a problem updating this rule\'s score. Please try again.',
        );
      });
      expect(screen.getByTestId('focus')).toHaveTextContent('"ruleKey":"grade:gte:0.7:percent"');
    });
  });

  describe('deleting a rule group', () => {
    const deleteUrl = apiUrls.updateCompetencyCriteriaGroup(tagId, 10);

    const renderWithFocusOnGroup10 = async () => {
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
      fireEvent.click(screen.getByText('focus-group-10'));
      expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":10');
    };

    it('keeps the dialog open until the refetch lands, then closes it, focuses the neighbor and requests keyboard focus for it', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderWithFocusOnGroup10();

      requestAndConfirm('delete-group-10');

      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('true'));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      // The delete itself has resolved, but the refetch has not.
      expect(screen.getByTestId('is-deleting')).toHaveTextContent('true');
      expect(screen.getByTestId('pending-removal')).toHaveTextContent('{"kind":"ruleGroup","failure":null}');
      expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":10');

      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
      expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed');
      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":11,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":11,"expand":true}',
      );
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('treats a 404 as success: no failure, and focus still moves off the vanished group', async () => {
      axiosMock.onDelete(deleteUrl).reply(404);
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderWithFocusOnGroup10();

      requestAndConfirm('delete-group-10');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":11'));
      expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed');
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('keeps the dialog open on a failure, keeps focus when the group is still there, and requests no keyboard focus', async () => {
      axiosMock.onDelete(deleteUrl).reply(500);
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, twoGroupsWithCriteriaResponse);
      await renderWithFocusOnGroup10();

      requestAndConfirm('delete-group-10');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
      await waitFor(() => {
        expect(screen.getByTestId('pending-removal')).toHaveTextContent(
          '{"kind":"ruleGroup","failure":"nothing-removed"}',
        );
      });
      expect(mockShowToast).not.toHaveBeenCalled();
      expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":10');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('null');
    });

    it('requests the empty state when the delete leaves no course group', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(singleGroupResponse, noGroupsResponse);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":10'));

      requestAndConfirm('delete-group-10');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('{"kind":"empty"}'));
      expect(screen.getByTestId('focus')).toHaveTextContent('null');
    });

    it('clears the keyboard focus request when focus is written some other way', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderWithFocusOnGroup10();
      requestAndConfirm('delete-group-10');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });
      await waitFor(() => expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('"groupId":11'));

      fireEvent.click(screen.getByText('focus-group-11'));

      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('null');
    });

    it('moves focus to the course group above when deleting the only rule group cascades its course group away', async () => {
      axiosMock.onDelete(apiUrls.updateCompetencyCriteriaGroup(tagId, 20)).reply(200, {});
      const reads = mockGroupsReads(twoCoursesWithCriteriaResponse, {
        groups: twoCoursesWithCriteriaResponse.groups.filter((group) => group.id !== 2 && group.id !== 20),
        criteria: twoCoursesWithCriteriaResponse.criteria.filter((criterion) => criterion.groupId === 10),
      });
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
      await waitFor(() => expect(screen.getByTestId('accessible-course-group-ids')).toHaveTextContent(courseB));
      fireEvent.click(screen.getByText('focus-group-20'));

      requestAndConfirm('delete-group-20');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => {
        expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":10,"ruleKey":"${defaultRuleKey}"}`);
      });
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":10,"expand":true}',
      );
    });

    it('leaves focus alone, and asks to keep sections as they are, when the deleted group did not hold focus', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
      fireEvent.click(screen.getByText('focus-group-11'));
      const focusBefore = screen.getByTestId('focus').textContent;

      requestAndConfirm('delete-group-10');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
      expect(screen.getByTestId('focus').textContent).toEqual(focusBefore);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":11,"expand":false}',
      );
    });

    it('respects a click made on another group while the delete is pending', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderWithFocusOnGroup10();

      requestAndConfirm('delete-group-10');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      fireEvent.click(screen.getByText('focus-group-11'));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":11,"ruleKey":"${defaultRuleKey}"}`);
    });

    it('requests the empty state when only a course group the author cannot see is left', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(403);
      const reads = mockGroupsReads(twoCoursesWithCriteriaResponse, {
        groups: twoCoursesWithCriteriaResponse.groups.filter((group) => group.id !== 1 && group.id !== 10),
        criteria: twoCoursesWithCriteriaResponse.criteria.filter((criterion) => criterion.groupId === 20),
      });
      await renderWithFocusOnGroup10();

      requestAndConfirm('delete-group-10');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('{"kind":"empty"}'));
      expect(screen.getByTestId('focus')).toHaveTextContent('null');
    });
  });

  describe('deleting a rule box', () => {
    const deleteUrlOf = (criterionId: number) => apiUrls.deleteCompetencyCriterion(tagId, criterionId);
    const sentDeleteUrls = () => axiosMock.history.delete.map((request) => request.url);
    // An unmatched URL answers 404, which counts as removed, so every DELETE is mocked and the sent URLs asserted.
    const mockDeletes = (...criterionIds: number[]) => {
      criterionIds.forEach((id) => {
        axiosMock.onDelete(deleteUrlOf(id)).reply(200, { id, archived: false });
      });
    };

    const renderLoaded = async () => {
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
      await waitFor(() => expect(screen.getByTestId('accessible-course-group-ids')).toHaveTextContent(courseA));
    };

    /** Requests the removal behind `label` and confirms it, then lets the held refetch land and the delete settle. */
    const clickAndSettle = async (label: string, reads: { release: () => void; }) => {
      await userEvent.click(screen.getByText(label));
      await userEvent.click(screen.getByText('confirm-removal'));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });
      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
    };

    it('sends exactly the box\'s criteria in order, refetches once, and leaves the other boxes alone', async () => {
      mockDeletes(901, 905, 906, 903);
      const reads = mockGroupsReads(boxOfThreeResponse, withoutCriteria(boxOfThreeResponse, [901, 905, 906]));
      await renderLoaded();

      await clickAndSettle('delete-rule-box-10-70', reads);

      expect(sentDeleteUrls()).toEqual([deleteUrlOf(901), deleteUrlOf(905), deleteUrlOf(906)]);
      expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2);
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[903]');
      expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed');
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('does not send content that shows up at the same score during the run, and keeps focus on that box', async () => {
      mockDeletes(901, 905, 903, 907);
      const afterDelete: CompetencyCriteriaGroupsResponse = {
        ...singleGroupResponse,
        criteria: [criterionAt(907, 10, null), criterionAt(903, 10, 80)],
      };
      const reads = mockGroupsReads(
        {
          ...singleGroupResponse,
          criteria: [criterionAt(901, 10, null), criterionAt(905, 10, null), criterionAt(903, 10, 80)],
        },
        afterDelete,
      );
      await renderLoaded();
      await userEvent.click(screen.getByText('focus-rulebox-10'));

      await clickAndSettle('delete-rule-box-10-70', reads);

      expect(sentDeleteUrls()).toEqual([deleteUrlOf(901), deleteUrlOf(905)]);
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[907,903]');
      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":10,"ruleKey":"${defaultRuleKey}"}`);
    });

    it('requestRemoval leaves pending-removal closed for criterion ids the group no longer has', async () => {
      mockGroupsReads(boxOfThreeResponse, boxOfThreeResponse);
      await renderLoaded();

      await userEvent.click(screen.getByText('delete-rule-box-ids-999'));

      expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed');
      expect(axiosMock.history.delete).toHaveLength(0);
      expect(screen.getByTestId('is-deleting')).toHaveTextContent('false');
      expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(1);
    });

    it.each([
      {
        name: 'the first of three boxes',
        initial: threeBoxesInGroupResponse,
        focusLabel: 'focus-rulebox-10',
        deleteLabel: 'delete-rule-box-10-70',
        gone: 901,
        key: rule80Key,
      },
      {
        // The box above (80%) is neither the group's first box nor the box below (95%).
        name: 'the third of four boxes',
        initial: fourBoxesInGroupResponse,
        focusLabel: 'focus-rulebox-10-90',
        deleteLabel: 'delete-rule-box-10-90',
        gone: 904,
        key: rule80Key,
      },
    ])('moves focus to the box above, else below, when $name was focused and removed', async (
      { initial, focusLabel, deleteLabel, gone, key },
    ) => {
      mockDeletes(901, 904);
      const reads = mockGroupsReads(initial, withoutCriteria(initial, [gone]));
      await renderLoaded();
      await userEvent.click(screen.getByText(focusLabel));

      await clickAndSettle(deleteLabel, reads);

      expect(sentDeleteUrls()).toEqual([deleteUrlOf(gone)]);
      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":10,"ruleKey":"${key}"}`);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":10,"expand":false}',
      );
    });

    it('leaves focus on another box of the same group, and asks the group to take keyboard focus', async () => {
      mockDeletes(901, 903, 904);
      const reads = mockGroupsReads(threeBoxesInGroupResponse, withoutCriteria(threeBoxesInGroupResponse, [903]));
      await renderLoaded();
      await userEvent.click(screen.getByText('focus-rulebox-10'));

      await clickAndSettle('delete-rule-box-10-80', reads);

      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":10,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":10,"expand":false}',
      );
    });

    it('leaves focus in another group alone, and asks that group to take keyboard focus', async () => {
      mockDeletes(901, 903, 904);
      const reads = mockGroupsReads(threeBoxesInGroupResponse, withoutCriteria(threeBoxesInGroupResponse, [903]));
      await renderLoaded();
      await userEvent.click(screen.getByText('focus-group-11'));
      const focusBefore = screen.getByTestId('focus').textContent;

      await clickAndSettle('delete-rule-box-10-80', reads);

      expect(screen.getByTestId('focus').textContent).toEqual(focusBefore);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":11,"expand":false}',
      );
    });

    it('asks the box\'s group to take keyboard focus when nothing was focused and the group survives', async () => {
      mockDeletes(901, 903, 904);
      const reads = mockGroupsReads(threeBoxesInGroupResponse, withoutCriteria(threeBoxesInGroupResponse, [903]));
      await renderLoaded();
      expect(screen.getByTestId('focus')).toHaveTextContent('null');

      await clickAndSettle('delete-rule-box-10-80', reads);

      expect(screen.getByTestId('focus')).toHaveTextContent('null');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":10,"expand":false}',
      );
    });

    it('focuses the neighbor group\'s first box when the last box takes its group away', async () => {
      mockDeletes(901);
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderLoaded();
      await userEvent.click(screen.getByText('focus-group-10'));

      await clickAndSettle('delete-rule-box-10-70', reads);

      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":11,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":11,"expand":true}',
      );
    });

    it('focuses the group above, with its first box, when the last box takes its own group away', async () => {
      mockDeletes(902);
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, {
        groups: twoGroupsWithCriteriaResponse.groups.filter((group) => group.id !== 11),
        criteria: twoGroupsWithCriteriaResponse.criteria.filter((criterion) => criterion.groupId !== 11),
      });
      await renderLoaded();
      await userEvent.click(screen.getByText('focus-group-11'));

      await clickAndSettle('delete-rule-box-11-70', reads);

      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":10,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":10,"expand":true}',
      );
    });

    it('follows the focus move, not the vanished group, when another author deleted the focused group meanwhile', async () => {
      mockDeletes(901, 903, 904);
      // Group 11 holds the focus, and goes away with the run; group 10 survives with one box fewer.
      const reads = mockGroupsReads(threeBoxesInGroupResponse, {
        groups: threeBoxesInGroupResponse.groups.filter((group) => group.id !== 11),
        criteria: withoutCriteria(threeBoxesInGroupResponse, [903, 902]).criteria,
      });
      await renderLoaded();
      await userEvent.click(screen.getByText('focus-group-11'));

      await clickAndSettle('delete-rule-box-10-80', reads);

      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":10,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":10,"expand":true}',
      );
    });

    it('focuses the other section\'s group when the last box takes its whole section away', async () => {
      mockDeletes(902);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(200, outlineFixture);
      const reads = mockGroupsReads(twoCoursesWithCriteriaResponse, {
        groups: twoCoursesWithCriteriaResponse.groups.filter((group) => group.id !== 2 && group.id !== 20),
        criteria: twoCoursesWithCriteriaResponse.criteria.filter((criterion) => criterion.groupId === 10),
      });
      await renderLoaded();
      await waitFor(() => expect(screen.getByTestId('accessible-course-group-ids')).toHaveTextContent(courseB));
      await userEvent.click(screen.getByText('focus-group-20'));

      await clickAndSettle('delete-rule-box-20-70', reads);

      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":10,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":10,"expand":true}',
      );
    });

    it('clears focus and requests the empty state when the last box on the page goes', async () => {
      mockDeletes(900);
      const reads = mockGroupsReads(singleGroupResponse, noGroupsResponse);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":10'));

      await clickAndSettle('delete-rule-box-10-70', reads);

      expect(screen.getByTestId('focus')).toHaveTextContent('null');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('{"kind":"empty"}');
    });

    it('requests the empty state when nothing was focused and the last box on the page goes', async () => {
      mockDeletes(900);
      const reads = mockGroupsReads(singleGroupResponse, noGroupsResponse);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('focus')).toHaveTextContent('"groupId":10'));
      await userEvent.click(screen.getByText('add-placeholder-rule-10'));
      await userEvent.click(screen.getByText('discard-placeholder'));
      expect(screen.getByTestId('focus')).toHaveTextContent('null');

      await clickAndSettle('delete-rule-box-10-70', reads);

      expect(screen.getByTestId('focus')).toHaveTextContent('null');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('{"kind":"empty"}');
    });

    it('moves a focused placeholder rule box out of the group that vanished', async () => {
      mockDeletes(901);
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderLoaded();
      await userEvent.click(screen.getByText('add-placeholder-rule-10'));
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('true');

      await clickAndSettle('delete-rule-box-10-70', reads);

      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":11,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('false');
    });

    it('moves a focused placeholder group out of the section that vanished', async () => {
      mockDeletes(901);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseB)).reply(200, outlineFixture);
      const reads = mockGroupsReads(twoCoursesWithCriteriaResponse, {
        groups: twoCoursesWithCriteriaResponse.groups.filter((group) => group.id !== 1 && group.id !== 10),
        criteria: twoCoursesWithCriteriaResponse.criteria.filter((criterion) => criterion.groupId === 20),
      });
      await renderLoaded();
      await waitFor(() => expect(screen.getByTestId('accessible-course-group-ids')).toHaveTextContent(courseB));
      await userEvent.click(screen.getByText('add-placeholder-group-1'));
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('true');

      await clickAndSettle('delete-rule-box-10-70', reads);

      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":20,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('false');
    });

    it('stops at a failure partway, keeps the dialog open as partly removed, and keeps focus', async () => {
      mockDeletes(901, 906, 903);
      axiosMock.onDelete(deleteUrlOf(905)).reply(500);
      const reads = mockGroupsReads(boxOfThreeResponse, withoutCriteria(boxOfThreeResponse, [901]));
      await renderLoaded();
      await userEvent.click(screen.getByText('focus-rulebox-10'));

      await clickAndSettle('delete-rule-box-10-70', reads);

      expect(sentDeleteUrls()).toEqual([deleteUrlOf(901), deleteUrlOf(905)]);
      await waitFor(() => {
        expect(screen.getByTestId('pending-removal')).toHaveTextContent(
          '{"kind":"ruleBox","failure":"partly-removed"}',
        );
      });
      expect(mockShowToast).not.toHaveBeenCalled();
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[905,906,903]');
      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":10,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('null');
    });

    it('keeps the dialog open as nothing removed when the first request fails', async () => {
      axiosMock.onDelete(deleteUrlOf(901)).reply(500);
      mockDeletes(905, 906, 903);
      const reads = mockGroupsReads(boxOfThreeResponse, boxOfThreeResponse);
      await renderLoaded();

      await clickAndSettle('delete-rule-box-10-70', reads);

      expect(sentDeleteUrls()).toEqual([deleteUrlOf(901)]);
      await waitFor(() => {
        expect(screen.getByTestId('pending-removal')).toHaveTextContent(
          '{"kind":"ruleBox","failure":"nothing-removed"}',
        );
      });
      expect(mockShowToast).not.toHaveBeenCalled();
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[901,905,906,903]');
    });

    it('counts a 404 in the middle as removed: every criterion is tried, no toast, the box is gone', async () => {
      mockDeletes(901, 906, 903);
      axiosMock.onDelete(deleteUrlOf(905)).reply(404);
      const reads = mockGroupsReads(boxOfThreeResponse, withoutCriteria(boxOfThreeResponse, [901, 905, 906]));
      await renderLoaded();
      await userEvent.click(screen.getByText('focus-rulebox-10'));

      await clickAndSettle('delete-rule-box-10-70', reads);

      expect(sentDeleteUrls()).toEqual([deleteUrlOf(901), deleteUrlOf(905), deleteUrlOf(906)]);
      expect(mockShowToast).not.toHaveBeenCalled();
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[903]');
      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":10,"ruleKey":"${rule80Key}"}`);
    });
  });

  describe('removing an association', () => {
    const deleteUrl = apiUrls.deleteCompetencyCriterion(tagId, 901);

    const renderLoaded = async () => {
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
    };

    const clickAndSettle = async (
      label: string,
      reads: { release: () => void; },
      expectedUrl: string = deleteUrl,
    ) => {
      requestAndConfirm(label);
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });
      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
      expect(axiosMock.history.delete[0].url).toEqual(expectedUrl);
    };

    it('stays in the deleting state, with the dialog open, until the groups refetch lands', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901, archived: false });
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      await renderLoaded();

      requestAndConfirm('remove-sub-a-chip');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      // The DELETE has returned but the groups refetch is held, so the panel still counts as deleting.
      expect(screen.getByTestId('is-deleting')).toHaveTextContent('true');
      expect(screen.getByTestId('pending-removal')).toHaveTextContent('{"kind":"association","failure":null}');
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
      expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed');
    });

    it('keeps the group and its other criteria, and asks the group box to take focus without expanding', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901, archived: false });
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      await renderLoaded();
      fireEvent.click(screen.getByText('focus-group-10'));

      await clickAndSettle('remove-sub-a-chip', reads);

      expect(screen.getByTestId('group-ids')).toHaveTextContent('[500,1,10]');
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[903]');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":10,"expand":false}',
      );
      expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed');
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('moves focus from a vanished rule box to the group\'s first remaining one', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901, archived: false });
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      await renderLoaded();
      fireEvent.click(screen.getByText('focus-rulebox-10'));
      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":10,"ruleKey":"${defaultRuleKey}"}`);

      await clickAndSettle('remove-sub-a-chip', reads);

      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":10,"ruleKey":"${rule80Key}"}`);
    });

    it('focuses the neighbor group when the removal cascades the group away', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901, archived: false });
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderLoaded();
      fireEvent.click(screen.getByText('focus-group-10'));

      await clickAndSettle('remove-sub-a-chip', reads);

      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":11,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":11,"expand":true}',
      );
    });

    it('requests the empty state when the removal cascades away the last group', async () => {
      axiosMock.onDelete(apiUrls.deleteCompetencyCriterion(tagId, 900)).reply(200, { id: 900, archived: false });
      const reads = mockGroupsReads(singleGroupResponse, noGroupsResponse);
      await renderLoaded();
      fireEvent.click(screen.getByText('focus-group-10'));

      await clickAndSettle('remove-existing-sub', reads, apiUrls.deleteCompetencyCriterion(tagId, 900));

      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('{"kind":"empty"}');
    });

    it('treats a 404 as success when the refetch no longer has the criterion: no failure, focus returns to the group', async () => {
      axiosMock.onDelete(deleteUrl).reply(404);
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      await renderLoaded();
      fireEvent.click(screen.getByText('focus-group-10'));

      await clickAndSettle('remove-sub-a-chip', reads);

      expect(mockShowToast).not.toHaveBeenCalled();
      expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed');
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[903]');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":10,"expand":false}',
      );
    });

    it('keeps the dialog open on a 404 when the refetch still has the criterion', async () => {
      axiosMock.onDelete(deleteUrl).reply(404);
      const reads = mockGroupsReads(twoBoxesInGroupResponse, twoBoxesInGroupResponse);
      await renderLoaded();

      await clickAndSettle('remove-sub-a-chip', reads);

      await waitFor(() => {
        expect(screen.getByTestId('pending-removal')).toHaveTextContent(
          '{"kind":"association","failure":"nothing-removed"}',
        );
      });
      expect(mockShowToast).not.toHaveBeenCalled();
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[901,903]');
    });

    it.each(['remove-sub-a-chip', 'remove-sub-a-subsection'])(
      'keeps the dialog open on a failure from %s and requests no keyboard focus, since the association is still there',
      async (requestLabel) => {
        axiosMock.onDelete(deleteUrl).reply(500);
        const reads = mockGroupsReads(twoBoxesInGroupResponse, twoBoxesInGroupResponse);
        await renderLoaded();
        fireEvent.click(screen.getByText('focus-group-10'));

        await clickAndSettle(requestLabel, reads);

        await waitFor(() => {
          expect(screen.getByTestId('pending-removal')).toHaveTextContent(
            '{"kind":"association","failure":"nothing-removed"}',
          );
        });
        expect(mockShowToast).not.toHaveBeenCalled();
        expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[901,903]');
        expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('null');
      },
    );

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

    it('requests keyboard focus for the subsection row when the removal came from Browse Courses', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901, archived: false });
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      await renderLoaded();
      fireEvent.click(screen.getByText('focus-group-10'));

      await clickAndSettle('remove-sub-a-subsection', reads);

      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"subsection","objectId":"sub-a"}',
      );
    });

    it('blocks a group removal request while a removal is in flight', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901, archived: false });
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderLoaded();

      requestAndConfirm('remove-sub-a-chip');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      fireEvent.click(screen.getByText('request-remove-group-11'));
      expect(screen.getByTestId('pending-removal')).toHaveTextContent('{"kind":"association","failure":null}');
      await act(async () => {
        reads.release();
      });
      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));

      expect(axiosMock.history.delete).toHaveLength(1);
      expect(axiosMock.history.delete[0].url).toEqual(deleteUrl);
    });
  });

  describe('requestRemoval, confirmRemoval, cancelRemoval (#786)', () => {
    const deleteUrlOf = (criterionId: number) => apiUrls.deleteCompetencyCriterion(tagId, criterionId);
    const sentDeleteUrls = () => axiosMock.history.delete.map((request) => request.url);
    const mockDeletes = (...criterionIds: number[]) => {
      criterionIds.forEach((id) => {
        axiosMock.onDelete(deleteUrlOf(id)).reply(200, { id, archived: false });
      });
    };
    const sentWrites = () => (
      axiosMock.history.delete.length + axiosMock.history.patch.length + axiosMock.history.post.length
    );
    const summary = () => JSON.parse(screen.getByTestId('pending-summary').textContent ?? 'null');
    const namedOutline = buildOutlineIndex({
      sections: [{
        id: 'section-1',
        displayName: 'Section 1',
        children: [
          { id: 'sub-901', displayName: 'Quiz 901' },
          { id: 'sub-905', displayName: 'Quiz 905' },
          { id: 'sub-906', displayName: 'Quiz 906' },
          { id: 'sub-903', displayName: 'Quiz 903' },
        ],
      }],
    });

    const renderLoaded = async () => {
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
      await waitFor(() => expect(screen.getByTestId('accessible-course-group-ids')).toHaveTextContent(courseA));
    };

    it('opens the confirmation with the names read from the course outline, and sends nothing', async () => {
      mockGroupsReads(boxOfThreeResponse, boxOfThreeResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, namedOutline);
      await renderLoaded();

      await userEvent.click(screen.getByText('delete-rule-box-10-70'));

      expect(screen.getByTestId('pending-removal')).toHaveTextContent('{"kind":"ruleBox","failure":null}');
      expect(summary()).toEqual({
        kind: RemovalTargetKind.RuleBox,
        contentNames: ['Quiz 901', 'Quiz 905', 'Quiz 906'],
        otherRuleCount: 1,
        courseName: 'Test Course',
        isOnlyGroupInCourse: true,
      });
      expect(sentWrites()).toBe(0);
    });

    it('describes a whole course group by its association count and course name', async () => {
      mockGroupsReads(boxOfThreeResponse, boxOfThreeResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, namedOutline);
      await renderLoaded();

      await userEvent.click(screen.getByText('request-remove-course-group-1'));

      expect(summary()).toEqual({
        kind: RemovalTargetKind.CourseGroup,
        associationCount: 4,
        courseName: 'Test Course',
      });
      expect(sentWrites()).toBe(0);
    });

    it('removes a course group, with its refetch, once confirmed', async () => {
      axiosMock.onDelete(apiUrls.updateCompetencyCriteriaGroup(tagId, 1)).reply(200, {});
      const reads = mockGroupsReads(boxOfThreeResponse, noGroupsResponse);
      await renderLoaded();

      await userEvent.click(screen.getByText('request-remove-course-group-1'));
      await userEvent.click(screen.getByText('confirm-removal'));
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed'));
      expect(axiosMock.history.delete.map((request) => request.url)).toEqual([
        apiUrls.updateCompetencyCriteriaGroup(tagId, 1),
      ]);
    });

    it('closes the confirmation on cancel without sending anything', async () => {
      mockGroupsReads(boxOfThreeResponse, boxOfThreeResponse);
      await renderLoaded();
      await userEvent.click(screen.getByText('remove-sub-a-chip'));
      expect(screen.getByTestId('pending-removal')).toHaveTextContent('"kind":"association"');

      await userEvent.click(screen.getByText('cancel-removal'));

      expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed');
      expect(sentWrites()).toBe(0);
    });

    it('sends nothing when confirmed with no removal pending', async () => {
      mockGroupsReads(boxOfThreeResponse, boxOfThreeResponse);
      await renderLoaded();

      await userEvent.click(screen.getByText('confirm-removal'));

      expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed');
      expect(sentWrites()).toBe(0);
    });

    it('drops a request made while a delete is in flight', async () => {
      axiosMock.onDelete(apiUrls.updateCompetencyCriteriaGroup(tagId, 10)).reply(200, {});
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderLoaded();
      requestAndConfirm('delete-group-10');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));

      await userEvent.click(screen.getByText('remove-sub-a-chip'));

      expect(screen.getByTestId('pending-removal')).toHaveTextContent('{"kind":"ruleGroup","failure":null}');
      await act(async () => {
        reads.release();
      });
      await waitFor(() => expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed'));
      expect(axiosMock.history.delete).toHaveLength(1);
    });

    it('stays closed, and toasts the failure, when the author cancels while the request runs and then it fails', async () => {
      axiosMock.onDelete(apiUrls.updateCompetencyCriteriaGroup(tagId, 10)).reply(500);
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, twoGroupsWithCriteriaResponse);
      await renderLoaded();
      requestAndConfirm('delete-group-10');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));

      await userEvent.click(screen.getByText('cancel-removal'));
      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));
      expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed');
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'The removal you confirmed didn\'t go through. The panel was refreshed.',
        );
      });
    });

    it.each([
      {
        name: 'a rule group',
        requestLabel: 'delete-group-10',
        kind: RemovalTargetKind.RuleGroup,
        initial: twoGroupsWithCriteriaResponse,
        refetched: afterDeletingGroup10Response,
        mock: () => axiosMock.onDelete(apiUrls.updateCompetencyCriteriaGroup(tagId, 10)).reply(200, {}),
        urls: [apiUrls.updateCompetencyCriteriaGroup(tagId, 10)],
      },
      {
        name: 'an association',
        requestLabel: 'remove-sub-a-chip',
        kind: RemovalTargetKind.Association,
        initial: twoBoxesInGroupResponse,
        refetched: afterRemovingSubAResponse,
        mock: () => mockDeletes(901),
        urls: [deleteUrlOf(901)],
      },
      {
        name: 'a rule box',
        requestLabel: 'delete-rule-box-10-70',
        kind: RemovalTargetKind.RuleBox,
        initial: boxOfThreeResponse,
        refetched: withoutCriteria(boxOfThreeResponse, [901, 905, 906]),
        mock: () => mockDeletes(901, 905, 906, 903),
        urls: [deleteUrlOf(901), deleteUrlOf(905), deleteUrlOf(906)],
      },
    ])(
      'sends one request for $name confirmed twice, and keeps the dialog open and the page blocked until the refetch lands',
      async ({ requestLabel, kind, initial, refetched, mock, urls }) => {
        mock();
        const reads = mockGroupsReads(initial, refetched);
        await renderLoaded();

        fireEvent.click(screen.getByText(requestLabel));
        fireEvent.click(screen.getByText('confirm-removal-twice'));
        await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));
        fireEvent.click(screen.getByText('request-remove-group-11'));

        expect(screen.getByTestId('is-deleting')).toHaveTextContent('true');
        expect(screen.getByTestId('pending-removal')).toHaveTextContent(`{"kind":"${kind}","failure":null}`);
        await act(async () => {
          reads.release();
        });

        await waitFor(() => expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed'));
        expect(sentDeleteUrls()).toEqual(urls);
      },
    );

    it('closes the dialog when a group DELETE fails but the refetch no longer has the group', async () => {
      axiosMock.onDelete(apiUrls.updateCompetencyCriteriaGroup(tagId, 10)).reply(500);
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderLoaded();
      requestAndConfirm('delete-group-10');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));

      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed'));
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('closes the dialog when a rule box DELETE fails but the refetch has none of its criteria left', async () => {
      mockDeletes(901, 905, 906, 903);
      axiosMock.onDelete(deleteUrlOf(906)).reply(500);
      const reads = mockGroupsReads(boxOfThreeResponse, withoutCriteria(boxOfThreeResponse, [901, 905, 906]));
      await renderLoaded();
      requestAndConfirm('delete-rule-box-10-70');
      await waitFor(() => expect(axiosMock.history.get.filter((req) => req.url === groupsUrl)).toHaveLength(2));

      await act(async () => {
        reads.release();
      });

      await waitFor(() => expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed'));
    });

    it('closes the dialog when an association DELETE succeeds but the refetch fails', async () => {
      axiosMock.onDelete(deleteUrlOf(901)).reply(200, { id: 901, archived: false });
      axiosMock.onGet(groupsUrl).replyOnce(200, twoBoxesInGroupResponse);
      axiosMock.onGet(groupsUrl).reply(500);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      await renderLoaded();

      requestAndConfirm('remove-sub-a-chip');

      await waitFor(() => expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed'));
      expect(screen.getByTestId('is-deleting')).toHaveTextContent('false');
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('closes an open dialog when the competency changes', async () => {
      mockGroupsReads(boxOfThreeResponse, boxOfThreeResponse);
      axiosMock.onGet(apiUrls.competencyCriteriaGroups(43)).reply(200, noGroupsResponse);
      const { rerender } = renderProvider();
      await waitFor(() => expect(screen.getByTestId('accessible-course-group-ids')).toHaveTextContent(courseA));
      await userEvent.click(screen.getByText('request-remove-course-group-1'));
      expect(screen.getByTestId('pending-removal')).toHaveTextContent('"kind":"courseGroup"');

      rerender(
        <CompetencyAssociationsProvider tagId={43} competencyName="Other" competencyExternalId={null}>
          <TestConsumer />
        </CompetencyAssociationsProvider>,
      );

      expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed');
    });

    it('lets a retry send only what is left after a partial failure', async () => {
      mockDeletes(901, 906, 903);
      axiosMock.onDelete(deleteUrlOf(905)).replyOnce(500);
      axiosMock.onDelete(deleteUrlOf(905)).reply(200, { id: 905, archived: false });
      axiosMock.onGet(groupsUrl).replyOnce(200, boxOfThreeResponse);
      axiosMock.onGet(groupsUrl).replyOnce(200, withoutCriteria(boxOfThreeResponse, [901]));
      axiosMock.onGet(groupsUrl).reply(200, withoutCriteria(boxOfThreeResponse, [901, 905, 906]));
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, namedOutline);
      await renderLoaded();

      await userEvent.click(screen.getByText('delete-rule-box-10-70'));
      await userEvent.click(screen.getByText('confirm-removal'));
      await waitFor(() => {
        expect(screen.getByTestId('pending-removal')).toHaveTextContent(
          '{"kind":"ruleBox","failure":"partly-removed"}',
        );
      });
      expect(summary().contentNames).toEqual(['Quiz 905', 'Quiz 906']);
      expect(screen.getByTestId('is-deleting')).toHaveTextContent('false');

      await userEvent.click(screen.getByText('confirm-removal'));
      await waitFor(() => expect(screen.getByTestId('pending-removal')).toHaveTextContent('closed'));
      await waitFor(() => expect(screen.getByTestId('is-deleting')).toHaveTextContent('false'));

      expect(sentDeleteUrls()).toEqual([deleteUrlOf(901), deleteUrlOf(905), deleteUrlOf(905), deleteUrlOf(906)]);
      expect(screen.getByTestId('criterion-ids')).toHaveTextContent('[903]');
      expect(mockShowToast).not.toHaveBeenCalled();
    });
  });

  describe('removePlaceholderGroup', () => {
    it('sends no request, and focuses the last saved group of the placeholder\'s course with a keyboard request', async () => {
      axiosMock.onGet(groupsUrl).reply(200, twoGroupsWithCriteriaResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
      fireEvent.click(screen.getByText('add-placeholder-group-1'));
      expect(screen.getByTestId('focus')).toHaveTextContent('{"groupId":null,"ruleKey":null}');

      fireEvent.click(screen.getByText('remove-placeholder-group'));

      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":11,"ruleKey":"${defaultRuleKey}"}`);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":11,"expand":true}',
      );
      expect(axiosMock.history.delete).toHaveLength(0);
      expect(axiosMock.history.patch).toHaveLength(0);
      expect(axiosMock.history.post).toHaveLength(0);
    });

    it('clears focus, with no keyboard request, when the placeholder\'s course group has no saved group', async () => {
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

      expect(screen.getByTestId('focus')).toHaveTextContent('null');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('null');
    });
  });

  describe('removePlaceholderRuleBox', () => {
    const renderLoaded = async (response: CompetencyCriteriaGroupsResponse) => {
      axiosMock.onGet(groupsUrl).reply(200, response);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(getCourseOutlineIndexApiUrl(courseA)).reply(200, outlineFixture);
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('groups-status')).toHaveTextContent('groups-success'));
    };

    const renderWithPlaceholderRuleBox = async (response: CompetencyCriteriaGroupsResponse) => {
      await renderLoaded(response);
      await userEvent.click(screen.getByText('add-placeholder-rule-10'));
      expect(screen.getByTestId('focus')).toHaveTextContent('{"groupId":10,"ruleKey":null}');
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('true');
    };

    it('sends no request, and focuses the group\'s last saved box with a keyboard request', async () => {
      await renderWithPlaceholderRuleBox(twoBoxesInGroupResponse);

      await userEvent.click(screen.getByText('remove-placeholder-rule-box'));

      expect(screen.getByTestId('focus')).toHaveTextContent(`{"groupId":10,"ruleKey":"${rule80Key}"}`);
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('false');
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent(
        '{"kind":"group","groupId":10,"expand":false}',
      );
      expect(axiosMock.history.delete).toHaveLength(0);
      expect(axiosMock.history.patch).toHaveLength(0);
      expect(axiosMock.history.post).toHaveLength(0);
    });

    it('clears focus when the group has no saved box to return to', async () => {
      await renderWithPlaceholderRuleBox(twoGroupsResponse);

      await userEvent.click(screen.getByText('remove-placeholder-rule-box'));

      expect(screen.getByTestId('focus')).toHaveTextContent('null');
      expect(screen.getByTestId('has-placeholder')).toHaveTextContent('false');
    });

    it('does nothing when no placeholder rule box is focused', async () => {
      await renderLoaded(twoBoxesInGroupResponse);
      await userEvent.click(screen.getByText('focus-rulebox-10'));
      const focusBefore = screen.getByTestId('focus').textContent;

      await userEvent.click(screen.getByText('remove-placeholder-rule-box'));

      expect(screen.getByTestId('focus').textContent).toEqual(focusBefore);
      expect(screen.getByTestId('keyboard-focus-request')).toHaveTextContent('null');
    });
  });
});
