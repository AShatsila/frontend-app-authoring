import { memo, useState } from 'react';
import type { ReactNode } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { Error as ErrorIcon, InfoOutline } from '@openedx/paragon/icons';
import * as authzApi from '@src/authz/data/api';
import { mockWaffleFlags } from '@src/data/apiHooks.mock';
import { buildOutlineIndex } from '@src/course-outline/__mocks__';
import { getCourseOutlineIndexApiUrl } from '@src/course-outline/data';
import { courseOutlineQueryKeys } from '@src/course-outline/data/queryKeys';
import {
  act,
  initializeMocks,
  render,
  screen,
  userEvent,
  waitFor,
} from '@src/testUtils';
import {
  courseA,
  courseB,
  courseBGroupsResponse,
  courseOther,
  criterion,
  defaultProfileResponse as profileResponse,
  eqRule,
  gteRule,
  noGroupsResponse,
  otherSingleGroupResponse,
  singleGroupResponse,
  tagId,
  twoCoursesResponse,
  twoGroupsResponse,
} from './__mocks__';
import { CompetencyAssociationsProvider, useCompetencyAssociations } from './CompetencyAssociationsContext';
import { apiUrls } from './data/api';
import { competencyQueryKeys } from './data/apiHooks';
import type { GradeRulePayload } from './data/types';

let axiosMock: ReturnType<typeof initializeMocks>['axiosMock'];
let mockShowToast: ReturnType<typeof initializeMocks>['mockShowToast'];
let queryClient: ReturnType<typeof initializeMocks>['queryClient'];
let user: ReturnType<typeof userEvent.setup>;

const otherTagId = 43;
const gteKey = 'grade:gte:0.7:percent';
const eqKey = 'grade:eq:1:percent';

const groupsUrl = apiUrls.competencyCriteriaGroups(tagId);
const otherGroupsUrl = apiUrls.competencyCriteriaGroups(otherTagId);
const profileUrl = apiUrls.defaultCompetencyRuleProfile();
const createUrl = apiUrls.createCompetencyCriterion(tagId);
/** `twoGroupsResponse`'s two leaf groups, each holding one default-rule criterion. */
const twoGroupsWithCriteriaResponse = {
  ...twoGroupsResponse,
  criteria: [criterion(901, 'sub-a', 10), criterion(902, 'sub-b', 11)],
};

/** `twoGroupsWithCriteriaResponse` after group 10 was deleted. */
const afterDeletingGroup10Response = {
  groups: twoGroupsWithCriteriaResponse.groups.filter((group) => group.id !== 10),
  criteria: twoGroupsWithCriteriaResponse.criteria.filter((item) => item.groupId !== 10),
};

/** Course A (group 10) and course B (group 20), each leaf holding one default-rule criterion. */
const twoCoursesWithCriteriaResponse = {
  ...twoCoursesResponse,
  criteria: [criterion(901, 'sub-a', 10), criterion(902, 'sub-b', 20)],
};

/** Group 10 holds two criteria (`sub-a` at the default 70%, `sub-c` at 80%), so each is its own rule box. */
const twoBoxesInGroupResponse = {
  ...singleGroupResponse,
  criteria: [
    criterion(901, 'sub-a', 10),
    criterion(903, 'sub-c', 10, {
      ruleProfileId: null,
      ruleTypeOverride: 'grade',
      rulePayloadOverride: { op: 'gte', value: 0.8, scale: 'percent' },
    }),
  ],
};

/** `twoBoxesInGroupResponse` after `sub-a` was removed. */
const afterRemovingSubAResponse = {
  ...twoBoxesInGroupResponse,
  criteria: twoBoxesInGroupResponse.criteria.filter((item) => item.id !== 901),
};

const courseAOutlineUrl = getCourseOutlineIndexApiUrl(courseA);
const courseBOutlineUrl = getCourseOutlineIndexApiUrl(courseB);
const updateGroupOperatorUrl = apiUrls.updateCompetencyCriteriaGroup(tagId, 10);
const updateRuleScoreUrl = apiUrls.updateCompetencyCriteriaRule(10);

const outlineFixture = buildOutlineIndex();

const createFailedMessage = 'There was a problem creating this association. Please try again.';

/** The body of a 201 from the create endpoint: an override rule when `rule` is
 * given, otherwise the default profile.
 */
const createdCriterion = (groupId: number, rule?: GradeRulePayload) => ({
  id: 920,
  group_id: groupId,
  rule_profile_id: rule ? null : 1,
  rule_type_override: rule ? 'grade' : null,
  rule_payload_override: rule ?? null,
  object_tag_id: tagId,
});

const deferred = () => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { released, release };
};

/** Renders every context value as text and every action as a button. */
const TestConsumer = () => {
  const ctx = useCompetencyAssociations();
  const actions: Array<[string, () => void]> = [
    ['Focus group 999', () => ctx.focusGroup(999)],
    ['Focus group 10', () => ctx.focusGroup(10)],
    ['Focus group 20', () => ctx.focusGroup(20)],
    ['Focus group 21', () => ctx.focusGroup(21)],
    ['Focus rule box 10 gte', () => ctx.focusRuleBox(10, gteKey)],
    ['Focus rule box 21 gte', () => ctx.focusRuleBox(21, gteKey)],
    ['Expand course A', () => ctx.notifyCourseExpanded(courseA)],
    ['Expand course B', () => ctx.notifyCourseExpanded(courseB)],
    ['Associate in course A', () => ctx.associateSubsection('new-sub', courseA)],
    ['Associate in course B', () => ctx.associateSubsection('new-sub', courseB)],
    ['Associate in another course', () => ctx.associateSubsection('new-sub', courseOther)],
    ['Associate duplicate', () => ctx.associateSubsection('existing-sub', courseA)],
    ['Discard placeholder', () => ctx.discardPlaceholder()],
    ['Focus group 11', () => ctx.focusGroup(11)],
    ['Delete group 10', () => ctx.deleteGroup(10)],
    ['Delete group 20', () => ctx.deleteGroup(20)],
    ['Remove placeholder group', () => ctx.removePlaceholderGroup()],
    ['Remove existing-sub chip', () => ctx.removeAssociation(900, 'group')],
    ['Remove sub-a chip', () => ctx.removeAssociation(901, 'group')],
    ['Remove criterion 902', () => ctx.removeAssociation(902, 'group')],
    ['Remove sub-a from browse', () => ctx.removeAssociation(901, 'subsection')],
    [
      'Remove sub-a twice',
      () => {
        ctx.removeAssociation(901, 'group');
        ctx.removeAssociation(901, 'group');
      },
    ],
    ['Add placeholder rule box in group 10', () => ctx.addPlaceholderRuleBox(10)],
    ['Add placeholder group under course A', () => ctx.addPlaceholderGroup(1)],
    ['Set placeholder logic operator to AND', () => ctx.setPlaceholderLogicOperator('AND')],
    ['Set placeholder score', () => ctx.setPlaceholderRulePayload({ op: 'gte', value: 0.85, scale: 'percent' })],
    [
      'Update group operator',
      // The rejection is covered by the no-toast assertion, so it is swallowed here to avoid an unhandled rejection.
      () => {
        ctx.updateGroupOperator(10, 'OR').catch(() => {});
      },
    ],
    [
      'Update rule score',
      // The rejection is covered by the toast assertion, so it is swallowed here to avoid an unhandled rejection.
      () => {
        ctx.updateRuleScore(10, [900], { op: 'gte', value: 0.8, scale: 'percent' }).catch(() => {});
      },
    ],
    [
      'Associate two in one tick',
      () => {
        ctx.associateSubsection('first-sub', courseA);
        ctx.associateSubsection('second-sub', courseA);
      },
    ],
  ];
  return (
    <div>
      <p>Focus: {ctx.focus ? `group ${ctx.focus.groupId}, rule ${ctx.focus.ruleKey ?? 'none'}` : 'none'}</p>
      <p>Status: {ctx.status}</p>
      <p>Has placeholder: {String(ctx.hasPlaceholder)}</p>
      <p>Deleting: {String(ctx.isDeleting)}</p>
      <p>
        Criterion ids: {JSON.stringify(
          ctx.groupsIndex?.criteriaByGroupId && [...ctx.groupsIndex.criteriaByGroupId.values()].flat().map((c) => c.id),
        )}
      </p>
      <p>Keyboard request: {JSON.stringify(ctx.keyboardFocusRequest)}</p>
      <p>Duplicate rejected: {String(ctx.placeholderDuplicateRejected)}</p>
      <p>Placeholder: {JSON.stringify(ctx.placeholder)}</p>
      <p>Error: {ctx.error?.message ?? 'none'}</p>
      <p>Associating: {String(ctx.isAssociating)}</p>
      <p>Course A expansions: {ctx.expansionCountByCourseId[courseA] ?? 0}</p>
      <p>Groups index: {ctx.groupsIndex ? 'loaded' : 'missing'}</p>
      <p>Competency: {String(ctx.competencyExternalId)}</p>
      <p>Can edit course B: {String(ctx.canEditCourse(courseB))}</p>
      <p>Can edit another course: {String(ctx.canEditCourse(courseOther))}</p>
      <ul aria-label="Associated object ids">
        {Array.from(ctx.associatedObjectIds).map((id) => <li key={id}>{id}</li>)}
      </ul>
      <ul aria-label="Accessible courses">
        {ctx.accessibleCourseGroups.map((courseGroup) => <li key={courseGroup.id}>{courseGroup.courseKey}</li>)}
      </ul>
      {actions.map(([label, onClick]) => <button key={label} type="button" onClick={onClick}>{label}</button>)}
    </div>
  );
};

const providerFor = (id: number, children: ReactNode = <TestConsumer />) => (
  <CompetencyAssociationsProvider tagId={id} competencyName="Competency" competencyExternalId="CCRS-1.3">
    {children}
  </CompetencyAssociationsProvider>
);

const renderProvider = () => render(providerFor(tagId));

const click = (name: string) => user.click(screen.getByRole('button', { name }));

const waitForSuccess = () => screen.findByText('Status: success');
const accessibleCourses = () => screen.getByRole('list', { name: 'Accessible courses' });
const noFocus = () => screen.getByText('Focus: none');
const focusOnGroup = (groupId: number) => new RegExp(`^Focus: group ${groupId},`);
const focusOn = (groupId: number, ruleKey: string | null) => `Focus: group ${groupId}, rule ${ruleKey ?? 'none'}`;

/** Lets effects and the state updates they dispatch run to completion. */
const flushEffects = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  });

const expectSinglePost = async (body: object) => {
  await waitFor(() => expect(axiosMock.history.post).toHaveLength(1));
  expect(JSON.parse(axiosMock.history.post[0].data)).toEqual(body);
};

const expectToast = (message: string, icon: unknown) => {
  expect(mockShowToast).toHaveBeenCalledWith(message, undefined, undefined, icon);
};

describe('CompetencyAssociationsProvider', () => {
  beforeEach(() => {
    ({ axiosMock, mockShowToast, queryClient } = initializeMocks());
    user = userEvent.setup();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initial focus', () => {
    it('focuses the sole bottom-tier group once the groups query and every visible course outline resolve', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      renderProvider();

      expect(await screen.findByText(focusOn(10, gteKey))).toBeInTheDocument();
    });

    it('leaves focus unset when more than one bottom-tier group exists across visible course groups', async () => {
      axiosMock.onGet(groupsUrl).reply(200, twoGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      renderProvider();

      await waitForSuccess();
      await flushEffects();
      expect(noFocus()).toBeInTheDocument();
    });

    it('leaves focus unset when there are no visible course-level groups', async () => {
      axiosMock.onGet(groupsUrl).reply(200, noGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      renderProvider();

      await waitForSuccess();
      expect(noFocus()).toBeInTheDocument();
    });

    it('keeps a click made before the data resolves instead of auto-focusing the sole group (10)', async () => {
      const outlineGate = deferred();
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(() => outlineGate.released.then(() => [200, outlineFixture]));
      renderProvider();

      await click('Focus group 999');
      expect(screen.getByText(focusOnGroup(999))).toBeInTheDocument();

      await act(async () => {
        outlineGate.release();
      });
      await waitForSuccess();

      expect(screen.getByText(focusOnGroup(999))).toBeInTheDocument();
    });
  });

  describe('accessibleCourseGroups', () => {
    it.each([403, 404])(
      'excludes a course-level group whose own outline fetch fails with %s, keeping a sibling course\'s group',
      async (outlineStatus) => {
        axiosMock.onGet(groupsUrl).reply(200, twoCoursesResponse);
        axiosMock.onGet(profileUrl).reply(200, profileResponse);
        axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
        axiosMock.onGet(courseBOutlineUrl).reply(outlineStatus);
        renderProvider();

        await waitFor(() => expect(accessibleCourses()).toHaveTextContent(courseA));
        expect(accessibleCourses()).not.toHaveTextContent(courseB);
        expect(screen.getByText('Status: success')).toBeInTheDocument();
        expect(screen.getByText('Error: none')).toBeInTheDocument();
      },
    );

    it.each([
      ['a 500', () => axiosMock.onGet(courseBOutlineUrl).reply(500), /500/],
      ['a network error', () => axiosMock.onGet(courseBOutlineUrl).networkError(), /Network Error/],
    ])(
      'reports an error when a course outline fetch fails with %s',
      async (_description, failCourseBOutline, errorMessage) => {
        axiosMock.onGet(groupsUrl).reply(200, twoCoursesResponse);
        axiosMock.onGet(profileUrl).reply(200, profileResponse);
        axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
        failCourseBOutline();
        renderProvider();

        await screen.findByText('Status: error');
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
        expect(accessibleCourses()).not.toHaveTextContent(courseB);
      },
    );

    it('reports an error when a course outline refetch fails after the status was success', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).replyOnce(200, outlineFixture).onGet(courseAOutlineUrl).reply(500);
      renderProvider();
      await waitForSuccess();

      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: courseOutlineQueryKeys.index(courseA) });
      });

      await screen.findByText('Status: error');
      expect(screen.getByText(/^Error: .*500/)).toBeInTheDocument();
    });

    it('excludes every course-level group and auto-focuses nothing when every course outline fails', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(403);
      renderProvider();

      await waitForSuccess();
      await flushEffects();
      expect(accessibleCourses()).toBeEmptyDOMElement();
      expect(noFocus()).toBeInTheDocument();
    });

    it('does not count a course whose outline is still loading as accessible, and stays pending', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(() => new Promise(() => {}));
      renderProvider();

      await waitFor(() => {
        expect(axiosMock.history.get.some((req) => req.url === courseAOutlineUrl)).toBe(true);
      });
      await screen.findByText('Groups index: loaded');
      expect(accessibleCourses()).toBeEmptyDOMElement();
      expect(screen.getByText('Status: pending')).toBeInTheDocument();
      expect(noFocus()).toBeInTheDocument();
    });

    it('treats a course whose outline request is paused offline as unresolved', async () => {
      // Goes offline just before the groups resolve and mount the outline queries.
      // The fallback reply is needed because `onlineManager.setOnline(true)` in `finally` refetches groups on reconnect.
      axiosMock.onGet(groupsUrl).replyOnce(() =>
        new Promise((resolve) => {
          setTimeout(() => {
            onlineManager.setOnline(false);
            resolve([200, singleGroupResponse]);
          }, 50);
        })
      ).onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      try {
        renderProvider();

        await screen.findByText('Groups index: loaded');
        await flushEffects(50);
        expect(axiosMock.history.get.some((req) => req.url === courseAOutlineUrl)).toBe(false);
        expect(screen.getByText('Status: pending')).toBeInTheDocument();
        expect(noFocus()).toBeInTheDocument();
      } finally {
        onlineManager.setOnline(true);
      }
    });
  });

  it('stays successful when a groups refetch adds a course whose outline is still loading', async () => {
    const outlineGate = deferred();
    let groupsReply = singleGroupResponse;
    axiosMock.onGet(groupsUrl).reply(() => [200, groupsReply]);
    axiosMock.onGet(profileUrl).reply(200, profileResponse);
    axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
    axiosMock.onGet(courseBOutlineUrl).reply(() => outlineGate.released.then(() => [200, outlineFixture]));
    renderProvider();
    await waitForSuccess();

    groupsReply = twoCoursesResponse;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: competencyQueryKeys.competencyCriteriaGroups(tagId) });
    });
    await waitFor(() => {
      expect(axiosMock.history.get.some((req) => req.url === courseBOutlineUrl)).toBe(true);
    });

    expect(screen.getByText('Status: success')).toBeInTheDocument();
    expect(accessibleCourses()).toHaveTextContent(courseA);
    expect(accessibleCourses()).not.toHaveTextContent(courseB);

    await act(async () => {
      outlineGate.release();
    });
    await waitFor(() => expect(accessibleCourses()).toHaveTextContent(courseB));
    expect(screen.getByText('Status: success')).toBeInTheDocument();
  });

  it('does not delay initial focus when a group-less course is expanded', async () => {
    const outlineGate = deferred();
    axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
    axiosMock.onGet(profileUrl).reply(200, profileResponse);
    axiosMock.onGet(courseAOutlineUrl).reply(() => outlineGate.released.then(() => [200, outlineFixture]));
    renderProvider();

    await click('Expand course B');
    await act(async () => {
      outlineGate.release();
    });

    expect(await screen.findByText(focusOnGroup(10))).toBeInTheDocument();
  });

  it('keeps an expanded group-less course editable after the competency changes', async () => {
    mockWaffleFlags({ enableAuthzCourseAuthoring: true });
    // `initializeMocks` stubs `validateUserPermissions` (the permissions POST) to `{}`.
    jest.spyOn(authzApi, 'validateUserPermissions').mockResolvedValue({ [courseB]: true });
    axiosMock.onGet(groupsUrl).reply(200, noGroupsResponse);
    axiosMock.onGet(otherGroupsUrl).reply(200, noGroupsResponse);
    axiosMock.onGet(profileUrl).reply(200, profileResponse);
    const { rerender } = renderProvider();

    await click('Expand course B');
    await screen.findByText('Can edit course B: true');

    rerender(providerFor(otherTagId));
    await waitForSuccess();

    expect(screen.getByText('Can edit course B: true')).toBeInTheDocument();
  });

  describe('notifyCourseExpanded focus', () => {
    const renderWithCourseB = async () => {
      axiosMock.onGet(groupsUrl).reply(200, courseBGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onGet(courseBOutlineUrl).reply(200, outlineFixture);
      renderProvider();
      await waitForSuccess();
    };

    it('moves focus from course A\'s group to course B\'s last group by ordering (21) and its last rule box', async () => {
      await renderWithCourseB();
      await click('Focus group 10');

      await click('Expand course B');

      expect(screen.getByText(focusOn(21, eqKey))).toBeInTheDocument();
    });

    it('moves focus again when an already-expanded course is expanded after focus went back to another course', async () => {
      await renderWithCourseB();
      await click('Focus group 10');
      await click('Expand course B');
      await click('Focus group 10');

      await click('Expand course B');

      expect(screen.getByText(focusOn(21, eqKey))).toBeInTheDocument();
    });

    it('focuses course B\'s last group by ordering (21) when nothing is focused', async () => {
      await renderWithCourseB();

      await click('Expand course B');

      expect(screen.getByText(focusOnGroup(21))).toBeInTheDocument();
    });

    it('counts every expansion of a course, even one that leaves focus unchanged', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      renderProvider();
      await waitForSuccess();
      expect(screen.getByText('Course A expansions: 0')).toBeInTheDocument();

      await click('Expand course A');
      await click('Expand course A');

      expect(screen.getByText('Course A expansions: 2')).toBeInTheDocument();
      expect(screen.getByText(focusOnGroup(10))).toBeInTheDocument();
    });

    it('leaves focus unchanged when the expanded course has no groups', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      renderProvider();
      await waitForSuccess();
      await click('Focus group 10');

      await click('Expand course B');

      expect(screen.getByText(focusOnGroup(10))).toBeInTheDocument();
    });

    it('leaves focus unchanged when it is already on a group of the expanded course', async () => {
      await renderWithCourseB();
      await click('Focus group 20');
      expect(screen.getByText(focusOn(20, null))).toBeInTheDocument();

      await click('Expand course B');

      expect(screen.getByText(focusOn(20, null))).toBeInTheDocument();
    });

    it('associates into course B\'s last group by ordering (21), the group that expansion focused', async () => {
      await renderWithCourseB();
      axiosMock.onPost(createUrl).reply(201, createdCriterion(21, eqRule));
      await click('Focus group 10');
      await click('Expand course B');

      await click('Associate in course B');

      await expectSinglePost({
        object_id: 'new-sub',
        group_id: 21,
        rule_type_override: 'grade',
        rule_payload_override: eqRule,
      });
    });
  });

  describe('course expanded before the association data loads', () => {
    let releaseGroups: () => void;
    let releaseProfile: () => void;

    /** The groups and profile responses stay pending until `releaseGroups()`
     * and `releaseProfile()` are called.
     */
    const renderWithPendingGroupsAndProfile = ({ courseBOutlineStatus = 200 } = {}) => {
      const groupsGate = deferred();
      const profileGate = deferred();
      releaseGroups = groupsGate.release;
      releaseProfile = profileGate.release;
      axiosMock.onGet(groupsUrl).reply(() => groupsGate.released.then(() => [200, courseBGroupsResponse]));
      axiosMock.onGet(profileUrl).reply(() => profileGate.released.then(() => [200, profileResponse]));
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onGet(courseBOutlineUrl).reply(courseBOutlineStatus, outlineFixture);
      return render(providerFor(tagId));
    };

    const finishLoading = async () => {
      await act(async () => {
        releaseGroups();
        releaseProfile();
      });
      await waitForSuccess();
    };

    it('focuses course B\'s last group by ordering (21) and rule box once the data arrives, and associates into it', async () => {
      renderWithPendingGroupsAndProfile();
      axiosMock.onPost(createUrl).reply(201, createdCriterion(21, eqRule));
      await click('Expand course B');
      expect(noFocus()).toBeInTheDocument();

      await finishLoading();

      expect(screen.getByText(focusOn(21, eqKey))).toBeInTheDocument();
      await click('Associate in course B');
      await expectSinglePost({
        object_id: 'new-sub',
        group_id: 21,
        rule_type_override: 'grade',
        rule_payload_override: eqRule,
      });
    });

    it('keeps the author\'s own pick (10) over the expansion focus (21) when they picked after expanding', async () => {
      renderWithPendingGroupsAndProfile();
      await click('Expand course B');
      await click('Focus group 10');

      await finishLoading();

      expect(screen.getByText(focusOnGroup(10))).toBeInTheDocument();
    });

    it('moves focus to course B\'s last group (21) when an earlier pick (10) also has a stale rule key', async () => {
      renderWithPendingGroupsAndProfile();
      await click('Focus rule box 10 gte');
      await click('Expand course B');

      await finishLoading();

      expect(screen.getByText(focusOn(21, eqKey))).toBeInTheDocument();
    });

    it('focuses course A\'s only group (10) when course A is expanded after course B', async () => {
      renderWithPendingGroupsAndProfile();
      await click('Expand course B');
      await click('Expand course A');

      await finishLoading();

      expect(screen.getByText(focusOnGroup(10))).toBeInTheDocument();
    });

    it('focuses the expanded course\'s last group (21) rather than the sole accessible group (10)', async () => {
      // Course B's outline fails, so auto-focus alone would choose group 10, course A's only leaf.
      renderWithPendingGroupsAndProfile({ courseBOutlineStatus: 403 });
      await click('Expand course B');

      await finishLoading();
      await waitFor(() => expect(accessibleCourses()).toHaveTextContent(courseA));

      expect(screen.getByText(focusOnGroup(21))).toBeInTheDocument();
    });

    it('does not apply a pending expansion to a previously loaded competency it switches to', async () => {
      const { rerender } = renderWithPendingGroupsAndProfile();
      axiosMock.onGet(otherGroupsUrl).reply(200, courseBGroupsResponse);
      rerender(providerFor(otherTagId));
      await act(async () => {
        releaseProfile();
      });
      await waitForSuccess();

      rerender(providerFor(tagId));
      await click('Expand course B');
      rerender(providerFor(otherTagId));

      expect(noFocus()).toBeInTheDocument();
    });

    it('is dropped when the competency changes', async () => {
      const { rerender } = renderWithPendingGroupsAndProfile();
      axiosMock.onGet(otherGroupsUrl).reply(200, courseBGroupsResponse);
      await act(async () => {
        releaseProfile();
      });
      await click('Expand course B');

      rerender(providerFor(otherTagId));
      await waitForSuccess();

      expect(noFocus()).toBeInTheDocument();
    });
  });

  describe('context value', () => {
    it('exposes the loaded tree, the associated ids and the competency external id', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      renderProvider();

      await waitForSuccess();
      expect(screen.getByText('Error: none')).toBeInTheDocument();
      expect(screen.getByText('Groups index: loaded')).toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Associated object ids' })).toHaveTextContent('existing-sub');
      expect(screen.getByText('Competency: CCRS-1.3')).toBeInTheDocument();
      expect(screen.getByText('Associating: false')).toBeInTheDocument();
    });

    it('is pending, without a tree, while the groups request is in flight', async () => {
      axiosMock.onGet(groupsUrl).reply(() => new Promise(() => {}));
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      renderProvider();

      await waitFor(() => expect(axiosMock.history.get.some((req) => req.url === groupsUrl)).toBe(true));
      expect(screen.getByText('Status: pending')).toBeInTheDocument();
      expect(screen.getByText('Groups index: missing')).toBeInTheDocument();
    });

    it('reports an error when the groups request fails', async () => {
      axiosMock.onGet(groupsUrl).reply(500);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      renderProvider();

      await screen.findByText('Status: error');
      expect(screen.getByText(/^Error: .*500/)).toBeInTheDocument();
    });

    it('reports an error and shows the failure toast on associate when the default profile fails', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(500);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      renderProvider();

      await screen.findByText('Status: error');
      expect(screen.getByText(/^Error: .*500/)).toBeInTheDocument();

      await click('Associate in course A');

      expectToast(createFailedMessage, ErrorIcon);
      await flushEffects();
      expect(axiosMock.history.post).toHaveLength(0);
    });

    it('does not re-render a memoized consumer when the provider re-renders', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      let probeRenders = 0;
      const Probe = memo(() => {
        useCompetencyAssociations();
        probeRenders += 1;
        return null;
      });
      const Parent = () => {
        const [, setCount] = useState(0);
        return providerFor(
          tagId,
          <>
            <TestConsumer />
            <Probe />
            <button type="button" onClick={() => setCount((count) => count + 1)}>Re-render provider</button>
          </>,
        );
      };
      render(<Parent />);
      await screen.findByText(focusOnGroup(10));
      const rendersBefore = probeRenders;

      await click('Re-render provider');

      expect(probeRenders).toBe(rendersBefore);
    });
  });

  describe('canEditCourse', () => {
    it('is false for a course that has no group and was never expanded', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      renderProvider();
      await click('Expand course B');

      await screen.findByText('Can edit course B: true');
      expect(screen.getByText('Can edit another course: false')).toBeInTheDocument();
    });
  });

  describe('focusGroup', () => {
    it('keeps the selected rule box when the already-focused group is focused again', async () => {
      axiosMock.onGet(groupsUrl).reply(200, courseBGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onGet(courseBOutlineUrl).reply(200, outlineFixture);
      renderProvider();
      await waitForSuccess();
      await click('Focus group 21');
      expect(screen.getByText(focusOn(21, eqKey))).toBeInTheDocument();
      await click('Focus rule box 21 gte');
      expect(screen.getByText(focusOn(21, gteKey))).toBeInTheDocument();

      await click('Focus group 21');

      expect(screen.getByText(focusOn(21, gteKey))).toBeInTheDocument();
    });

    it('moves focus to the rule box\'s own group when a rule box of another group is focused', async () => {
      axiosMock.onGet(groupsUrl).reply(200, courseBGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onGet(courseBOutlineUrl).reply(200, outlineFixture);
      renderProvider();
      await waitForSuccess();
      await click('Focus group 10');

      await click('Focus rule box 21 gte');

      expect(screen.getByText(focusOn(21, gteKey))).toBeInTheDocument();
    });
  });

  describe('when the focused rule key matches none of the focused group\'s rule boxes', () => {
    const groupsWithRule = (rule: GradeRulePayload | null) => ({
      ...singleGroupResponse,
      criteria: rule
        ? [
          criterion(900, 'existing-sub', 10, {
            ruleProfileId: null,
            ruleTypeOverride: 'grade',
            rulePayloadOverride: rule,
          }),
        ]
        : [],
    });
    let groupsReply: typeof singleGroupResponse;

    const refetchGroupsAs = async (reply: typeof singleGroupResponse) => {
      groupsReply = reply;
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: competencyQueryKeys.competencyCriteriaGroups(tagId) });
      });
    };

    beforeEach(() => {
      groupsReply = singleGroupResponse;
      axiosMock.onGet(groupsUrl).reply(() => [200, groupsReply]);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
    });

    it('moves focus to the group\'s last rule box and creates into it', async () => {
      axiosMock.onPost(createUrl).reply(201, createdCriterion(10, eqRule));
      renderProvider();
      await screen.findByText(focusOn(10, gteKey));

      await refetchGroupsAs(groupsWithRule(eqRule));

      expect(await screen.findByText(focusOn(10, eqKey))).toBeInTheDocument();
      await click('Associate in course A');
      await expectSinglePost({
        object_id: 'new-sub',
        group_id: 10,
        rule_type_override: 'grade',
        rule_payload_override: eqRule,
      });
    });

    it('keeps the group focused with no rule box when it has none left, and creates into it', async () => {
      axiosMock.onPost(createUrl).reply(201, createdCriterion(10));
      renderProvider();
      await screen.findByText(focusOn(10, gteKey));

      await refetchGroupsAs(groupsWithRule(null));

      expect(await screen.findByText(focusOn(10, null))).toBeInTheDocument();
      await click('Associate in course A');
      await expectSinglePost({ object_id: 'new-sub', group_id: 10 });
    });

    // Unlike "focuses the response's group and rule after a successful create", whose group 999 is absent from the
    // tree so re-resolution never runs, this refetches a tree containing the new box and checks focus stays on it.
    it('keeps focus on the rule box a create just added to the focused group', async () => {
      axiosMock.onPost(createUrl).reply(() => {
        groupsReply = {
          ...singleGroupResponse,
          criteria: [
            ...singleGroupResponse.criteria,
            criterion(920, 'new-sub', 10, {
              ruleProfileId: null,
              ruleTypeOverride: 'grade',
              rulePayloadOverride: eqRule,
            }),
          ],
        };
        return [201, createdCriterion(10, eqRule)];
      });
      renderProvider();
      await screen.findByText(focusOn(10, gteKey));

      await click('Associate in course A');

      expect(await screen.findByText(focusOn(10, eqKey))).toBeInTheDocument();
      await flushEffects();
      expect(screen.getByText(focusOn(10, eqKey))).toBeInTheDocument();
    });
  });

  describe('switching competencies', () => {
    it('is pending again while the new competency\'s data loads, after the previous one succeeded', async () => {
      const otherGroupsGate = deferred();
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(otherGroupsUrl).reply(() => otherGroupsGate.released.then(() => [200, otherSingleGroupResponse]));
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      const { rerender } = renderProvider();
      await waitForSuccess();

      rerender(providerFor(otherTagId));
      await screen.findByText('Status: pending');

      await act(async () => {
        otherGroupsGate.release();
      });
      await waitForSuccess();
    });

    it('resets focus and re-arms the auto-focus when both competencies\' trees are already cached', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(otherGroupsUrl).reply(200, otherSingleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      const { rerender } = renderProvider();
      await screen.findByText(focusOnGroup(10));
      rerender(providerFor(otherTagId));
      await screen.findByText(focusOnGroup(30));

      rerender(providerFor(tagId));

      expect(await screen.findByText(focusOnGroup(10))).toBeInTheDocument();
    });
  });

  describe('placeholders', () => {
    const placeholderScore = { op: 'gte', value: 0.85, scale: 'percent' };

    const renderLoaded = async (groups = singleGroupResponse) => {
      axiosMock.onGet(groupsUrl).reply(200, groups);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onGet(courseBOutlineUrl).reply(200, outlineFixture);
      renderProvider();
      await waitForSuccess();
    };

    it('adding a rule box focuses the group with no rule key', async () => {
      await renderLoaded();

      await click('Add placeholder rule box in group 10');

      expect(screen.getByText(focusOn(10, null))).toBeInTheDocument();
      expect(screen.getByText('Has placeholder: true')).toBeInTheDocument();
    });

    it('adding a group replaces a placeholder rule box, since focus has one slot', async () => {
      await renderLoaded();
      await click('Add placeholder rule box in group 10');

      await click('Add placeholder group under course A');

      expect(screen.getByText('Focus: group null, rule none')).toBeInTheDocument();
      expect(screen.getByText(/"parentRuleGroupId":1,"logicOperator":"OR"/)).toBeInTheDocument();
    });

    it('focusing a real group clears the placeholder', async () => {
      await renderLoaded(courseBGroupsResponse);
      await click('Add placeholder rule box in group 10');
      expect(screen.getByText('Has placeholder: true')).toBeInTheDocument();

      await click('Focus group 21');

      expect(screen.getByText('Has placeholder: false')).toBeInTheDocument();
      expect(screen.getByText(focusOn(21, eqKey))).toBeInTheDocument();
    });

    it('keeps the placeholder rule box focus instead of resolving its null key to the last box', async () => {
      await renderLoaded();
      await click('Add placeholder rule box in group 10');
      await flushEffects();

      expect(screen.getByText(focusOn(10, null))).toBeInTheDocument();
    });

    it('moves focus off a placeholder onto another course\'s last group when that course expands', async () => {
      await renderLoaded(twoCoursesResponse);
      await click('Add placeholder rule box in group 10');

      await click('Expand course B');

      expect(await screen.findByText(focusOnGroup(20))).toBeInTheDocument();
    });

    it.each([
      ['rule box in a real group', 'Add placeholder rule box in group 10', focusOn(10, null)],
      ['group', 'Add placeholder group under course A', 'Focus: group null, rule none'],
    ])('keeps a placeholder %s focused when its own course expands', async (_label, addAction, expectedFocus) => {
      await renderLoaded();
      await click(addAction);

      await click('Expand course A');

      expect(screen.getByText(expectedFocus)).toBeInTheDocument();
    });

    it('discarding the placeholder clears focus', async () => {
      await renderLoaded();
      await click('Add placeholder group under course A');

      await click('Discard placeholder');

      expect(noFocus()).toBeInTheDocument();
      expect(screen.getByText('Has placeholder: false')).toBeInTheDocument();
    });

    it('sends only group_id for a placeholder rule box whose default score no other box uses', async () => {
      axiosMock.onPost(createUrl).reply(201, createdCriterion(10));
      await renderLoaded(twoGroupsResponse);
      await click('Add placeholder rule box in group 10');

      await click('Associate in course A');

      await expectSinglePost({ object_id: 'new-sub', group_id: 10 });
    });

    it('sends nothing and flags a rejection when the placeholder\'s default score duplicates a box', async () => {
      axiosMock.onPost(createUrl).reply(201, createdCriterion(10));
      await renderLoaded();
      await click('Add placeholder rule box in group 10');

      await click('Associate in course A');
      await flushEffects();

      expect(axiosMock.history.post).toHaveLength(0);
      expect(screen.getByText('Duplicate rejected: true')).toBeInTheDocument();
    });

    it('clears the rejection once the author changes the placeholder\'s score', async () => {
      await renderLoaded();
      await click('Add placeholder rule box in group 10');
      await click('Associate in course A');
      expect(screen.getByText('Duplicate rejected: true')).toBeInTheDocument();

      await click('Set placeholder score');

      expect(screen.getByText('Duplicate rejected: false')).toBeInTheDocument();
    });

    it('sends group_id and both rule fields for a placeholder rule box with a score', async () => {
      axiosMock.onPost(createUrl).reply(201, createdCriterion(10, placeholderScore as GradeRulePayload));
      await renderLoaded();
      await click('Add placeholder rule box in group 10');
      await click('Set placeholder score');

      await click('Associate in course A');

      await expectSinglePost({
        object_id: 'new-sub',
        group_id: 10,
        rule_type_override: 'grade',
        rule_payload_override: placeholderScore,
      });
    });

    it('sends logic_operator and no group_id for a placeholder group in the clicked course', async () => {
      axiosMock.onPost(createUrl).reply(201, createdCriterion(11));
      await renderLoaded();
      await click('Add placeholder group under course A');

      await click('Associate in course A');

      await expectSinglePost({ object_id: 'new-sub', logic_operator: 'OR' });
    });

    it('sends the chosen logic_operator and score together for a placeholder group', async () => {
      axiosMock.onPost(createUrl).reply(201, createdCriterion(11, placeholderScore as GradeRulePayload));
      await renderLoaded();
      await click('Add placeholder group under course A');
      await click('Set placeholder logic operator to AND');
      await click('Set placeholder score');

      await click('Associate in course A');

      await expectSinglePost({
        object_id: 'new-sub',
        logic_operator: 'AND',
        rule_type_override: 'grade',
        rule_payload_override: placeholderScore,
      });
    });

    it('sends no optional field for a placeholder group when the subsection is from a course without groups', async () => {
      axiosMock.onPost(createUrl).reply(201, createdCriterion(20));
      await renderLoaded();
      await click('Add placeholder group under course A');

      await click('Associate in another course');

      await expectSinglePost({ object_id: 'new-sub' });
    });
  });

  describe('deleteGroup', () => {
    const deleteUrl = apiUrls.updateCompetencyCriteriaGroup(tagId, 10);
    const groupsReads = () => axiosMock.history.get.filter((request) => request.url === groupsUrl);
    const keyboardRequest = (request: object | null) => `Keyboard request: ${JSON.stringify(request)}`;

    /** Serves `initial` once, then `refetched` (held until `release` is called) for every later GET. */
    const mockGroupsReads = (initial: object, refetched: object) => {
      const control = { release: () => {} };
      axiosMock.onGet(groupsUrl).replyOnce(200, initial);
      axiosMock.onGet(groupsUrl).reply(() => (
        new Promise((resolve) => {
          control.release = () => resolve([200, refetched]);
        })
      ));
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onGet(courseBOutlineUrl).reply(200, outlineFixture);
      return control;
    };

    const renderWithFocusOnGroup10 = async () => {
      renderProvider();
      await waitForSuccess();
      await click('Focus group 10');
      expect(screen.getByText(focusOnGroup(10))).toBeInTheDocument();
    };

    const deleteAndRefetch = async (action: string, reads: { release: () => void; }) => {
      await click(action);
      await waitFor(() => expect(groupsReads()).toHaveLength(2));
      await act(async () => {
        reads.release();
      });
    };

    it('stays pending until the refetch lands, then focuses the neighbor and requests keyboard focus for it', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderWithFocusOnGroup10();

      await click('Delete group 10');

      await waitFor(() => expect(groupsReads()).toHaveLength(2));
      // The delete itself has resolved, but the refetch has not.
      expect(screen.getByText('Deleting: true')).toBeInTheDocument();
      expect(screen.getByText(focusOnGroup(10))).toBeInTheDocument();

      await act(async () => {
        reads.release();
      });

      expect(await screen.findByText('Deleting: false')).toBeInTheDocument();
      expect(screen.getByText(focusOn(11, gteKey))).toBeInTheDocument();
      expect(screen.getByText(keyboardRequest({ kind: 'group', groupId: 11, expand: true }))).toBeInTheDocument();
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('treats a 404 as success: no toast, and focus still moves off the vanished group', async () => {
      axiosMock.onDelete(deleteUrl).reply(404);
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderWithFocusOnGroup10();

      await deleteAndRefetch('Delete group 10', reads);

      expect(await screen.findByText(focusOnGroup(11))).toBeInTheDocument();
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('toasts on a failure, keeps focus when the group is still there, and requests no keyboard focus', async () => {
      axiosMock.onDelete(deleteUrl).reply(500);
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, twoGroupsWithCriteriaResponse);
      await renderWithFocusOnGroup10();

      await deleteAndRefetch('Delete group 10', reads);

      expect(await screen.findByText('Deleting: false')).toBeInTheDocument();
      expectToast('Couldn\'t remove the group. The panel was refreshed.', ErrorIcon);
      expect(screen.getByText(focusOnGroup(10))).toBeInTheDocument();
      expect(screen.getByText(keyboardRequest(null))).toBeInTheDocument();
    });

    it('requests the empty state when the delete leaves no course group', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(singleGroupResponse, noGroupsResponse);
      renderProvider();
      expect(await screen.findByText(focusOnGroup(10))).toBeInTheDocument();

      await deleteAndRefetch('Delete group 10', reads);

      expect(await screen.findByText(keyboardRequest({ kind: 'empty' }))).toBeInTheDocument();
      expect(noFocus()).toBeInTheDocument();
    });

    it('clears the keyboard focus request when focus is written some other way', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderWithFocusOnGroup10();
      await deleteAndRefetch('Delete group 10', reads);
      expect(await screen.findByText(keyboardRequest({ kind: 'group', groupId: 11, expand: true })))
        .toBeInTheDocument();

      await click('Focus group 11');

      expect(screen.getByText(keyboardRequest(null))).toBeInTheDocument();
    });

    it('focuses the course group above when deleting the only rule group removes its course group', async () => {
      axiosMock.onDelete(apiUrls.updateCompetencyCriteriaGroup(tagId, 20)).reply(200, {});
      const reads = mockGroupsReads(twoCoursesWithCriteriaResponse, {
        groups: twoCoursesWithCriteriaResponse.groups.filter((group) => group.id !== 2 && group.id !== 20),
        criteria: twoCoursesWithCriteriaResponse.criteria.filter((item) => item.groupId === 10),
      });
      renderProvider();
      await waitForSuccess();
      await click('Focus group 20');

      await deleteAndRefetch('Delete group 20', reads);

      expect(await screen.findByText(focusOn(10, gteKey))).toBeInTheDocument();
      expect(screen.getByText(keyboardRequest({ kind: 'group', groupId: 10, expand: true }))).toBeInTheDocument();
    });

    it('keeps focus, and asks to keep sections as they are, when the deleted group did not hold focus', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      renderProvider();
      await waitForSuccess();
      await click('Focus group 11');

      await deleteAndRefetch('Delete group 10', reads);

      expect(await screen.findByText('Deleting: false')).toBeInTheDocument();
      expect(screen.getByText(focusOn(11, gteKey))).toBeInTheDocument();
      expect(screen.getByText(keyboardRequest({ kind: 'group', groupId: 11, expand: false }))).toBeInTheDocument();
    });

    it('respects a click made on another group while the delete is pending', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      await renderWithFocusOnGroup10();

      await click('Delete group 10');
      await waitFor(() => expect(groupsReads()).toHaveLength(2));
      await click('Focus group 11');
      await act(async () => {
        reads.release();
      });

      expect(await screen.findByText('Deleting: false')).toBeInTheDocument();
      expect(screen.getByText(focusOn(11, gteKey))).toBeInTheDocument();
    });

    it('requests the empty state when only a course group the author cannot see is left', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, {});
      const reads = mockGroupsReads(twoCoursesWithCriteriaResponse, {
        groups: twoCoursesWithCriteriaResponse.groups.filter((group) => group.id !== 1 && group.id !== 10),
        criteria: twoCoursesWithCriteriaResponse.criteria.filter((item) => item.groupId === 20),
      });
      axiosMock.onGet(courseBOutlineUrl).reply(403);
      await renderWithFocusOnGroup10();

      await deleteAndRefetch('Delete group 10', reads);

      expect(await screen.findByText(keyboardRequest({ kind: 'empty' }))).toBeInTheDocument();
      expect(noFocus()).toBeInTheDocument();
    });
  });

  describe('removeAssociation', () => {
    const deleteUrl = apiUrls.deleteCompetencyCriterion(tagId, 901);
    const groupsReads = () => axiosMock.history.get.filter((request) => request.url === groupsUrl);
    const keyboardRequest = (request: object | null) => `Keyboard request: ${JSON.stringify(request)}`;

    /** Serves `initial` once, then `refetched` (held until `release` is called) for every later GET. */
    const mockGroupsReads = (initial: object, refetched: object) => {
      const control = { release: () => {} };
      axiosMock.onGet(groupsUrl).replyOnce(200, initial);
      axiosMock.onGet(groupsUrl).reply(() => (
        new Promise((resolve) => {
          control.release = () => resolve([200, refetched]);
        })
      ));
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      return control;
    };

    const clickAndSettle = async (name: string, reads: { release: () => void; }) => {
      await click(name);
      await waitFor(() => expect(groupsReads()).toHaveLength(2));
      await act(async () => {
        reads.release();
      });
      expect(await screen.findByText('Deleting: false')).toBeInTheDocument();
    };

    it('keeps the group and its other criteria, and asks the group box to take focus without expanding', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901 });
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      renderProvider();
      await waitForSuccess();
      await click('Focus group 10');

      await click('Remove sub-a chip');
      await waitFor(() => expect(groupsReads()).toHaveLength(2));
      // The delete itself has resolved, but the refetch has not.
      expect(screen.getByText('Deleting: true')).toBeInTheDocument();
      await act(async () => {
        reads.release();
      });

      expect(await screen.findByText('Deleting: false')).toBeInTheDocument();
      expect(screen.getByText(keyboardRequest({ kind: 'group', groupId: 10, expand: false }))).toBeInTheDocument();
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('moves focus off a vanished rule box to the box that remains', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901 });
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      renderProvider();
      await waitForSuccess();
      await click('Focus rule box 10 gte');
      expect(screen.getByText(focusOn(10, gteKey))).toBeInTheDocument();

      await clickAndSettle('Remove sub-a chip', reads);

      expect(await screen.findByText(focusOn(10, 'grade:gte:0.8:percent'))).toBeInTheDocument();
    });

    it('focuses the neighbor group when the removal cascades the group away', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901 });
      const reads = mockGroupsReads(twoGroupsWithCriteriaResponse, afterDeletingGroup10Response);
      renderProvider();
      await waitForSuccess();
      await click('Focus group 10');

      await clickAndSettle('Remove sub-a chip', reads);

      expect(screen.getByText(focusOn(11, gteKey))).toBeInTheDocument();
      expect(screen.getByText(keyboardRequest({ kind: 'group', groupId: 11, expand: true }))).toBeInTheDocument();
    });

    it('requests the empty state when the removal cascades away the last group', async () => {
      axiosMock.onDelete(apiUrls.deleteCompetencyCriterion(tagId, 900)).reply(200, { id: 900 });
      const reads = mockGroupsReads(singleGroupResponse, noGroupsResponse);
      renderProvider();
      await waitForSuccess();
      await click('Focus group 10');

      await clickAndSettle('Remove existing-sub chip', reads);

      expect(screen.getByText(keyboardRequest({ kind: 'empty' }))).toBeInTheDocument();
    });

    it('treats a 404 as success when the refetch no longer has the criterion: no toast', async () => {
      axiosMock.onDelete(deleteUrl).reply(404);
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      renderProvider();
      await waitForSuccess();
      await click('Focus group 10');

      await clickAndSettle('Remove sub-a chip', reads);

      expect(mockShowToast).not.toHaveBeenCalled();
      expect(screen.getByText('Criterion ids: [903]')).toBeInTheDocument();
      expect(screen.getByText(keyboardRequest({ kind: 'group', groupId: 10, expand: false }))).toBeInTheDocument();
    });

    it('toasts on a 404 when the refetch still has the criterion', async () => {
      axiosMock.onDelete(deleteUrl).reply(404);
      const reads = mockGroupsReads(twoBoxesInGroupResponse, twoBoxesInGroupResponse);
      renderProvider();
      await waitForSuccess();

      await clickAndSettle('Remove sub-a chip', reads);

      expectToast('Couldn\'t remove the association. The panel was refreshed.', ErrorIcon);
      expect(screen.getByText('Criterion ids: [901,903]')).toBeInTheDocument();
    });

    it('toasts on a failure and requests no keyboard focus, since the association is still there', async () => {
      axiosMock.onDelete(deleteUrl).reply(500);
      const reads = mockGroupsReads(twoBoxesInGroupResponse, twoBoxesInGroupResponse);
      renderProvider();
      await waitForSuccess();
      await click('Focus group 10');

      await clickAndSettle('Remove sub-a chip', reads);

      expectToast('Couldn\'t remove the association. The panel was refreshed.', ErrorIcon);
      expect(screen.getByText(keyboardRequest(null))).toBeInTheDocument();
    });

    it('toasts on a failure and still returns focus to the subsection row', async () => {
      axiosMock.onDelete(deleteUrl).reply(500);
      const reads = mockGroupsReads(twoBoxesInGroupResponse, twoBoxesInGroupResponse);
      renderProvider();
      await waitForSuccess();

      await clickAndSettle('Remove sub-a from browse', reads);

      expectToast('Couldn\'t remove the association. The panel was refreshed.', ErrorIcon);
      expect(screen.getByText(keyboardRequest({ kind: 'subsection', objectId: 'sub-a' }))).toBeInTheDocument();
    });

    it('deletes the criterion with the given id when another group holds one for the same subsection', async () => {
      const urlOf902 = apiUrls.deleteCompetencyCriterion(tagId, 902);
      axiosMock.onDelete(urlOf902).reply(200, { id: 902 });
      const sameSubsectionInTwoGroups = {
        ...twoGroupsResponse,
        criteria: [criterion(901, 'sub-a', 10), criterion(902, 'sub-a', 11)],
      };
      const reads = mockGroupsReads(sameSubsectionInTwoGroups, {
        ...sameSubsectionInTwoGroups,
        criteria: sameSubsectionInTwoGroups.criteria.slice(0, 1),
      });
      renderProvider();
      await waitForSuccess();

      await clickAndSettle('Remove criterion 902', reads);

      expect(axiosMock.history.delete).toHaveLength(1);
      expect(axiosMock.history.delete[0].url).toEqual(urlOf902);
      expect(screen.getByText('Criterion ids: [901]')).toBeInTheDocument();
    });

    it('drops a second call made while the first is still deleting, so one request is sent', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901 });
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      renderProvider();
      await waitForSuccess();
      await click('Remove sub-a chip');
      expect(await screen.findByText('Deleting: true')).toBeInTheDocument();

      await click('Remove sub-a chip');
      await waitFor(() => expect(groupsReads()).toHaveLength(2));
      await act(async () => {
        reads.release();
      });

      expect(await screen.findByText('Deleting: false')).toBeInTheDocument();
      expect(axiosMock.history.delete).toHaveLength(1);
    });

    it('requests keyboard focus for the subsection row when the removal came from the content panel', async () => {
      axiosMock.onDelete(deleteUrl).reply(200, { id: 901 });
      const reads = mockGroupsReads(twoBoxesInGroupResponse, afterRemovingSubAResponse);
      renderProvider();
      await waitForSuccess();
      await click('Focus group 10');

      await clickAndSettle('Remove sub-a from browse', reads);

      expect(screen.getByText(keyboardRequest({ kind: 'subsection', objectId: 'sub-a' }))).toBeInTheDocument();
    });
  });

  describe('removePlaceholderGroup', () => {
    it('sends no request, and focuses the last saved group of the placeholder\'s course with a keyboard request', async () => {
      axiosMock.onGet(groupsUrl).reply(200, twoGroupsWithCriteriaResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      renderProvider();
      await waitForSuccess();
      await click('Add placeholder group under course A');
      expect(screen.getByText('Focus: group null, rule none')).toBeInTheDocument();

      await click('Remove placeholder group');

      expect(screen.getByText(focusOn(11, gteKey))).toBeInTheDocument();
      expect(screen.getByText('Keyboard request: {"kind":"group","groupId":11,"expand":true}')).toBeInTheDocument();
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
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      renderProvider();
      await waitForSuccess();
      await click('Add placeholder group under course A');

      await click('Remove placeholder group');

      expect(noFocus()).toBeInTheDocument();
      expect(screen.getByText('Keyboard request: null')).toBeInTheDocument();
    });
  });

  describe('associateSubsection', () => {
    it('sends the focused group\'s id and rule when the focus is a group belonging to the clicked subsection\'s course', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(201, createdCriterion(10, gteRule));
      renderProvider();
      await waitForSuccess();

      await click('Focus rule box 10 gte');
      await click('Associate in course A');

      await expectSinglePost({
        object_id: 'new-sub',
        group_id: 10,
        rule_type_override: 'grade',
        rule_payload_override: gteRule,
      });
    });

    it('omits group_id and rule fields when focus is unset and the course has no groups', async () => {
      axiosMock.onGet(groupsUrl).reply(200, noGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onPost(createUrl).reply(201, createdCriterion(20));
      renderProvider();
      await waitForSuccess();

      await click('Associate in course A');

      await expectSinglePost({ object_id: 'new-sub' });
    });

    describe('when focus is not on the clicked subsection\'s course, and the course has groups', () => {
      beforeEach(() => {
        axiosMock.onGet(groupsUrl).reply(200, courseBGroupsResponse);
        axiosMock.onGet(profileUrl).reply(200, profileResponse);
        axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
        axiosMock.onGet(courseBOutlineUrl).reply(200, outlineFixture);
      });

      it('targets the course\'s last group and rule box when nothing is focused, and focuses them', async () => {
        axiosMock.onPost(createUrl).reply(201, createdCriterion(21, eqRule));
        renderProvider();
        await waitForSuccess();
        noFocus();

        await click('Associate in course B');

        await expectSinglePost({
          object_id: 'new-sub',
          group_id: 21,
          rule_type_override: 'grade',
          rule_payload_override: eqRule,
        });
        expect(screen.getByText(focusOn(21, eqKey))).toBeInTheDocument();
      });

      it('targets the course\'s last group when focus is on another course\'s group', async () => {
        axiosMock.onPost(createUrl).reply(201, createdCriterion(10));
        renderProvider();
        await waitForSuccess();
        await click('Focus group 21');

        await click('Associate in course A');

        await expectSinglePost({ object_id: 'new-sub', group_id: 10 });
        expect(screen.getByText(focusOn(10, null))).toBeInTheDocument();
      });

      it('targets the course\'s last group when the focused group no longer exists in the tree', async () => {
        axiosMock.onPost(createUrl).reply(201, createdCriterion(21, eqRule));
        renderProvider();
        await waitForSuccess();
        await click('Focus group 999');

        await click('Associate in course B');

        await expectSinglePost({
          object_id: 'new-sub',
          group_id: 21,
          rule_type_override: 'grade',
          rule_payload_override: eqRule,
        });
      });
    });

    it('omits group_id and rule fields when focus is a group belonging to a different course', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(201, createdCriterion(20));
      renderProvider();
      await waitForSuccess();

      await click('Focus rule box 10 gte');
      await click('Associate in another course');

      await expectSinglePost({ object_id: 'new-sub' });
    });

    it('returns early with an informational toast, sending no request, for an already-associated subsection', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      renderProvider();
      await waitForSuccess();

      await click('Associate duplicate');

      expectToast('This content is already associated with this competency.', InfoOutline);
      await flushEffects();
      expect(axiosMock.history.post).toHaveLength(0);
    });

    it('focuses the response\'s group and rule after a successful create, not a stale local read', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      // Group 999 is not in the local tree, so a lookup against it would yield no rule key.
      axiosMock.onPost(createUrl).reply(201, createdCriterion(999, eqRule));
      renderProvider();
      await waitForSuccess();

      await click('Associate in course A');

      expect(await screen.findByText(focusOn(999, eqKey))).toBeInTheDocument();
    });

    it.each([
      ['the competency changed', [otherTagId]],
      ['leaving and returning to the competency', [otherTagId, tagId]],
    ])('ignores a create response that arrives after %s', async (_description, visits) => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(otherGroupsUrl).reply(200, noGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      const createGate = deferred();
      axiosMock.onPost(createUrl).reply(() => createGate.released.then(() => [201, createdCriterion(777)]));
      const { rerender } = renderProvider();
      await waitForSuccess();
      await click('Associate in course A');
      await waitFor(() => expect(axiosMock.history.post).toHaveLength(1));

      visits.forEach((id) => rerender(providerFor(id)));
      await waitForSuccess();
      await click('Focus group 999');
      await act(async () => {
        createGate.release();
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });

      expect(screen.getByText(focusOnGroup(999))).toBeInTheDocument();
    });

    it('handles the result of every create when several are started before the first one settles', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).replyOnce(500).onPost(createUrl).replyOnce(201, createdCriterion(888));
      renderProvider();
      await waitForSuccess();

      await click('Associate two in one tick');

      await waitFor(() => expectToast(createFailedMessage, ErrorIcon));
      await screen.findByText(focusOnGroup(888));
      expect(axiosMock.history.post).toHaveLength(2);
    });

    it('reports a create in flight through isAssociating', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(() => new Promise(() => {}));
      renderProvider();
      await waitForSuccess();

      await click('Associate in course A');

      await screen.findByText('Associating: true');
    });

    it('reports a create in flight only for the competency it was started in', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(otherGroupsUrl).reply(200, noGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(() => new Promise(() => {}));
      const { rerender } = renderProvider();
      await waitForSuccess();
      await click('Associate in course A');
      await screen.findByText('Associating: true');

      rerender(providerFor(otherTagId));
      await waitForSuccess();
      expect(screen.getByText('Associating: false')).toBeInTheDocument();

      rerender(providerFor(tagId));
      await waitForSuccess();
      expect(screen.getByText('Associating: true')).toBeInTheDocument();
    });

    it('shows a specific toast when the create request 400s with a tag_id field error', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(400, {
        tag_id: ['A parent or child competency already has criteria in this course.'],
      });
      renderProvider();
      await waitForSuccess();

      await click('Associate in course A');

      await waitFor(() => {
        expectToast(
          'This competency can\'t be associated with this content because a parent or child '
            + 'competency already has criteria in this course.',
          ErrorIcon,
        );
      });
    });

    it('shows the generic toast for a 400 that is not a tag_id field error', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onPost(createUrl).reply(400, { object_id: ['This field is required.'] });
      renderProvider();
      await waitForSuccess();

      await click('Associate in course A');

      await waitFor(() => expectToast(createFailedMessage, ErrorIcon));
    });
  });

  describe('updateGroupOperator', () => {
    it('sends the operator, with no toast, on success', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onPatch(updateGroupOperatorUrl).reply(200, {
        id: 10,
        parent_id: 1,
        tag_id: tagId,
        course_key: null,
        name: 'group',
        ordering: 0,
        logic_operator: 'OR',
      });
      renderProvider();
      await waitForSuccess();

      await click('Update group operator');

      await waitFor(() => expect(axiosMock.history.patch).toHaveLength(1));
      expect(axiosMock.history.patch[0].url).toEqual(updateGroupOperatorUrl);
      expect(JSON.parse(axiosMock.history.patch[0].data)).toEqual({ logic_operator: 'OR' });
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('rejects without a toast, leaving the failure to the confirmation dialog', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onPatch(updateGroupOperatorUrl).reply(500);
      renderProvider();
      await waitForSuccess();

      await click('Update group operator');

      await waitFor(() => expect(axiosMock.history.patch).toHaveLength(1));
      await flushEffects();
      expect(mockShowToast).not.toHaveBeenCalled();
    });
  });

  describe('updateRuleScore', () => {
    it('sends the batch payload and focuses the rule box keyed from the response on success', async () => {
      // The refetch after the save returns the edited rule, as the server would.
      let groupsReply = singleGroupResponse;
      axiosMock.onGet(groupsUrl).reply(() => [200, groupsReply]);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onPatch(updateRuleScoreUrl).reply(() => {
        groupsReply = {
          ...singleGroupResponse,
          criteria: [criterion(900, 'existing-sub', 10, {
            ruleProfileId: null,
            ruleTypeOverride: 'grade',
            rulePayloadOverride: { op: 'gte', value: 0.8, scale: 'percent' },
          })],
        };
        return [200, [
          {
            id: 900,
            object_id: 'existing-sub',
            group_id: 10,
            rule_profile_id: null,
            rule_type_override: 'grade',
            rule_payload_override: { op: 'gte', value: 0.8, scale: 'percent' },
          },
        ]];
      });
      renderProvider();
      await waitForSuccess();

      await click('Update rule score');

      await waitFor(() => expect(axiosMock.history.patch).toHaveLength(1));
      expect(axiosMock.history.patch[0].url).toEqual(updateRuleScoreUrl);
      // Criterion 900 has no override, so the rule type comes from the system default profile.
      expect(JSON.parse(axiosMock.history.patch[0].data)).toEqual({
        criterion_ids: [900],
        rule_type_override: 'grade',
        rule_payload_override: { op: 'gte', value: 0.8, scale: 'percent' },
      });
      expect(await screen.findByText(focusOn(10, 'grade:gte:0.8:percent'))).toBeInTheDocument();
      expect(screen.getByText('Keyboard request: {"kind":"ruleBox","groupId":10,"ruleKey":"grade:gte:0.8:percent"}'))
        .toBeInTheDocument();
    });

    it('leaves focus and keyboard focus alone when the competency changed during the request', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(otherGroupsUrl).reply(200, noGroupsResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      let respond: () => void = () => {};
      axiosMock.onPatch(updateRuleScoreUrl).reply(() =>
        new Promise((resolve) => {
          respond = () => resolve([200, [createdCriterion(10)]]);
        })
      );
      const { rerender } = render(providerFor(tagId));
      await waitForSuccess();

      await click('Update rule score');
      await waitFor(() => expect(axiosMock.history.patch).toHaveLength(1));
      rerender(providerFor(otherTagId));
      await waitForSuccess();
      await click('Focus group 999');
      await act(async () => {
        respond();
      });
      await flushEffects();

      expect(screen.getByText(focusOnGroup(999))).toBeInTheDocument();
      expect(screen.getByText('Keyboard request: null')).toBeInTheDocument();
    });

    it('rejects without a toast, and without changing focus', async () => {
      axiosMock.onGet(groupsUrl).reply(200, singleGroupResponse);
      axiosMock.onGet(profileUrl).reply(200, profileResponse);
      axiosMock.onGet(courseAOutlineUrl).reply(200, outlineFixture);
      axiosMock.onPatch(updateRuleScoreUrl).reply(500);
      renderProvider();
      expect(await screen.findByText(focusOn(10, gteKey))).toBeInTheDocument();

      await click('Update rule score');

      await waitFor(() => expect(axiosMock.history.patch).toHaveLength(1));
      await flushEffects();
      expect(mockShowToast).not.toHaveBeenCalled();
      expect(screen.getByText(focusOn(10, gteKey))).toBeInTheDocument();
    });
  });
});
