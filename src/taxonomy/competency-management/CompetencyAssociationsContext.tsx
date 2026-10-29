import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode, SetStateAction } from 'react';
import { Error as ErrorIcon, InfoOutline } from '@openedx/paragon/icons';
import { useIntl } from '@edx/frontend-platform/i18n';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

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
  useDeleteCompetencyCriterion,
  useDeleteCompetencyRuleBox,
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
import { courseKeyOfFocus, resolveCreateTarget } from './criterionTarget';
import messages from './messages';
import { usePlaceholderState } from './usePlaceholderState';
import { useRemovalConfirmation } from './useRemovalConfirmation';
import type {
  CompetencyCriteriaGroupsIndex,
  PageOrderSnapshot,
  RemovalSummary,
  RemovalTarget,
} from './utils';
import {
  associatedObjectIds,
  bottomTierGroupsForCourse,
  buildCompetencyCriteriaGroupsIndex,
  effectiveRuleOf,
  focusTargetAfterRemoval,
  hasVisibleOrNewCourseGroup,
  lastBottomTierGroupForCourse,
  lastRealRuleKeyIn,
  ruleBoxesForGroup,
  ruleKeyAfterRemoval,
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

/** The author's choices on the placeholder, kept apart from `focus`
 * because the non-placeholder flows also write `focus`. `parentRuleGroupId`
 * and `logicOperator` only matter while `focus.groupId === null`.
 */
export interface CriteriaPlaceholder {
  parentRuleGroupId: number | null;
  logicOperator: CompetencyGroupLogicOperator;
  rulePayload: GradeRulePayload | null;
}

/** One-shot keyboard focus target after a delete removed the focused control: a `group`
 * card, the `empty` "no associations" message, or a Browse Courses `subsection` row.
 * `expand`: whether a collapsed section holding the target group should open for it.
 */
export type KeyboardFocusRequest =
  | { kind: 'group'; groupId: number; expand: boolean; }
  | { kind: 'empty'; }
  | { kind: 'subsection'; objectId: string; };

/** A removal awaiting confirmation. */
export interface PendingRemoval {
  target: RemovalTarget;
  summary: RemovalSummary;
  failure: 'nothing-removed' | 'partly-removed' | null;
}

export interface CompetencyAssociationsContextValue {
  focus: CriteriaFocus | null;
  placeholder: CriteriaPlaceholder;
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
   * collapse or from a page-level "Expand All". Feeds `canEditCourse` for a
   * group-less course, and moves focus to the course's last bottom-tier group
   * and its last rule box when focus is unset or on another course's group.
   */
  notifyCourseExpanded: (courseId: string) => void;
  /** Associates a piece of course content (a gradable subsection) with the
   * active competency.
   */
  associateSubsection: (objectId: string, courseId: string) => void;
  /** Updates a bottom-tier group's any/all combining logic (`#760`); a
   * rejected save is a no-op besides a failure toast.
   */
  updateGroupOperator: (groupId: number, logicOperator: CompetencyGroupLogicOperator) => void;
  /** Updates a rule box's score threshold across every criterion listed in
   * `criterionIds` (`#759`), deriving the new focus key from the response.
   */
  updateRuleScore: (groupId: number, criterionIds: number[], rulePayload: GradeRulePayload) => Promise<void>;
  /** True while any delete, or its refetch, is in flight. */
  isDeleting: boolean;
  /** The removal awaiting confirmation, or `null` while no dialog is open. */
  pendingRemoval: PendingRemoval | null;
  /** Opens the confirmation for one removal without sending a request. Ignored while a delete is in flight, or when
   * the loaded data no longer has the target.
   */
  requestRemoval: (target: RemovalTarget) => void;
  /** Runs the pending removal. Closes the dialog on success, and on failure leaves it open with `failure` set so a
   * second call retries. Ignored while a delete is in flight.
   */
  confirmRemoval: () => Promise<void>;
  /** Closes the confirmation without a request. */
  cancelRemoval: () => void;
  /** Discards the placeholder group without a request and focuses the last
   * saved group in its course-level group, or nothing when it has none.
   */
  removePlaceholderGroup: () => void;
  /** Discards a saved group's placeholder rule box without a request; focus returns to the box above it. */
  removePlaceholderRuleBox: () => void;
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
  /** Whether any course-level group's outline fetch is still pending.
   * `accessibleCourseGroups` is incomplete until this is `false`. A failed
   * fetch counts as resolved.
   */
  areCourseOutlinesLoading: boolean;
  /** The active competency's short external id (e.g. "CCRS-1.3"), shown on
   * an already-associated subsection's badge. `null` when the competency
   * has none.
   */
  competencyExternalId: string | null;
  /** The active competency's name, shown in the Course Group menu's
   * "Remove from {competencyName}" item.
   */
  competencyName: string;
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
  competencyName: string;
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
  competencyName,
  competencyExternalId,
  children,
}: CompetencyAssociationsProviderProps) => {
  const intl = useIntl();
  const { showToast } = useToastContext();

  const [prevTagId, setPrevTagId] = useState(tagId);
  const [focus, setFocus] = useState<CriteriaFocus | null>(null);
  const [keyboardFocusRequest, setKeyboardFocusRequest] = useState<KeyboardFocusRequest | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  // Any focus write other than a delete's own drops a pending keyboard focus request.
  const setFocusAndDropKeyboardRequest = useCallback((next: SetStateAction<CriteriaFocus | null>) => {
    setFocus(next);
    setKeyboardFocusRequest(null);
  }, []);
  const {
    placeholder,
    duplicateRejected,
    setDuplicateRejected,
    resetPlaceholderState,
    addPlaceholderRuleBox,
    addPlaceholderGroup,
    setPlaceholderLogicOperator,
    setPlaceholderRulePayload,
    discardPlaceholder,
  } = usePlaceholderState(setFocusAndDropKeyboardRequest);
  const [expandedCourseIds, setExpandedCourseIds] = useState<Set<string>>(new Set());
  const hasRunInitialFocusRef = useRef(false);
  if (tagId !== prevTagId) {
    setPrevTagId(tagId);
    setFocus(null);
    resetPlaceholderState();
    setKeyboardFocusRequest(null);
    setPendingRemoval(null);
    setExpandedCourseIds(new Set());
    hasRunInitialFocusRef.current = false;
  }

  const groupsQuery = useCompetencyCriteriaGroups(tagId);
  const profileQuery = useDefaultCompetencyRuleProfile();
  const createCriterion = useCreateCompetencyCriterion();
  const updateGroupOperatorMutation = useUpdateCompetencyCriteriaGroupOperator();
  const updateRuleScoreMutation = useUpdateCompetencyCriteriaRule();
  const { mutateAsync: mutateDeleteGroup, isPending: isGroupDeletePending } = useDeleteCompetencyCriteriaGroup();
  const { mutateAsync: mutateDeleteCriterion, isPending: isCriterionDeletePending } = useDeleteCompetencyCriterion();
  const { mutateAsync: mutateDeleteRuleBox, isPending: isRuleBoxDeletePending } = useDeleteCompetencyRuleBox();
  const isDeleting = isGroupDeletePending || isCriterionDeletePending || isRuleBoxDeletePending;
  const queryClient = useQueryClient();
  // Closes the gap between a click and the render that disables the delete controls.
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
    if (!index || !systemDefaultProfile) {
      return;
    }
    if (focus !== null && courseKeyOfFocus(focus, placeholder, index) === courseId) {
      return;
    }
    const target = lastBottomTierGroupForCourse(index, courseId);
    if (target) {
      setKeyboardFocusRequest(null);
      setDuplicateRejected(false);
      setFocus({ groupId: target.id, ruleKey: lastRealRuleKeyIn(target.id, index, systemDefaultProfile) });
    }
  }, [focus, placeholder, index, systemDefaultProfile]);

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
      showToast(intl.formatMessage(messages.alreadyAssociatedToastMessage), undefined, undefined, InfoOutline);
      return;
    }
    if (!index || !systemDefaultProfile) {
      // The content panel only offers this action once both are loaded.
      return;
    }

    const target = resolveCreateTarget(courseId, focus, placeholder, index, systemDefaultProfile);
    if (target.kind === 'duplicate') {
      setDuplicateRejected(true);
      return;
    }
    const payload: CreateCompetencyCriterionPayload = { object_id: objectId, ...target.fields };

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
        showToast(
          intl.formatMessage(
            isHierarchyConflict
              ? messages.createCriterionHierarchyConflictToastMessage
              : messages.createCriterionFailedToastMessage,
          ),
          undefined,
          undefined,
          ErrorIcon,
        );
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
      // Defensive TypeScript-narrowing guard, not an expected runtime path: a rule box is only
      // ever rendered - let alone made editable - once both queries have resolved.
      throw new Error('updateRuleScore called before the groups index and system default profile were loaded.');
    }
    // Rule type is pinned to the box's current effective rule, resolved
    // from any one criterion already in it (they all share it, by definition).
    const groupCriteria = index.criteriaByGroupId.get(groupId) ?? [];
    const anchorCriterion = groupCriteria.find((criterion) => criterionIds.includes(criterion.id));
    if (!anchorCriterion) {
      // Defensive guard, not an expected runtime path: `criterionIds` always comes from this
      // same group's own rendered rule box.
      throw new Error(`updateRuleScore: no criterion in group ${groupId} matched the given criterionIds.`);
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

  const resolveFocusAfterDelete = useCallback((
    deletedGroupId: number,
    groupOrderBeforeDelete: PageOrderSnapshot,
    triggerLosesFocus = false,
  ) => {
    const freshData = queryClient.getQueryData<CompetencyCriteriaGroupsResponse>(
      competencyQueryKeys.competencyCriteriaGroups(tagId),
    );
    if (!freshData) {
      return;
    }
    const freshIndex = buildCompetencyCriteriaGroupsIndex(freshData);
    const currentFocus = focusRef.current;
    const target = focusTargetAfterRemoval(
      groupOrderBeforeDelete,
      freshIndex,
      currentFocus,
      placeholderRef.current.parentRuleGroupId,
    );
    // A vanished group's controls unmount, so keyboard focus is certainly stranded.
    const isDeletedGroupGone = !freshIndex.groupsById.has(deletedGroupId);
    const isKeyboardFocusLost = isDeletedGroupGone || triggerLosesFocus;

    if (target === 'unchanged') {
      // The focused group, or the deleted one when it survives and nothing or a placeholder group is in focus.
      const keyboardGroupId = currentFocus?.groupId ?? (isDeletedGroupGone ? null : deletedGroupId);
      if (isKeyboardFocusLost && keyboardGroupId !== null) {
        setKeyboardFocusRequest({ kind: 'group', groupId: keyboardGroupId, expand: false });
      } else if (
        isDeletedGroupGone && currentFocus === null
        && !hasVisibleOrNewCourseGroup(groupOrderBeforeDelete, freshIndex)
      ) {
        setKeyboardFocusRequest({ kind: 'empty' });
      }
    } else if (target === null) {
      setFocus(null);
      setDuplicateRejected(false);
      setKeyboardFocusRequest(
        isKeyboardFocusLost && !hasVisibleOrNewCourseGroup(groupOrderBeforeDelete, freshIndex)
          ? { kind: 'empty' }
          : null,
      );
    } else {
      focusGroupAfterRemoval(target, freshIndex, isKeyboardFocusLost);
    }
  }, [queryClient, tagId, focusGroupAfterRemoval]);

  const deleteGroup = useCallback(async (groupId: number): Promise<void> => {
    if (isDeleteInFlightRef.current || !index) {
      return;
    }
    isDeleteInFlightRef.current = true;
    const groupOrderBeforeDelete = snapshotPageOrder(index, accessibleCourseGroups);
    try {
      await mutateDeleteGroup({ tagId, groupId });
    } catch (error) {
      const dataAfterDelete = queryClient.getQueryData<CompetencyCriteriaGroupsResponse>(
        competencyQueryKeys.competencyCriteriaGroups(tagId),
      );
      const isGroupGone = dataAfterDelete !== undefined
        && !dataAfterDelete.groups.some((group) => group.id === groupId);
      // A 404 or an absent group is the outcome the author asked for.
      if ((!isAxiosError(error) || error.response?.status !== 404) && !isGroupGone) {
        throw error;
      }
    } finally {
      isDeleteInFlightRef.current = false;
      resolveFocusAfterDelete(groupId, groupOrderBeforeDelete);
    }
  }, [index, accessibleCourseGroups, tagId, mutateDeleteGroup, resolveFocusAfterDelete, queryClient]);

  // Rule boxes are derived from criteria, so removing a box's last criterion leaves a focus key naming no box.
  const moveFocusOffVanishedRuleBox = useCallback((
    groupId: number,
    indexAfterRemoval: CompetencyCriteriaGroupsIndex,
    ruleKeysBeforeRemoval: string[] = [],
  ) => {
    if (!systemDefaultProfile) {
      return;
    }
    const remainingRuleKeys = ruleBoxesForGroup(groupId, indexAfterRemoval, systemDefaultProfile).map((box) => box.key);
    setFocus((prev) => (
      prev?.groupId === groupId && prev.ruleKey !== null && !remainingRuleKeys.includes(prev.ruleKey)
        ? { groupId, ruleKey: ruleKeyAfterRemoval(ruleKeysBeforeRemoval, prev.ruleKey, remainingRuleKeys) }
        : prev
    ));
  }, [systemDefaultProfile]);

  // Focus returns to the group box or the subsection row; when the group goes with it, `focusTargetAfterRemoval`
  // picks the neighbor.
  const removeAssociation = useCallback(async (
    criterionId: number,
    returnFocusTo: 'group' | 'subsection',
  ): Promise<void> => {
    const criterion = groupsQuery.data?.criteria.find((c) => c.id === criterionId);
    if (isDeleteInFlightRef.current || !index || !criterion) {
      return;
    }
    isDeleteInFlightRef.current = true;
    const groupOrderBeforeDelete = snapshotPageOrder(index, accessibleCourseGroups);
    const { groupId, objectId } = criterion;
    try {
      await mutateDeleteCriterion({ tagId, criterionId });
    } catch (error) {
      const isStillListed = queryClient.getQueryData<CompetencyCriteriaGroupsResponse>(
        competencyQueryKeys.competencyCriteriaGroups(tagId),
      )?.criteria.some((c) => c.id === criterionId) ?? true;
      if (isStillListed) {
        throw error;
      }
    } finally {
      isDeleteInFlightRef.current = false;
      resolveFocusAfterDelete(groupId, groupOrderBeforeDelete);
    }
    const dataAfterRemoval = queryClient.getQueryData<CompetencyCriteriaGroupsResponse>(
      competencyQueryKeys.competencyCriteriaGroups(tagId),
    );
    if (dataAfterRemoval) {
      const indexAfterRemoval = buildCompetencyCriteriaGroupsIndex(dataAfterRemoval);
      const isGroupStillPresent = indexAfterRemoval.groupsById.has(groupId);
      if (isGroupStillPresent) {
        moveFocusOffVanishedRuleBox(groupId, indexAfterRemoval);
      }
      if (returnFocusTo === 'subsection') {
        setKeyboardFocusRequest({ kind: 'subsection', objectId });
      } else if (isGroupStillPresent) {
        setKeyboardFocusRequest({ kind: 'group', groupId, expand: false });
      }
    }
  }, [
    groupsQuery.data,
    index,
    accessibleCourseGroups,
    tagId,
    mutateDeleteCriterion,
    resolveFocusAfterDelete,
    moveFocusOffVanishedRuleBox,
    queryClient,
  ]);

  // Focus moves to the box above, else below; when its group goes too, `deleteGroup`'s rule applies.
  const deleteRuleBox = useCallback(async (groupId: number, criterionIds: number[]): Promise<void> => {
    if (isDeleteInFlightRef.current || !index || !systemDefaultProfile) {
      return;
    }
    isDeleteInFlightRef.current = true;
    const ruleKeysBeforeDelete = ruleBoxesForGroup(groupId, index, systemDefaultProfile).map((box) => box.key);
    const groupOrderBeforeDelete = snapshotPageOrder(index, accessibleCourseGroups);
    let isDeleted = false;
    try {
      // Exactly the criteria the dialog listed; content added to the box since then is not sent.
      await mutateDeleteRuleBox({ tagId, criterionIds });
      isDeleted = true;
    } finally {
      isDeleteInFlightRef.current = false;
      // On success the dialog closes and the ⋮ loses focus; on failure the dialog stays open.
      resolveFocusAfterDelete(groupId, groupOrderBeforeDelete, isDeleted);
      const dataAfterDelete = queryClient.getQueryData<CompetencyCriteriaGroupsResponse>(
        competencyQueryKeys.competencyCriteriaGroups(tagId),
      );
      if (dataAfterDelete) {
        const indexAfterDelete = buildCompetencyCriteriaGroupsIndex(dataAfterDelete);
        if (indexAfterDelete.groupsById.has(groupId)) {
          moveFocusOffVanishedRuleBox(groupId, indexAfterDelete, ruleKeysBeforeDelete);
        }
      }
    }
  }, [
    index,
    systemDefaultProfile,
    accessibleCourseGroups,
    tagId,
    mutateDeleteRuleBox,
    resolveFocusAfterDelete,
    moveFocusOffVanishedRuleBox,
    queryClient,
  ]);

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

  const removePlaceholderRuleBox = useCallback(() => {
    const groupId = focus?.ruleKey === null ? focus.groupId : null;
    if (groupId === null || !index || !systemDefaultProfile) {
      return;
    }
    const ruleKey = lastRealRuleKeyIn(groupId, index, systemDefaultProfile);
    setFocus(ruleKey !== null ? { groupId, ruleKey } : null);
    setDuplicateRejected(false);
    setKeyboardFocusRequest({ kind: 'group', groupId, expand: false });
  }, [focus, index, systemDefaultProfile]);

  const { requestRemoval, confirmRemoval, cancelRemoval } = useRemovalConfirmation({
    tagId,
    index,
    systemDefaultProfile,
    courseIdsWithGroups,
    pendingRemoval,
    setPendingRemoval,
    isDeleteInFlightRef,
    removeAssociation,
    deleteRuleBox,
    deleteGroup,
  });

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
    isDeleting,
    pendingRemoval,
    requestRemoval,
    confirmRemoval,
    cancelRemoval,
    removePlaceholderGroup,
    removePlaceholderRuleBox,
    keyboardFocusRequest: pendingRemoval ? null : keyboardFocusRequest,
    consumeKeyboardFocusRequest,
    canEditCourse,
    groupsQuery,
    profileQuery,
    index,
    systemDefaultProfile,
    associatedObjectIds: associatedIds,
    accessibleCourseGroups,
    areCourseOutlinesLoading: !allVisibleCourseOutlinesResolved,
    competencyExternalId,
    competencyName,
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
    isDeleting,
    pendingRemoval,
    requestRemoval,
    confirmRemoval,
    cancelRemoval,
    removePlaceholderGroup,
    removePlaceholderRuleBox,
    keyboardFocusRequest,
    consumeKeyboardFocusRequest,
    canEditCourse,
    groupsQuery,
    profileQuery,
    index,
    systemDefaultProfile,
    associatedIds,
    accessibleCourseGroups,
    allVisibleCourseOutlinesResolved,
    competencyExternalId,
    competencyName,
  ]);

  return (
    <CompetencyAssociationsContext.Provider value={contextValue}>
      {children}
    </CompetencyAssociationsContext.Provider>
  );
};
