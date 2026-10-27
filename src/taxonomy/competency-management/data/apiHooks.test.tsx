import {
  act,
  initializeMocks,
  makeWrapper,
  renderHook,
  waitFor,
} from '@src/testUtils';
import { useUserPermissions } from '@src/authz/data/apiHooks';
import { waffleFlagDefaults } from '@src/data/api';
import * as apiHooks from '@src/data/apiHooks';
import { mockWaffleFlags } from '@src/data/apiHooks.mock';
import { apiUrls } from './api';
import {
  competencyQueryKeys,
  useCompetencyCriteriaGroups,
  useCourseTaggingPermissions,
  useCreateCompetencyCriterion,
  useDefaultCompetencyRuleProfile,
  useDeleteCompetencyCriteriaGroup,
  useDeleteCompetencyCriterion,
  useDeleteCompetencyRuleBox,
  useUpdateCompetencyCriteriaGroupOperator,
  useUpdateCompetencyCriteriaRule,
} from './apiHooks';

jest.mock('@src/authz/data/apiHooks', () => ({
  useUserPermissions: jest.fn(),
}));

const tagId = 42;

describe('useCompetencyCriteriaGroups', () => {
  it('fetches a competency\'s criteria groups when tagId is defined', async () => {
    const { axiosMock } = initializeMocks();
    const mockResponse = { groups: [], criteria: [] };
    axiosMock.onGet(apiUrls.competencyCriteriaGroups(tagId)).reply(200, mockResponse);

    const { result } = renderHook(() => useCompetencyCriteriaGroups(tagId), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockResponse);
  });

  it('issues no request, and reports not loading, while tagId is undefined', () => {
    const { axiosMock } = initializeMocks();
    const { result } = renderHook(() => useCompetencyCriteriaGroups(undefined), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchStatus).toEqual('idle');
    expect(axiosMock.history.get.filter((req) => req.url?.includes('competency_criteria_groups'))).toHaveLength(0);
  });
});

describe('useDefaultCompetencyRuleProfile', () => {
  it('fetches the studio-wide default rule profile out of the paginated list response', async () => {
    const { axiosMock } = initializeMocks();
    axiosMock.onGet(apiUrls.defaultCompetencyRuleProfile()).reply(200, {
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 1,
        scope_type: 'system_default',
        rule_type: 'grade',
        rule_payload: { op: 'gte', value: 0.7, scale: 'percent' },
        archived: false,
      }],
    });

    const { result } = renderHook(() => useDefaultCompetencyRuleProfile(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      id: 1,
      scopeType: 'system_default',
      ruleType: 'grade',
      rulePayload: { op: 'gte', value: 0.7, scale: 'percent' },
      archived: false,
    });
  });

  it('picks the system_default row by scopeType, not array position, when a scoped profile is also present', async () => {
    const { axiosMock } = initializeMocks();
    axiosMock.onGet(apiUrls.defaultCompetencyRuleProfile()).reply(200, {
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          id: 2,
          scope_type: 'taxonomy',
          rule_type: 'grade',
          rule_payload: { op: 'gte', value: 0.9, scale: 'percent' },
          archived: false,
        },
        {
          id: 1,
          scope_type: 'system_default',
          rule_type: 'grade',
          rule_payload: { op: 'gte', value: 0.7, scale: 'percent' },
          archived: false,
        },
      ],
    });

    const { result } = renderHook(() => useDefaultCompetencyRuleProfile(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      id: 1,
      scopeType: 'system_default',
      ruleType: 'grade',
      rulePayload: { op: 'gte', value: 0.7, scale: 'percent' },
      archived: false,
    });
  });
});

describe('useCreateCompetencyCriterion', () => {
  it('invalidates that tagId\'s groups query on success, without suppressing the refetch', async () => {
    const { axiosMock, queryClient } = initializeMocks();
    axiosMock.onPost(apiUrls.createCompetencyCriterion(tagId)).reply(201, {
      id: 999,
      group_id: 10,
      rule_profile_id: 1,
      rule_type_override: null,
      rule_payload_override: null,
      object_tag_id: tagId,
    });
    queryClient.setQueryData(competencyQueryKeys.competencyCriteriaGroups(tagId), { groups: [], criteria: [] });

    const { result } = renderHook(() => useCreateCompetencyCriterion(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ tagId, payload: { object_id: 'block-a', group_id: 10 } });
    });

    // `isInvalidated` (not `removeQueries`/a stale flag left permanently
    // `false`) is the signal that a refetch was actually requested, not
    // suppressed - `useCreateCompetencyCriterion` must not pass
    // `refetchType: 'none'` (or similar) to `invalidateQueries`.
    const state = queryClient.getQueryState(competencyQueryKeys.competencyCriteriaGroups(tagId));
    expect(state?.isInvalidated).toBe(true);
  });

  it('does not invalidate a different tagId\'s groups query', async () => {
    const { axiosMock, queryClient } = initializeMocks();
    const otherTagId = 7;
    axiosMock.onPost(apiUrls.createCompetencyCriterion(tagId)).reply(201, {
      id: 999,
      group_id: 10,
      rule_profile_id: 1,
      rule_type_override: null,
      rule_payload_override: null,
      object_tag_id: tagId,
    });
    queryClient.setQueryData(competencyQueryKeys.competencyCriteriaGroups(otherTagId), { groups: [], criteria: [] });

    const { result } = renderHook(() => useCreateCompetencyCriterion(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ tagId, payload: { object_id: 'block-a', group_id: 10 } });
    });

    const state = queryClient.getQueryState(competencyQueryKeys.competencyCriteriaGroups(otherTagId));
    expect(state?.isInvalidated).toBe(false);
  });
});

describe('useUpdateCompetencyCriteriaGroupOperator', () => {
  it('invalidates that tagId\'s groups query on success', async () => {
    const { axiosMock, queryClient } = initializeMocks();
    axiosMock.onPatch(apiUrls.updateCompetencyCriteriaGroup(tagId, 10)).reply(200, {
      id: 10,
      parent_id: 1,
      tag_id: tagId,
      course_key: null,
      name: 'leaf',
      ordering: 0,
      logic_operator: 'OR',
      archived: false,
    });
    queryClient.setQueryData(competencyQueryKeys.competencyCriteriaGroups(tagId), { groups: [], criteria: [] });

    const { result } = renderHook(() => useUpdateCompetencyCriteriaGroupOperator(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ tagId, groupId: 10, logicOperator: 'OR' });
    });

    const state = queryClient.getQueryState(competencyQueryKeys.competencyCriteriaGroups(tagId));
    expect(state?.isInvalidated).toBe(true);
  });
});

describe('useDeleteCompetencyCriterion', () => {
  const groupsKey = competencyQueryKeys.competencyCriteriaGroups(tagId);

  it('invalidates that tagId\'s groups query on success', async () => {
    const { axiosMock, queryClient } = initializeMocks();
    axiosMock.onDelete(apiUrls.deleteCompetencyCriterion(tagId, 101)).reply(200, { id: 101, archived: false });
    queryClient.setQueryData(groupsKey, { groups: [], criteria: [] });
    const { result } = renderHook(() => useDeleteCompetencyCriterion(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ tagId, criterionId: 101 });
    });

    expect(queryClient.getQueryState(groupsKey)?.isInvalidated).toBe(true);
  });

  it('invalidates that tagId\'s groups query on failure too', async () => {
    const { axiosMock, queryClient } = initializeMocks();
    axiosMock.onDelete(apiUrls.deleteCompetencyCriterion(tagId, 101)).reply(403);
    queryClient.setQueryData(groupsKey, { groups: [], criteria: [] });
    const { result } = renderHook(() => useDeleteCompetencyCriterion(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync({ tagId, criterionId: 101 })).rejects.toBeDefined();
    });

    expect(queryClient.getQueryState(groupsKey)?.isInvalidated).toBe(true);
  });
});

describe('useDeleteCompetencyCriteriaGroup', () => {
  const groupsKey = competencyQueryKeys.competencyCriteriaGroups(tagId);

  it('invalidates that tagId\'s groups query on success', async () => {
    const { axiosMock, queryClient } = initializeMocks();
    axiosMock.onDelete(apiUrls.updateCompetencyCriteriaGroup(tagId, 10)).reply(200, {});
    queryClient.setQueryData(groupsKey, { groups: [], criteria: [] });

    const { result } = renderHook(() => useDeleteCompetencyCriteriaGroup(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ tagId, groupId: 10 });
    });

    expect(queryClient.getQueryState(groupsKey)?.isInvalidated).toBe(true);
  });

  it('invalidates that tagId\'s groups query on failure too', async () => {
    const { axiosMock, queryClient } = initializeMocks();
    axiosMock.onDelete(apiUrls.updateCompetencyCriteriaGroup(tagId, 10)).reply(403);
    queryClient.setQueryData(groupsKey, { groups: [], criteria: [] });

    const { result } = renderHook(() => useDeleteCompetencyCriteriaGroup(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync({ tagId, groupId: 10 })).rejects.toBeDefined();
    });

    expect(queryClient.getQueryState(groupsKey)?.isInvalidated).toBe(true);
  });

  it('stays pending until the refetch of an active groups query has landed', async () => {
    const { axiosMock } = initializeMocks();
    axiosMock.onGet(apiUrls.competencyCriteriaGroups(tagId)).replyOnce(200, { groups: [], criteria: [] });
    const { result } = renderHook(
      () => ({ query: useCompetencyCriteriaGroups(tagId), mutation: useDeleteCompetencyCriteriaGroup() }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    let releaseRefetch: () => void = () => {};
    axiosMock.onGet(apiUrls.competencyCriteriaGroups(tagId)).reply(() => (
      new Promise((resolve) => {
        releaseRefetch = () => resolve([200, { groups: [], criteria: [] }]);
      })
    ));
    axiosMock.onDelete(apiUrls.updateCompetencyCriteriaGroup(tagId, 10)).reply(200, {});

    act(() => {
      result.current.mutation.mutate({ tagId, groupId: 10 });
    });
    await waitFor(() => expect(result.current.query.isFetching).toBe(true));
    expect(result.current.mutation.isPending).toBe(true);

    await act(async () => {
      releaseRefetch();
    });
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
  });
});

describe('useDeleteCompetencyRuleBox', () => {
  const groupsKey = competencyQueryKeys.competencyCriteriaGroups(tagId);
  const deleteUrl = (criterionId: number) => apiUrls.deleteCompetencyCriterion(tagId, criterionId);
  const sentDeleteUrls = (axiosMock: ReturnType<typeof initializeMocks>['axiosMock']) => (
    axiosMock.history.delete.map((request) => request.url)
  );

  // An unmatched URL answers 404, which counts as removed, so every DELETE is mocked and the sent URLs asserted.
  it('sends one request at a time, in order', async () => {
    const { axiosMock } = initializeMocks();
    let releaseFirst: () => void = () => {};
    axiosMock.onDelete(deleteUrl(101)).reply(() => (
      new Promise((resolve) => {
        releaseFirst = () => resolve([200, { id: 101, archived: false }]);
      })
    ));
    axiosMock.onDelete(deleteUrl(102)).reply(200, { id: 102, archived: false });
    axiosMock.onDelete(deleteUrl(103)).reply(200, { id: 103, archived: false });
    const { result } = renderHook(() => useDeleteCompetencyRuleBox(), { wrapper: makeWrapper() });

    act(() => {
      result.current.mutate({ tagId, criterionIds: [101, 102, 103] });
    });
    await waitFor(() => expect(axiosMock.history.delete).toHaveLength(1));
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
    expect(sentDeleteUrls(axiosMock)).toEqual([deleteUrl(101)]);

    await act(async () => {
      releaseFirst();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sentDeleteUrls(axiosMock)).toEqual([deleteUrl(101), deleteUrl(102), deleteUrl(103)]);
  });

  it.each([
    { name: 'partway', statuses: [200, 500, 200], sentUrls: [deleteUrl(101), deleteUrl(102)] },
    { name: 'on the first request', statuses: [500, 200], sentUrls: [deleteUrl(101)] },
  ])('stops at the first failure other than a 404, $name, and rejects with it', async (
    { statuses, sentUrls },
  ) => {
    const { axiosMock } = initializeMocks();
    const criterionIds = statuses.map((_status, position) => 101 + position);
    criterionIds.forEach((id, position) => {
      axiosMock.onDelete(deleteUrl(id)).reply(statuses[position], { id, archived: false });
    });
    const { result } = renderHook(() => useDeleteCompetencyRuleBox(), { wrapper: makeWrapper() });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({ tagId, criterionIds });
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toMatchObject({ response: { status: 500 } });
    expect(sentDeleteUrls(axiosMock)).toEqual(sentUrls);
  });

  it.each([
    { outcome: 'success', status: 200 },
    { outcome: 'failure too', status: 403 },
  ])('invalidates that tagId\'s groups query on $outcome', async ({ status }) => {
    const { axiosMock, queryClient } = initializeMocks();
    axiosMock.onDelete(deleteUrl(101)).reply(status, { id: 101, archived: false });
    queryClient.setQueryData(groupsKey, { groups: [], criteria: [] });
    const { result } = renderHook(() => useDeleteCompetencyRuleBox(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ tagId, criterionIds: [101] }).catch(() => {});
    });

    expect(queryClient.getQueryState(groupsKey)?.isInvalidated).toBe(true);
  });

  it('refetches the groups once for the whole run and stays pending until that refetch has landed', async () => {
    const { axiosMock } = initializeMocks();
    axiosMock.onGet(apiUrls.competencyCriteriaGroups(tagId)).replyOnce(200, { groups: [], criteria: [] });
    const { result } = renderHook(
      () => ({ query: useCompetencyCriteriaGroups(tagId), mutation: useDeleteCompetencyRuleBox() }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    let releaseRefetch: () => void = () => {};
    axiosMock.onGet(apiUrls.competencyCriteriaGroups(tagId)).reply(() => (
      new Promise((resolve) => {
        releaseRefetch = () => resolve([200, { groups: [], criteria: [] }]);
      })
    ));
    axiosMock.onDelete(deleteUrl(101)).reply(200, { id: 101, archived: false });
    axiosMock.onDelete(deleteUrl(102)).reply(200, { id: 102, archived: false });

    act(() => {
      result.current.mutation.mutate({ tagId, criterionIds: [101, 102] });
    });
    await waitFor(() => expect(result.current.query.isFetching).toBe(true));
    expect(result.current.mutation.isPending).toBe(true);
    expect(sentDeleteUrls(axiosMock)).toEqual([deleteUrl(101), deleteUrl(102)]);

    await act(async () => {
      releaseRefetch();
    });
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
    expect(axiosMock.history.get).toHaveLength(2);
  });
});

describe('useUpdateCompetencyCriteriaRule', () => {
  it('invalidates that tagId\'s groups query on success', async () => {
    const { axiosMock, queryClient } = initializeMocks();
    const groupId = 10;
    axiosMock.onPatch(apiUrls.updateCompetencyCriteriaRule(groupId)).reply(200, [
      {
        id: 101,
        object_id: 'block-a',
        group_id: groupId,
        rule_profile_id: null,
        rule_type_override: 'grade',
        rule_payload_override: { op: 'gte', value: 0.8, scale: 'percent' },
      },
    ]);
    queryClient.setQueryData(competencyQueryKeys.competencyCriteriaGroups(tagId), { groups: [], criteria: [] });

    const { result } = renderHook(() => useUpdateCompetencyCriteriaRule(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        tagId,
        groupId,
        criterionIds: [101],
        ruleType: 'grade',
        rulePayload: { op: 'gte', value: 0.8, scale: 'percent' },
      });
    });

    const state = queryClient.getQueryState(competencyQueryKeys.competencyCriteriaGroups(tagId));
    expect(state?.isInvalidated).toBe(true);
  });
});

describe('useCourseTaggingPermissions', () => {
  beforeEach(() => {
    initializeMocks();
    jest.mocked(useUserPermissions).mockReturnValue({ isLoading: false, data: undefined } as any);
  });

  it('issues no permissions request and reports not loading for an empty course-id list', () => {
    mockWaffleFlags({ enableAuthzCourseAuthoring: true });

    const { result } = renderHook(() => useCourseTaggingPermissions([]), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.permissionsByCourseId).toEqual({});
    // `enabled: false` is what would keep the real hook from ever firing a
    // request - `useUserPermissions` itself is mocked here.
    expect(useUserPermissions).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('resolves every course to true, with no permissions request, when the waffle flag is off', () => {
    mockWaffleFlags({ enableAuthzCourseAuthoring: false });

    const { result } = renderHook(
      () => useCourseTaggingPermissions(['course-a', 'course-b']),
      { wrapper: makeWrapper() },
    );

    expect(result.current.isAuthzEnabled).toBe(false);
    expect(result.current.permissionsByCourseId).toEqual({ 'course-a': true, 'course-b': true });
    expect(useUserPermissions).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('resolves every course to false, with no permissions request, while the waffle flags are loading', () => {
    jest.spyOn(apiHooks, 'useWaffleFlags').mockImplementation(() => ({
      id: undefined,
      isLoading: true,
      isError: false,
      ...waffleFlagDefaults,
    }));

    const { result } = renderHook(
      () => useCourseTaggingPermissions(['course-a', 'course-b']),
      { wrapper: makeWrapper() },
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.permissionsByCourseId).toEqual({ 'course-a': false, 'course-b': false });
    expect(useUserPermissions).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('resolves each course\'s own answer when the flag is on and the permissions call has resolved', async () => {
    mockWaffleFlags({ enableAuthzCourseAuthoring: true });
    jest.mocked(useUserPermissions).mockReturnValue({
      isLoading: false,
      data: { 'course-a': true, 'course-b': false },
    } as any);

    const { result } = renderHook(
      () => useCourseTaggingPermissions(['course-a', 'course-b']),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(result.current.permissionsByCourseId).toEqual({ 'course-a': true, 'course-b': false });
    });
  });

  it('resolves a course id absent from the permissions response to false, not a throw', async () => {
    mockWaffleFlags({ enableAuthzCourseAuthoring: true });
    jest.mocked(useUserPermissions).mockReturnValue({ isLoading: false, data: {} } as any);

    const { result } = renderHook(() => useCourseTaggingPermissions(['course-a']), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.permissionsByCourseId).toEqual({ 'course-a': false });
    });
  });

  it(
    'expanding to a second course re-issues the query with both ids without losing the first course\'s '
      + 'already-resolved answer',
    async () => {
      mockWaffleFlags({ enableAuthzCourseAuthoring: true });
      jest.mocked(useUserPermissions).mockReturnValue({
        isLoading: false,
        data: { 'course-a': true },
      } as any);

      const { result, rerender } = renderHook(
        ({ courseIds }) => useCourseTaggingPermissions(courseIds),
        { wrapper: makeWrapper(), initialProps: { courseIds: ['course-a'] } },
      );
      await waitFor(() => {
        expect(result.current.permissionsByCourseId).toEqual({ 'course-a': true });
      });

      // Expanding to a second course re-issues the query (a new query key,
      // since `useUserPermissions`'s cache key embeds the whole query
      // object) - still in flight, before it resolves.
      jest.mocked(useUserPermissions).mockReturnValue({ isLoading: true, data: undefined } as any);
      rerender({ courseIds: ['course-a', 'course-b'] });

      // Course A's already-resolved answer survives; course B - never
      // resolved yet - defaults to false while its own answer is pending.
      expect(result.current.permissionsByCourseId).toEqual({ 'course-a': true, 'course-b': false });

      jest.mocked(useUserPermissions).mockReturnValue({
        isLoading: false,
        data: { 'course-a': true, 'course-b': false },
      } as any);
      rerender({ courseIds: ['course-a', 'course-b'] });

      await waitFor(() => {
        expect(result.current.permissionsByCourseId).toEqual({ 'course-a': true, 'course-b': false });
      });
    },
  );
});
