import { useEffect, useMemo, useState } from 'react';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';

import { useUserPermissions } from '@src/authz/data/apiHooks';
import { COURSE_PERMISSIONS } from '@src/authz/constants';
import { useWaffleFlags } from '@src/data/apiHooks';
import type { PermissionValidationQuery } from '@src/authz/types';

import * as api from './api';
import type {
  CompetencyCriteriaGroup,
  CompetencyCriterion,
  CompetencyGroupLogicOperator,
  CreateCompetencyCriterionPayload,
  CreateCompetencyCriterionResponse,
  GradeRulePayload,
} from './types';

/**
 * Query key factory for competency-management data, following the same
 * `all -> one entity -> its sub-resources` shape as `taxonomyQueryKeys`
 * (`src/taxonomy/data/apiHooks.ts`), so invalidating `competency(tagId)`
 * would clear every query scoped to one competency at once.
 */
export const competencyQueryKeys = {
  all: ['competencyManagement'],
  /** Base key for data specific to one competency (tag). No data is stored directly in this key.
   * @param tagId ID of the competency (tag)
   */
  competency: (tagId: number) => [...competencyQueryKeys.all, 'competency', tagId],
  competencyCriteriaGroups: (tagId: number, courseKeys?: string[]) => [
    ...competencyQueryKeys.competency(tagId),
    'criteriaGroups',
    ...(courseKeys ? [courseKeys] : []),
  ],
  /** The studio-wide default rule profile. */
  defaultRuleProfile: () => [...competencyQueryKeys.all, 'defaultRuleProfile'],
} satisfies Record<
  string,
  Array<string | number | undefined> | ((...args: any[]) => Array<string | number | string[] | undefined>)
>;

/** @param courseKeys The listed courses' keys; `undefined` until reported, which keeps the query disabled. */
export const useCompetencyCriteriaGroups = (tagId: number, courseKeys: string[] | undefined) => (
  useQuery({
    queryKey: competencyQueryKeys.competencyCriteriaGroups(tagId, courseKeys),
    queryFn: courseKeys !== undefined
      ? () => api.getCompetencyCriteriaGroups(tagId, courseKeys)
      : skipToken,
  })
);

export const useDefaultCompetencyRuleProfile = () => (
  useQuery({
    queryKey: competencyQueryKeys.defaultRuleProfile(),
    queryFn: () => api.getDefaultCompetencyRuleProfile(),
  })
);

/**
 * Refresh every criteria-groups page of one competency after a write. Each
 * course-list page is its own scoped cache entry, and only marking an
 * inactive page stale would let revisiting it briefly render that page's
 * cached, pre-write `totalCriteriaCount` until the refetch lands. Removing
 * the inactive entries makes a revisit fetch fresh, and the active entry
 * still refetches through the invalidation.
 * @returns The invalidation promise, which settles once the active refetch lands.
 */
const refreshCompetencyCriteriaGroups = (queryClient: QueryClient, tagId: number) => {
  const queryKey = competencyQueryKeys.competencyCriteriaGroups(tagId);
  queryClient.removeQueries({ queryKey, type: 'inactive' });
  return queryClient.invalidateQueries({ queryKey });
};

/**
 * Build the mutation to create a new criterion under a competency.
 * Refreshes that competency's criteria-groups queries on success (see
 * `refreshCompetencyCriteriaGroups`) so the new criterion shows up without a
 * manual refetch.
 */
export const useCreateCompetencyCriterion = () => {
  const queryClient = useQueryClient();
  return useMutation<
    CreateCompetencyCriterionResponse,
    AxiosError<Record<string, string[]>>,
    { tagId: number; payload: CreateCompetencyCriterionPayload; }
  >({
    mutationFn: (
      { tagId, payload }: { tagId: number; payload: CreateCompetencyCriterionPayload; },
    ) => api.createCompetencyCriterion(tagId, payload),
    // Returned so the mutation stays pending until the refetch completes.
    onSuccess: (_data, { tagId }) => refreshCompetencyCriteriaGroups(queryClient, tagId),
  });
};

/**
 * Build the mutation to update a bottom-tier group's any/all combining
 * logic (`#760`). Refreshes that competency's criteria-groups queries on
 * success (see `refreshCompetencyCriteriaGroups`) so the new operator shows
 * up without a manual refetch.
 */
export const useUpdateCompetencyCriteriaGroupOperator = () => {
  const queryClient = useQueryClient();
  return useMutation<
    CompetencyCriteriaGroup,
    AxiosError<Record<string, string[]>>,
    { tagId: number; groupId: number; logicOperator: CompetencyGroupLogicOperator; }
  >({
    mutationFn: (
      { tagId, groupId, logicOperator }: {
        tagId: number;
        groupId: number;
        logicOperator: CompetencyGroupLogicOperator;
      },
    ) => api.updateCompetencyCriteriaGroupOperator(tagId, groupId, logicOperator),
    onSuccess: (_data, { tagId }) => refreshCompetencyCriteriaGroups(queryClient, tagId),
  });
};

/**
 * Build the mutation to batch-update a rule box's score threshold (`#759`).
 * Refreshes that competency's criteria-groups queries on success (see `refreshCompetencyCriteriaGroups`)
 * so the new score shows up without a manual refetch. `tagId` is only used for that refresh - the
 * endpoint's own URL isn't nested under a competency.
 */
export const useUpdateCompetencyCriteriaRule = () => {
  const queryClient = useQueryClient();
  return useMutation<
    CompetencyCriterion[],
    AxiosError<Record<string, string[]>>,
    { tagId: number; groupId: number; criterionIds: number[]; ruleType: string; rulePayload: GradeRulePayload; }
  >({
    mutationFn: (
      { groupId, criterionIds, ruleType, rulePayload }: {
        tagId: number;
        groupId: number;
        criterionIds: number[];
        ruleType: string;
        rulePayload: GradeRulePayload;
      },
    ) => api.updateCompetencyCriteriaRule(groupId, criterionIds, ruleType, rulePayload),
    onSuccess: (_data, { tagId }) => refreshCompetencyCriteriaGroups(queryClient, tagId),
  });
};

export interface UseCourseTaggingPermissionsReturn {
  isLoading: boolean;
  isError: boolean;
  isAuthzEnabled: boolean;
  permissionsByCourseId: Record<string, boolean>;
}

/**
 * Whether the signed-in author can manage this competency's associations for
 * each of the given courses, via the `courses.manage_tags` authz action
 * (`COURSE_PERMISSIONS.MANAGE_TAGS`).
 *
 * It has to serve both the pre-authz path and the authz path: every course
 * resolves to `true` when `enableAuthzCourseAuthoring` is off, and to `false`
 * while that flag or the permissions call is loading.
 *
 * It also works around `useUserPermissions` keying its cache on the whole
 * query object: adding a course (e.g. expanding a second one) makes a new,
 * momentarily loading query, which would flip every already-resolved course
 * back to `false`. A course id's last-known answer is kept instead.
 */
export const useCourseTaggingPermissions = (courseIds: string[]): UseCourseTaggingPermissionsReturn => {
  // `AUTHZ_COURSE_AUTHORING_FLAG` is a `CourseWaffleFlag`, read per course on the platform. This reads
  // the studio-wide value, which can disagree with a course-scoped override. With the flag off the client
  // reports every course editable and the backend refuses unauthorized creates.
  const waffleFlags = useWaffleFlags();
  const isWaffleFlagsLoading = waffleFlags?.isLoading ?? true;
  const isAuthzEnabled = waffleFlags?.enableAuthzCourseAuthoring ?? false;

  // Memoized on a sorted id string, not the array reference, so the query object (and the cache key
  // that embeds it) stays stable across equivalent `courseIds` arrays.
  const sortedCourseIdsKey = [...courseIds].sort().join(',');
  const query = useMemo<PermissionValidationQuery>(() => {
    if (!sortedCourseIdsKey) {
      return {};
    }
    return sortedCourseIdsKey.split(',').reduce<PermissionValidationQuery>((acc, courseId) => {
      acc[courseId] = { action: COURSE_PERMISSIONS.MANAGE_TAGS, scope: courseId };
      return acc;
    }, {});
  }, [sortedCourseIdsKey]);

  const shouldValidatePermissions = isAuthzEnabled && courseIds.length > 0;
  const {
    isLoading: isLoadingUserPermissions,
    isError: isUserPermissionsError,
    data: userPermissions,
  } = useUserPermissions(
    query,
    shouldValidatePermissions,
  );

  const isLoading = isWaffleFlagsLoading || (isAuthzEnabled && isLoadingUserPermissions);
  const isError = isAuthzEnabled && isUserPermissionsError;

  const [resolvedAnswers, setResolvedAnswers] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!isLoadingUserPermissions && userPermissions) {
      setResolvedAnswers((prev) => ({ ...prev, ...userPermissions }));
    }
  }, [isLoadingUserPermissions, userPermissions]);

  const permissionsByCourseId = useMemo(() => {
    const result: Record<string, boolean> = {};
    courseIds.forEach((courseId) => {
      if (isWaffleFlagsLoading) {
        result[courseId] = false;
      } else {
        result[courseId] = isAuthzEnabled ? (resolvedAnswers[courseId] ?? false) : true;
      }
    });
    return result;
  }, [courseIds, isWaffleFlagsLoading, isAuthzEnabled, resolvedAnswers]);

  return {
    isLoading,
    isError,
    isAuthzEnabled,
    permissionsByCourseId,
  };
};
