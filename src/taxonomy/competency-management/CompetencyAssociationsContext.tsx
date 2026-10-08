import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { getCourseOutlineIndex } from '@src/course-outline/data';
// Bypasses the public barrel deliberately: this is the same query key
// `useCourseOutlineIndex` uses, so the `useQueries` calls below share its
// cache instead of refetching per course.
import { courseOutlineQueryKeys } from '@src/course-outline/data/queryKeys';
import { useToastContext } from '@src/generic/toast-context';

import {
  competencyQueryKeys,
  useCompetencyCriteriaGroups,
  useCourseTaggingPermissions,
  useCreateCompetencyCriterion,
  useDefaultCompetencyRuleProfile,
  useDeleteCompetencyCriteriaGroup,
  useUpdateCompetencyCriteriaGroupOperator,
  useUpdateCompetencyCriteriaRule,
} from './data/apiHooks';
import type {
  CompetencyCriteriaGroupsResponse,
  CompetencyGroupLogicOperator,
  CompetencyRuleProfile,
  CourseCompetencyCriteriaGroup,
  CreateCompetencyCriterionPayload,
  GradeRulePayload,
} from './data/types';
import messages from './messages';
import type { CompetencyCriteriaGroupsIndex, PageOrderSnapshot } from './utils';
import {
  associatedObjectIds,
  bottomTierGroupsForCourse,
  buildCompetencyCriteriaGroupsIndex,
  effectiveRuleOf,
  focusTargetAfterRemoval,
  hasVisibleOrNewCourseGroup,
  isRuleTakenInGroup,
  lastBottomTierGroupForCourse,
  lastRealRuleKeyIn,
  ruleBoxesForGroup,
  ruleKeyOf,
  snapshotPageOrder,
  visibleCourseGroups,
} from './utils';

/** A rule box only means anything inside its own group, so `groupId` and
 * `ruleKey` are always written together (see `focusGroup`/`focusRuleBox`).
 *
 * `groupId === null` means the focused group is a not-yet-saved placeholder
 * group. `ruleKey === null` means a placeholder rule box is focused, inside
 * the focused real group or inside the placeholder group. Only one
 * placeholder can exist at a time, since `focus` has only one slot.
 */
export interface CriteriaFocus {
  groupId: number | null;
  ruleKey: string | null;
}

/** A one-shot request for the browser's keyboard focus, left by a delete
 * because the trash button that had it is gone. Kept here, not in the cards,
 * since they can unmount and remount (or be collapsed) before the new target
 * renders. `group` names the bottom-tier group whose header band takes it;
 * `empty` is the "no associations" message. `expand` says whether a
 * collapsed course-level group holding the target should open for it: true
 * when focus moved there, false when the author's own focus stays where it
 * was and a section they collapsed is theirs to keep.
 */
export type KeyboardFocusRequest = { kind: 'group'; groupId: number; expand: boolean; } | { kind: 'empty'; };

export interface CompetencyAssociationsContextValue {
  /** Both start unset (`null`); see `CriteriaFocus` above for why the pair
   * is always written together.
   */
  focus: CriteriaFocus | null;
  /** The author's choices on the placeholder, kept apart from `focus`
   * because the non-placeholder flows also write `focus`. `parentRuleGroupId`
   * and `logicOperator` only matter while `focus.groupId === null`.
   */
  placeholder: {
    parentRuleGroupId: number | null;
    logicOperator: CompetencyGroupLogicOperator;
    rulePayload: GradeRulePayload | null;
  };
  /** Starts a placeholder rule box in the given real group, replacing any
   * existing placeholder.
   */
  addPlaceholderRuleBox: (groupId: number) => void;
  /** Starts a placeholder group under the given course-level group,
   * replacing any existing placeholder.
   */
  addPlaceholderGroup: (parentRuleGroupId: number) => void;
  /** Sets the placeholder group's own any/all combining logic. */
  setPlaceholderLogicOperator: (logicOperator: CompetencyGroupLogicOperator) => void;
  /** Sets the placeholder rule box's score, which is only persisted once
   * content is associated.
   */
  setPlaceholderRulePayload: (rulePayload: GradeRulePayload) => void;
  /** True after content was selected while the placeholder's score duplicated
   * a box in its group; the request is not sent.
   */
  placeholderDuplicateRejected: boolean;
  /** Drops the placeholder by clearing `focus`. */
  discardPlaceholder: () => void;
  /** Whether a placeholder exists, which disables both add controls. */
  hasPlaceholder: boolean;
  /** Focuses a group and its last real rule box (`lastRealRuleKeyIn`). A
   * no-op when `groupId` is already focused, so re-clicking the group
   * heading doesn't discard a rule box the author had selected inside it.
   */
  focusGroup: (groupId: number) => void;
  /** Focuses one specific rule box, and the group it belongs to, together. */
  focusRuleBox: (groupId: number, ruleKey: string) => void;
  /** Notify the provider that a course was expanded in the content panel.
   * Call only from that panel's own per-course chevron on expand, never on
   * collapse or from a page-level "Expand All": this feeds `canEditCourse`
   * for a group-less course, and has no effect on initial focus.
   */
  notifyCourseExpanded: (courseId: string) => void;
  /** Associates a piece of course content (a gradable subsection) with the
   * active competency.
   */
  associateSubsection: (objectId: string, courseId: string) => void;
  /** Updates a bottom-tier group's any/all combining logic (`#760`). A
   * rejected save is a no-op besides a failure toast: `group.logicOperator`
   * is only ever written by the next successful `groupsQuery` refetch.
   */
  updateGroupOperator: (groupId: number, logicOperator: CompetencyGroupLogicOperator) => void;
  /** Updates a rule box's score threshold, across every criterion listed in
   * `criterionIds` (`#759`). The rule type is pinned to the box's current
   * effective rule, resolved here rather than accepted from the caller,
   * since only the numeric value is user-editable. On success, repairs
   * focus using the mutation's own response rather than the request, since
   * a "reset to default" edit can be echoed back differently than it was
   * sent. Returns a `Promise` (not `void`) so `ScoreThresholdField` can
   * revert its own local input on rejection, without owning the mutation.
   */
  updateRuleScore: (groupId: number, criterionIds: number[], rulePayload: GradeRulePayload) => Promise<void>;
  /** Deletes a bottom-tier or course-level group (`#709`), then moves focus
   * per `focusTargetAfterRemoval` once the refetch lands. Dropped while
   * another delete is in flight. A 404 counts as success; any other failure
   * is a toast, with focus kept unless the refetch shows the group gone.
   */
  deleteGroup: (groupId: number) => void;
  /** True while a delete request or its follow-up refetch is in flight;
   * every delete control, and the content panel's subsection select,
   * disable on it.
   */
  isDeletingGroup: boolean;
  /** Discards the placeholder group without a request and focuses the last
   * saved group in its course-level group, or nothing when it has none.
   */
  removePlaceholderGroup: () => void;
  keyboardFocusRequest: KeyboardFocusRequest | null;
  /** Clears `keyboardFocusRequest` once the component it names has taken it. */
  consumeKeyboardFocusRequest: () => void;
  /**
   * Whether the signed-in author can create/manage associations for the
   * given course, via `useCourseTaggingPermissions`'s `courses.manage_tags`
   * check.
   */
  canEditCourse: (courseId: string) => boolean;
  groupsQuery: UseQueryResult<CompetencyCriteriaGroupsResponse>;
  profileQuery: UseQueryResult<CompetencyRuleProfile>;
  /** Built from `groupsQuery.data`; `undefined` until that query resolves. */
  index: CompetencyCriteriaGroupsIndex | undefined;
  systemDefaultProfile: CompetencyRuleProfile | undefined;
  /** Every already-associated criterion's `objectId`, across the whole
   * tree: the create mutation's duplicate guard and the content panel's
   * "already associated" marking both read this.
   */
  associatedObjectIds: Set<string>;
  /** `utils.ts`'s `visibleCourseGroups`, filtered by this provider's own
   * per-course outline-fetch results.
   */
  accessibleCourseGroups: CourseCompetencyCriteriaGroup[];
  /** The active competency's short external id (e.g. "CCRS-1.3"), shown on
   * an already-associated subsection's badge. `null` when the competency
   * has none.
   */
  competencyExternalId: string | null;
}

// Exported so component tests can render a hand-built value via
// `<CompetencyAssociationsContext.Provider>` without mocking every HTTP
// request the real provider would issue - see e.g. `criteria-groups/RuleBox.test.tsx`.
export const CompetencyAssociationsContext = createContext<CompetencyAssociationsContextValue | undefined>(undefined);

/** Reads the current competency-associations context. Throws outside a
 * `<CompetencyAssociationsProvider>` ancestor rather than a no-op default,
 * so a missing provider surfaces instead of failing silently.
 */
export function useCompetencyAssociations(): CompetencyAssociationsContextValue {
  const ctx = useContext(CompetencyAssociationsContext);
  if (ctx === undefined) {
    throw new Error(
      'useCompetencyAssociations() was used in a component without a <CompetencyAssociationsProvider> ancestor.',
    );
  }
  return ctx;
}

export interface CompetencyAssociationsProviderProps {
  tagId: number;
  /** The active competency's short external id, for the already-associated
   * badge in the content panel below. `null` when the competency has none.
   */
  competencyExternalId: string | null;
  children: ReactNode;
}

/** Provides per-competency criteria-association state to the right-hand
 * course panel.
 *
 * Never remounted (no `key={tagId}`), so it doesn't reset
 * `CourseSearchBrowse`'s own state on competency change; instead it resets
 * its own state by comparing the incoming `tagId` against the previous
 * render's value, React's documented alternative to a remounting `key`.
 */
export const CompetencyAssociationsProvider = ({
  tagId,
  competencyExternalId,
  children,
}: CompetencyAssociationsProviderProps) => {
  const intl = useIntl();
  const { showToast } = useToastContext();

  const [prevTagId, setPrevTagId] = useState(tagId);
  const [focus, setFocus] = useState<CriteriaFocus | null>(null);
  const [placeholder, setPlaceholder] = useState<CompetencyAssociationsContextValue['placeholder']>({
    parentRuleGroupId: null,
    logicOperator: 'OR',
    rulePayload: null,
  });
  const [duplicateRejected, setDuplicateRejected] = useState(false);
  const [keyboardFocusRequest, setKeyboardFocusRequest] = useState<KeyboardFocusRequest | null>(null);
  const [expandedCourseIds, setExpandedCourseIds] = useState<Set<string>>(new Set());
  const hasRunInitialFocusRef = useRef(false);
  if (tagId !== prevTagId) {
    setPrevTagId(tagId);
    setFocus(null);
    setPlaceholder({ parentRuleGroupId: null, logicOperator: 'OR', rulePayload: null });
    setDuplicateRejected(false);
    setKeyboardFocusRequest(null);
    setExpandedCourseIds(new Set());
    hasRunInitialFocusRef.current = false;
  }

  const groupsQuery = useCompetencyCriteriaGroups(tagId);
  const profileQuery = useDefaultCompetencyRuleProfile();
  const createCriterion = useCreateCompetencyCriterion();
  const updateGroupOperatorMutation = useUpdateCompetencyCriteriaGroupOperator();
  const updateRuleScoreMutation = useUpdateCompetencyCriteriaRule();
  const { mutate: mutateDeleteGroup, isPending: isDeletingGroup } = useDeleteCompetencyCriteriaGroup();
  const queryClient = useQueryClient();
  // Closes the gap between a click and the render that disables the trash buttons.
  const isDeleteInFlightRef = useRef(false);
  // A delete's settle callback runs after the refetch, so it reads the
  // latest focus and placeholder through refs to respect a click made
  // while the request was in flight.
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;

  const index = useMemo(
    () => (groupsQuery.data ? buildCompetencyCriteriaGroupsIndex(groupsQuery.data) : undefined),
    [groupsQuery.data],
  );
  const systemDefaultProfile = profileQuery.data;
  const associatedIds = useMemo(
    () => (groupsQuery.data ? associatedObjectIds(groupsQuery.data) : new Set<string>()),
    [groupsQuery.data],
  );

  const notifyCourseExpanded = useCallback((courseId: string) => {
    setExpandedCourseIds((prev) => (prev.has(courseId) ? prev : new Set(prev).add(courseId)));
    if (focus !== null && focus.ruleKey === null && index && systemDefaultProfile) {
      // The course holding the placeholder keeps it. Any other course that
      // already has groups takes focus, so the placeholder does not linger.
      const placeholderGroupId = focus.groupId !== null
        ? index.groupsById.get(focus.groupId)?.parentId
        : placeholder.parentRuleGroupId;
      const placeholderCourse = placeholderGroupId != null ? index.groupsById.get(placeholderGroupId) : undefined;
      if (placeholderCourse?.courseKey === courseId) {
        return;
      }
      const lastGroup = lastBottomTierGroupForCourse(index, courseId);
      if (lastGroup) {
        setKeyboardFocusRequest(null);
        setDuplicateRejected(false);
        setFocus({ groupId: lastGroup.id, ruleKey: lastRealRuleKeyIn(lastGroup.id, index, systemDefaultProfile) });
      }
    }
  }, [focus, placeholder.parentRuleGroupId, index, systemDefaultProfile]);

  // Every course-level group's course key, unfiltered - each must be
  // fetched to determine accessibility (see `accessibleCourseIds` below).
  // Also feeds the initial-focus gate and, unioned with `expandedCourseIds`,
  // `canEditCourse`'s permission check.
  const courseIdsWithGroups = useMemo(
    () => (index ? index.courseGroups.map((courseGroup) => courseGroup.courseKey) : []),
    [index],
  );

  const outlineQueries = useQueries({
    queries: courseIdsWithGroups.map((courseId) => ({
      queryKey: courseOutlineQueryKeys.index(courseId),
      queryFn: () => getCourseOutlineIndex(courseId),
      retry: false as const,
    })),
  });
  const allVisibleCourseOutlinesResolved = outlineQueries.every((query) => !query.isLoading);

  // A course counts as accessible only once its outline fetch succeeds - a
  // failed fetch is excluded entirely rather than shown with a placeholder
  // name, and a still-loading one doesn't count as accessible either.
  const accessibleCourseIds = useMemo(() => {
    const ids = new Set<string>();
    courseIdsWithGroups.forEach((courseId, i) => {
      if (outlineQueries[i]?.isSuccess) {
        ids.add(courseId);
      }
    });
    return ids;
  }, [courseIdsWithGroups, outlineQueries]);

  const accessibleCourseGroups = useMemo(
    () => (index ? visibleCourseGroups(index, accessibleCourseIds) : []),
    [index, accessibleCourseIds],
  );

  const focusGroup = useCallback((groupId: number) => {
    setFocus((prev) => {
      if (prev?.groupId === groupId) {
        // No-op: clicking the group already in focus must not re-resolve
        // its default rule box, or it would silently throw away whichever
        // rule box the author had selected inside it.
        return prev;
      }
      const ruleKey = (index && systemDefaultProfile) ? lastRealRuleKeyIn(groupId, index, systemDefaultProfile) : null;
      return { groupId, ruleKey };
    });
    setKeyboardFocusRequest(null);
    setDuplicateRejected(false);
  }, [index, systemDefaultProfile]);

  const focusRuleBox = useCallback((groupId: number, ruleKey: string) => {
    setFocus({ groupId, ruleKey });
    setKeyboardFocusRequest(null);
    setDuplicateRejected(false);
  }, []);

  const addPlaceholderRuleBox = useCallback((groupId: number) => {
    setFocus({ groupId, ruleKey: null });
    setKeyboardFocusRequest(null);
    setPlaceholder((prev) => ({ ...prev, rulePayload: null }));
    setDuplicateRejected(false);
  }, []);

  const addPlaceholderGroup = useCallback((parentRuleGroupId: number) => {
    setFocus({ groupId: null, ruleKey: null });
    setKeyboardFocusRequest(null);
    setPlaceholder({ parentRuleGroupId, logicOperator: 'OR', rulePayload: null });
    setDuplicateRejected(false);
  }, []);

  const setPlaceholderLogicOperator = useCallback((logicOperator: CompetencyGroupLogicOperator) => {
    setPlaceholder((prev) => ({ ...prev, logicOperator }));
  }, []);

  const setPlaceholderRulePayload = useCallback((rulePayload: GradeRulePayload) => {
    setPlaceholder((prev) => ({ ...prev, rulePayload }));
    setDuplicateRejected(false);
  }, []);

  const discardPlaceholder = useCallback(() => {
    setFocus(null);
    setKeyboardFocusRequest(null);
    setDuplicateRejected(false);
  }, []);

  const hasPlaceholder = focus !== null && focus.ruleKey === null;

  // Runs at most once per competency: once groups, profile, and every
  // course-with-a-group's outline have resolved, focus the sole bottom-tier
  // group if exactly one exists among *accessible* course-level groups (an
  // inaccessible one isn't rendered, so it must never be auto-focus
  // eligible). Independent of `expandedCourseIds`, which must not delay
  // this gate. A click that sets focus first beats this auto-focus; the
  // effect still marks itself as run, it just skips writing.
  useEffect(() => {
    if (hasRunInitialFocusRef.current) {
      return;
    }
    if (!groupsQuery.isSuccess || !profileQuery.isSuccess || !allVisibleCourseOutlinesResolved || !index) {
      return;
    }
    hasRunInitialFocusRef.current = true;
    if (focus !== null) {
      return;
    }
    const allBottomTierGroups = accessibleCourseGroups
      .flatMap((courseGroup) => bottomTierGroupsForCourse(index, courseGroup.courseKey));
    if (allBottomTierGroups.length === 1) {
      focusGroup(allBottomTierGroups[0].id);
    }
  }, [
    groupsQuery.isSuccess,
    profileQuery.isSuccess,
    allVisibleCourseOutlinesResolved,
    index,
    accessibleCourseGroups,
    focus,
    focusGroup,
  ]);

  // `canEditCourse`'s course list: every course with a group plus every
  // course expanded in the content panel (even group-less). Must not feed
  // the initial-focus gate above.
  const courseIdsForPermissions = useMemo(() => {
    const ids = new Set(expandedCourseIds);
    courseIdsWithGroups.forEach((courseId) => ids.add(courseId));
    return Array.from(ids);
  }, [expandedCourseIds, courseIdsWithGroups]);

  const { permissionsByCourseId } = useCourseTaggingPermissions(courseIdsForPermissions);
  const canEditCourse = useCallback(
    (courseId: string) => permissionsByCourseId[courseId] ?? false,
    [permissionsByCourseId],
  );

  const associateSubsection = useCallback((objectId: string, courseId: string) => {
    if (associatedIds.has(objectId)) {
      // Not a real failure - the backend is still the real backstop for a
      // race, this only spares the author a failed-request error for
      // something that isn't actually one.
      showToast(intl.formatMessage(messages.alreadyAssociatedToastMessage));
      return;
    }
    if (!index || !systemDefaultProfile) {
      // Shouldn't happen: the content panel only offers this action once
      // both queries have resolved.
      return;
    }

    let groupId: number | undefined;
    let ruleTypeOverride: string | undefined;
    let rulePayloadOverride: GradeRulePayload | undefined;
    let logicOperator: CompetencyGroupLogicOperator | undefined;

    if (focus && focus.groupId !== null) {
      const focusedGroup = index.groupsById.get(focus.groupId);
      if (focusedGroup && focusedGroup.parentId !== null) {
        const courseGroup = index.groupsById.get(focusedGroup.parentId);
        if (courseGroup?.courseKey === courseId) {
          if (focus.ruleKey !== null) {
            const box = ruleBoxesForGroup(focus.groupId, index, systemDefaultProfile)
              .find((candidate) => candidate.key === focus.ruleKey);
            if (box) {
              groupId = focus.groupId;
              ruleTypeOverride = box.rule.ruleType;
              rulePayloadOverride = box.rule.rulePayload;
            }
          } else {
            // ADR 0002: an override is complete or absent, so the pair is
            // only sent once the author has set a score.
            const placeholderRule = {
              ruleType: systemDefaultProfile.ruleType,
              rulePayload: placeholder.rulePayload ?? systemDefaultProfile.rulePayload,
            };
            // Sending an untouched duplicate would silently merge into the existing box.
            if (isRuleTakenInGroup(placeholderRule, ruleBoxesForGroup(focus.groupId, index, systemDefaultProfile))) {
              setDuplicateRejected(true);
              return;
            }
            groupId = focus.groupId;
            if (placeholder.rulePayload !== null) {
              ruleTypeOverride = systemDefaultProfile.ruleType;
              rulePayloadOverride = placeholder.rulePayload;
            }
          }
        }
      }
    } else if (focus && focus.groupId === null) {
      // A placeholder group only applies to content from its own course.
      const parentGroup = placeholder.parentRuleGroupId !== null
        ? index.groupsById.get(placeholder.parentRuleGroupId)
        : undefined;
      if (parentGroup?.courseKey === courseId) {
        logicOperator = placeholder.logicOperator;
        if (placeholder.rulePayload !== null) {
          ruleTypeOverride = systemDefaultProfile.ruleType;
          rulePayloadOverride = placeholder.rulePayload;
        }
      }
    }

    const payload: CreateCompetencyCriterionPayload = {
      object_id: objectId,
      ...(groupId !== undefined ? { group_id: groupId } : {}),
      ...(ruleTypeOverride !== undefined ? { rule_type_override: ruleTypeOverride } : {}),
      ...(rulePayloadOverride !== undefined ? { rule_payload_override: rulePayloadOverride } : {}),
      ...(logicOperator !== undefined ? { logic_operator: logicOperator } : {}),
    };

    createCriterion.mutate({ tagId, payload }, {
      onSuccess: (criterion) => {
        // From the response itself, not `lastRealRuleKeyIn` against the
        // local tree: the groups query hasn't refetched yet, so the local
        // tree still doesn't know about this brand-new criterion (or
        // group) and would resolve a stale/`null` rule key.
        setDuplicateRejected(false);
        setFocus({
          groupId: criterion.groupId,
          ruleKey: ruleKeyOf(criterion, systemDefaultProfile),
        });
      },
      onError: (error) => {
        // The backend's hierarchy dominance check (ADR 0002): rejects a new
        // criterion when an ancestor or descendant competency already has
        // criteria in the same course, as a 400 with a `tag_id` field error.
        const { response } = error;
        const isHierarchyConflict = response?.status === 400
          && typeof response.data === 'object' && response.data !== null && 'tag_id' in response.data;
        showToast(intl.formatMessage(
          isHierarchyConflict
            ? messages.createCriterionHierarchyConflictToastMessage
            : messages.createCriterionFailedToastMessage,
        ));
      },
    });
  }, [associatedIds, index, systemDefaultProfile, focus, placeholder, tagId, createCriterion, showToast, intl]);

  const updateGroupOperator = useCallback((groupId: number, logicOperator: CompetencyGroupLogicOperator) => {
    updateGroupOperatorMutation.mutate({ tagId, groupId, logicOperator }, {
      onError: () => {
        // No local rollback needed: `LogicOperatorSelect` always renders
        // from `group.logicOperator`, which a rejected mutation never touches.
        showToast(intl.formatMessage(messages.updateGroupOperatorFailedToastMessage));
      },
    });
  }, [tagId, updateGroupOperatorMutation, showToast, intl]);

  const updateRuleScore = useCallback((
    groupId: number,
    criterionIds: number[],
    rulePayload: GradeRulePayload,
  ): Promise<void> => {
    if (!index || !systemDefaultProfile) {
      // Shouldn't happen: a rule box is only ever rendered - let alone made
      // editable - once both queries have resolved.
      return Promise.resolve();
    }
    // Rule type is pinned to the box's current effective rule, resolved
    // from any one criterion already in it (they all share it, by definition).
    const groupCriteria = index.criteriaByGroupId.get(groupId) ?? [];
    const anchorCriterion = groupCriteria.find((criterion) => criterionIds.includes(criterion.id));
    if (!anchorCriterion) {
      return Promise.resolve();
    }
    const { ruleType } = effectiveRuleOf(anchorCriterion, systemDefaultProfile);

    return updateRuleScoreMutation.mutateAsync({ tagId, groupId, criterionIds, ruleType, rulePayload })
      .then((updatedCriteria) => {
        // From the response, not the request: a "reset to default" edit can
        // echo back a shared profile reference instead of the sent values,
        // so the new focus key has to come from what was actually persisted.
        const [updatedCriterion] = updatedCriteria;
        if (updatedCriterion) {
          setFocus({ groupId, ruleKey: ruleKeyOf(updatedCriterion, systemDefaultProfile) });
        }
      })
      .catch((error) => {
        showToast(intl.formatMessage(messages.updateRuleScoreFailedToastMessage));
        // Re-thrown so ScoreThresholdField's own commit handler also sees
        // the rejection and reverts its local input.
        throw error;
      });
  }, [index, systemDefaultProfile, tagId, updateRuleScoreMutation, showToast, intl]);

  const consumeKeyboardFocusRequest = useCallback(() => setKeyboardFocusRequest(null), []);

  // Unlike `focusGroup`, lands on the group's first rule box, and the rule
  // key is `null` for a group with none, which focuses a placeholder rule
  // box, as `focusGroup` does.
  const focusGroupAfterRemoval = useCallback((
    groupId: number,
    freshIndex: CompetencyCriteriaGroupsIndex,
    shouldRequestKeyboardFocus: boolean,
  ) => {
    const ruleKey = systemDefaultProfile
      ? (ruleBoxesForGroup(groupId, freshIndex, systemDefaultProfile)[0]?.key ?? null)
      : null;
    setFocus({ groupId, ruleKey });
    setDuplicateRejected(false);
    setKeyboardFocusRequest(shouldRequestKeyboardFocus ? { kind: 'group', groupId, expand: true } : null);
  }, [systemDefaultProfile]);

  const resolveFocusAfterDelete = useCallback((deletedGroupId: number, snapshot: PageOrderSnapshot) => {
    const freshData = queryClient.getQueryData<CompetencyCriteriaGroupsResponse>(
      competencyQueryKeys.competencyCriteriaGroups(tagId),
    );
    if (!freshData) {
      return;
    }
    const freshIndex = buildCompetencyCriteriaGroupsIndex(freshData);
    const currentFocus = focusRef.current;
    const target = focusTargetAfterRemoval(
      snapshot,
      freshIndex,
      currentFocus,
      placeholderRef.current.parentRuleGroupId,
    );
    // A failed or no-op delete leaves the trash button in the DOM, which
    // keeps the browser's focus; only a vanished group strands it.
    const isDeletedGroupGone = !freshIndex.groupsById.has(deletedGroupId);

    if (target === 'unchanged') {
      const focusedGroupId = currentFocus?.groupId ?? null;
      if (isDeletedGroupGone && focusedGroupId !== null) {
        setKeyboardFocusRequest({ kind: 'group', groupId: focusedGroupId, expand: false });
      }
    } else if (target === null) {
      setFocus(null);
      setDuplicateRejected(false);
      setKeyboardFocusRequest(
        isDeletedGroupGone && !hasVisibleOrNewCourseGroup(snapshot, freshIndex) ? { kind: 'empty' } : null,
      );
    } else {
      focusGroupAfterRemoval(target, freshIndex, isDeletedGroupGone);
    }
  }, [queryClient, tagId, focusGroupAfterRemoval]);

  const deleteGroup = useCallback((groupId: number) => {
    if (isDeleteInFlightRef.current || !index) {
      return;
    }
    isDeleteInFlightRef.current = true;
    const snapshot = snapshotPageOrder(index, accessibleCourseGroups);
    mutateDeleteGroup({ tagId, groupId }, {
      onError: (error) => {
        // 404: the group is already gone, which is what the author asked for.
        if (error.response?.status !== 404) {
          showToast(intl.formatMessage(messages.deleteGroupFailedToastMessage));
        }
      },
      onSettled: () => {
        isDeleteInFlightRef.current = false;
        resolveFocusAfterDelete(groupId, snapshot);
      },
    });
  }, [index, accessibleCourseGroups, tagId, mutateDeleteGroup, resolveFocusAfterDelete, showToast, intl]);

  const removePlaceholderGroup = useCallback(() => {
    const { parentRuleGroupId } = placeholder;
    const parentGroup = parentRuleGroupId !== null ? index?.groupsById.get(parentRuleGroupId) : undefined;
    const lastGroup = index && parentGroup?.courseKey != null
      ? lastBottomTierGroupForCourse(index, parentGroup.courseKey)
      : null;
    if (index && lastGroup) {
      focusGroupAfterRemoval(lastGroup.id, index, true);
    } else {
      setFocus(null);
      setKeyboardFocusRequest(null);
    }
  }, [placeholder, index, focusGroupAfterRemoval]);

  const contextValue = useMemo<CompetencyAssociationsContextValue>(() => ({
    focus,
    placeholder,
    addPlaceholderRuleBox,
    addPlaceholderGroup,
    setPlaceholderLogicOperator,
    setPlaceholderRulePayload,
    discardPlaceholder,
    hasPlaceholder,
    placeholderDuplicateRejected: duplicateRejected,
    focusGroup,
    focusRuleBox,
    notifyCourseExpanded,
    associateSubsection,
    updateGroupOperator,
    updateRuleScore,
    deleteGroup,
    isDeletingGroup,
    removePlaceholderGroup,
    keyboardFocusRequest,
    consumeKeyboardFocusRequest,
    canEditCourse,
    groupsQuery,
    profileQuery,
    index,
    systemDefaultProfile,
    associatedObjectIds: associatedIds,
    accessibleCourseGroups,
    competencyExternalId,
  }), [
    focus,
    placeholder,
    addPlaceholderRuleBox,
    addPlaceholderGroup,
    setPlaceholderLogicOperator,
    setPlaceholderRulePayload,
    discardPlaceholder,
    hasPlaceholder,
    duplicateRejected,
    focusGroup,
    focusRuleBox,
    notifyCourseExpanded,
    associateSubsection,
    updateGroupOperator,
    updateRuleScore,
    deleteGroup,
    isDeletingGroup,
    removePlaceholderGroup,
    keyboardFocusRequest,
    consumeKeyboardFocusRequest,
    canEditCourse,
    groupsQuery,
    profileQuery,
    index,
    systemDefaultProfile,
    associatedIds,
    accessibleCourseGroups,
    competencyExternalId,
  ]);

  return (
    <CompetencyAssociationsContext.Provider value={contextValue}>
      {children}
    </CompetencyAssociationsContext.Provider>
  );
};
