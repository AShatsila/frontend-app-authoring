import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Error as ErrorIcon, InfoOutline } from '@openedx/paragon/icons';
import { useIntl } from '@edx/frontend-platform/i18n';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { AxiosError } from 'axios';

import { getCourseOutlineIndex } from '@src/course-outline/data';
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
import type { CompetencyCriteriaGroupsIndex, PageOrderSnapshot } from './utils';
import {
  associatedObjectIds,
  bottomTierGroupsForCourse,
  buildCompetencyCriteriaGroupsIndex,
  effectiveRuleOf,
  focusTargetAfterRemoval,
  hasVisibleOrNewCourseGroup,
  lastBottomTierGroupForCourse,
  lastRuleKeyIn,
  ruleBoxesForGroup,
  ruleKeyOf,
  snapshotPageOrder,
  visibleCourseGroups,
} from './utils';

/** A non-null `ruleKey` that matches none of the group's rule boxes is re-resolved to the group's last box.
 *
 * `ruleKey === null` focuses a not-yet-saved placeholder rule box in the group, and `groupId === null`
 * a placeholder group, whose parent is `placeholder.parentRuleGroupId`. A single focus means a single placeholder.
 */
export interface CriteriaFocus {
  groupId: number | null;
  ruleKey: string | null;
}

/** A one-shot request for the browser's keyboard focus, left by a delete because the trash button that had it is
 * gone, or by a score save that remounts its rule box. Kept here because the cards can unmount (or be collapsed)
 * before the new target renders. `group` names the bottom-tier group card that takes it, and `expand` whether a
 * collapsed course-level group holding that card opens for it. `empty` is the "no associations" message,
 * `subsection` the content panel's row for `objectId`, and `ruleBox` the score trigger of the rule box with that key.
 */
export type KeyboardFocusRequest =
  | { kind: 'group'; groupId: number; expand: boolean; }
  | { kind: 'empty'; }
  | { kind: 'subsection'; objectId: string; }
  | { kind: 'ruleBox'; groupId: number; ruleKey: string; };

/** The author's choices on the placeholder group or rule box. The rule payload is shared by both shapes, since only
 * one placeholder exists at a time.
 */
export interface CriteriaPlaceholder {
  parentRuleGroupId: number | null;
  logicOperator: CompetencyGroupLogicOperator;
  rulePayload: GradeRulePayload | null;
}

const initialPlaceholder: CriteriaPlaceholder = { parentRuleGroupId: null, logicOperator: 'OR', rulePayload: null };

export interface CompetencyAssociationsContextBase {
  /** The groups or profile failure, or the first course-outline failure other
   * than a 403 or 404, behind `status === 'error'`.
   */
  error: Error | null;
  focus: CriteriaFocus | null;
  placeholder: CriteriaPlaceholder;
  /** Whether a placeholder rule box or group exists, which disables both add controls. */
  hasPlaceholder: boolean;
  /** Starts a placeholder rule box in a bottom-tier group, replacing any other placeholder. */
  addPlaceholderRuleBox: (groupId: number) => void;
  /** Starts a placeholder bottom-tier group under a course-level group, replacing any other placeholder. */
  addPlaceholderGroup: (parentRuleGroupId: number) => void;
  setPlaceholderLogicOperator: (logicOperator: CompetencyGroupLogicOperator) => void;
  setPlaceholderRulePayload: (rulePayload: GradeRulePayload) => void;
  /** True after content was selected while the placeholder's score duplicated a box in its group.
   * The request is not sent.
   */
  placeholderDuplicateRejected: boolean;
  /** Drops the placeholder by clearing `focus`. */
  discardPlaceholder: () => void;
  /** Deletes a bottom-tier or course-level group, then moves focus per `focusTargetAfterRemoval` once the refetch
   * lands. Dropped while another delete is in flight. A 404 counts as success; any other failure shows a toast.
   */
  deleteGroup: (groupId: number) => void;
  /** True while any delete, or its refetch, is in flight. */
  isDeleting: boolean;
  /** Deletes the criterion with this id, and drops the call during another delete. Keyboard focus returns to the
   * group box or the subsection row. When the group is removed with it, `deleteGroup`'s neighbor and empty-state
   * logic applies.
   */
  removeAssociation: (criterionId: number, returnFocusTo: 'group' | 'subsection') => void;
  /** Discards the placeholder group without a request and focuses the last saved group in its course group. */
  removePlaceholderGroup: () => void;
  keyboardFocusRequest: KeyboardFocusRequest | null;
  /** Clears `keyboardFocusRequest` once the component it names has taken it. */
  consumeKeyboardFocusRequest: () => void;
  /** Focuses a group and its last rule box. A no-op when `groupId` is already
   * focused, so re-clicking the group heading keeps the rule box the author
   * selected inside it.
   */
  focusGroup: (groupId: number) => void;
  focusRuleBox: (groupId: number, ruleKey: string) => void;
  /** Call when a course row expands, never when it collapses. Feeds `canEditCourse`
   * for a group-less course and moves focus to the course's last group and rule box
   * when focus is unset or on another course's group.
   */
  notifyCourseExpanded: (courseId: string) => void;
  /** Creates a criterion for the subsection in the active competency. Shows a
   * toast instead of sending a request when the subsection is already
   * associated or the groups tree or default profile has not loaded.
   */
  associateSubsection: (objectId: string, courseId: string) => void;
  /** Updates a bottom-tier group's any/all combining logic. Resolves once the groups have refetched, and rejects on
   * failure without a toast, so the confirmation dialog can show the error.
   */
  updateGroupOperator: (groupId: number, logicOperator: CompetencyGroupLogicOperator) => Promise<void>;
  /** Updates a rule box's score threshold across `criterionIds`, keeping the box's current rule type. Resolves once
   * the groups have refetched, and rejects on failure without a toast.
   */
  updateRuleScore: (groupId: number, criterionIds: number[], rulePayload: GradeRulePayload) => Promise<void>;
  isAssociating: boolean;
  /** How many times each course row has been expanded, so a card can reopen on an
   * expansion that leaves focus where it already was.
   */
  expansionCountByCourseId: Record<string, number>;
  /** The permissions request failed, so `canEditCourse` is `false` for courses it
   * could not resolve.
   */
  hasPermissionsError: boolean;
  /** Whether the author can manage associations for the course
   * (`courses.manage_tags`).
   */
  canEditCourse: (courseId: string) => boolean;
  /** The `objectId` of every criterion in the tree, for the duplicate guard
   * and the content panel's "already associated" marking.
   */
  associatedObjectIds: Set<string>;
  /** Course-level groups whose course outline loaded. A course added by a later
   * groups refetch joins once its outline loads.
   */
  accessibleCourseGroups: CourseCompetencyCriteriaGroup[];
  /** The active competency's short external id (e.g. "CCRS-1.3"), or `null`. */
  competencyExternalId: string | null;
  /** The active competency's name, for the course group menu's "Remove from" item. */
  competencyName: string;
}

/** Discriminated on `status`. `groupsIndex` and `systemDefaultProfile` are
 * always defined when `status` is `'success'`, and may be missing otherwise.
 *
 * `'pending'` until the groups, the default rule profile and every course
 * outline have settled, then `'success'` for the rest of that competency, even
 * when a later groups refetch adds a course whose outline has not loaded yet.
 * `'error'` if the groups, the profile or any course outline failed, including
 * a failure after `'success'`. An outline that fails with a 403 or 404 only
 * hides its course and does not affect `status`.
 */
export type CompetencyAssociationsContextValue =
  & CompetencyAssociationsContextBase
  & (
    | {
      status: 'success';
      groupsIndex: CompetencyCriteriaGroupsIndex;
      systemDefaultProfile: CompetencyRuleProfile;
    }
    | {
      status: 'pending' | 'error';
      groupsIndex: CompetencyCriteriaGroupsIndex | undefined;
      systemDefaultProfile: CompetencyRuleProfile | undefined;
    }
  );

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
  competencyExternalId: string | null;
  children: ReactNode;
}

/** A 403 or 404 on a course outline means the author cannot see that course. */
function isInaccessibleCourseError(error: unknown): boolean {
  return isAxiosError(error) && (error.response?.status === 403 || error.response?.status === 404);
}

/** The focus to move to when `courseId` is expanded, or `null` when focus
 * already sits on one of that course's groups or the course has no group.
 */
function courseExpansionFocus(
  courseId: string,
  focus: CriteriaFocus | null,
  placeholder: CriteriaPlaceholder,
  index: CompetencyCriteriaGroupsIndex,
  systemDefaultProfile: CompetencyRuleProfile,
): CriteriaFocus | null {
  if (courseKeyOfFocus(focus, placeholder, index) === courseId) {
    return null;
  }
  const target = lastBottomTierGroupForCourse(index, courseId);
  return target ? { groupId: target.id, ruleKey: lastRuleKeyIn(target.id, index, systemDefaultProfile) } : null;
}

/** The rule key to move focus to when the focused key matches no rule box, or `undefined` when focus is fine. */
function resolveStaleRuleKey(
  focus: CriteriaFocus,
  index: CompetencyCriteriaGroupsIndex,
  systemDefaultProfile: CompetencyRuleProfile,
): string | null | undefined {
  // A `null` key is a placeholder rule box, which matches no real one by design.
  if (focus.groupId === null || focus.ruleKey === null || !index.groupsById.has(focus.groupId)) {
    return undefined;
  }
  // A rule box is keyed by its rule, so a refetch or a default-profile change can leave the key stale.
  const hasFocusedBox = ruleBoxesForGroup(focus.groupId, index, systemDefaultProfile)
    .some((box) => box.key === focus.ruleKey);
  if (hasFocusedBox) {
    return undefined;
  }
  const resolved = lastRuleKeyIn(focus.groupId, index, systemDefaultProfile);
  return resolved === focus.ruleKey ? undefined : resolved;
}

interface ProviderState {
  tagId: number;
  /** Bumped on every competency change, so an in-flight create can tell the
   * author left and came back, which a `tagId` comparison cannot.
   */
  generation: number;
  focus: CriteriaFocus | null;
  placeholder: CriteriaPlaceholder;
  placeholderDuplicateRejected: boolean;
  keyboardFocusRequest: KeyboardFocusRequest | null;
  /** A course expanded before the groups and default profile loaded. */
  pendingCourseId: string | null;
  initialFocusDone: boolean;
  /** Latches once `status` first reaches `'success'` for the competency. */
  settled: boolean;
}

type ProviderAction =
  | { type: 'competencyChanged'; tagId: number; }
  | { type: 'focusGroup'; groupId: number; ruleKey: string | null; }
  | { type: 'focusRuleBox'; groupId: number; ruleKey: string; }
  | { type: 'setFocus'; focus: CriteriaFocus; }
  | { type: 'addPlaceholderRuleBox'; groupId: number; }
  | { type: 'addPlaceholderGroup'; parentRuleGroupId: number; }
  | { type: 'setPlaceholderLogicOperator'; logicOperator: CompetencyGroupLogicOperator; }
  | { type: 'setPlaceholderRulePayload'; rulePayload: GradeRulePayload; }
  | { type: 'discardPlaceholder'; }
  | { type: 'placeholderDuplicateRejected'; }
  | { type: 'deleteResolved'; focus: CriteriaFocus | null | 'keep'; keyboardFocusRequest: KeyboardFocusRequest | null; }
  | { type: 'keyboardFocusRequested'; keyboardFocusRequest: KeyboardFocusRequest | null; }
  | { type: 'ruleKeyResolved'; groupId: number; staleRuleKey: string | null; resolvedRuleKey: string | null; }
  | { type: 'createSucceeded'; generation: number; focus: CriteriaFocus; }
  | { type: 'courseExpandedBeforeLoad'; courseId: string; }
  | { type: 'pendingCourseResolved'; focus: CriteriaFocus | null; }
  | { type: 'initialFocusRan'; focus: CriteriaFocus | null; }
  | { type: 'settled'; };

function reduceProviderState(state: ProviderState, action: ProviderAction): ProviderState {
  switch (action.type) {
    case 'competencyChanged':
      return {
        tagId: action.tagId,
        generation: state.generation + 1,
        focus: null,
        placeholder: initialPlaceholder,
        placeholderDuplicateRejected: false,
        keyboardFocusRequest: null,
        pendingCourseId: null,
        initialFocusDone: false,
        settled: false,
      };
    case 'focusGroup':
      if (state.focus?.groupId === action.groupId) {
        return state.pendingCourseId === null ? state : { ...state, pendingCourseId: null };
      }
      return { ...state, focus: { groupId: action.groupId, ruleKey: action.ruleKey }, pendingCourseId: null };
    case 'focusRuleBox':
      return { ...state, focus: { groupId: action.groupId, ruleKey: action.ruleKey }, pendingCourseId: null };
    case 'setFocus':
      return { ...state, focus: action.focus };
    case 'addPlaceholderRuleBox':
      return {
        ...state,
        focus: { groupId: action.groupId, ruleKey: null },
        placeholder: { ...state.placeholder, rulePayload: null },
        pendingCourseId: null,
      };
    case 'addPlaceholderGroup':
      return {
        ...state,
        focus: { groupId: null, ruleKey: null },
        placeholder: { ...initialPlaceholder, parentRuleGroupId: action.parentRuleGroupId },
        pendingCourseId: null,
      };
    case 'setPlaceholderLogicOperator':
      return { ...state, placeholder: { ...state.placeholder, logicOperator: action.logicOperator } };
    case 'deleteResolved':
      return {
        ...state,
        focus: action.focus === 'keep' ? state.focus : action.focus,
        placeholderDuplicateRejected: action.focus === 'keep' ? state.placeholderDuplicateRejected : false,
        keyboardFocusRequest: action.keyboardFocusRequest,
      };
    case 'keyboardFocusRequested':
      return { ...state, keyboardFocusRequest: action.keyboardFocusRequest };
    case 'discardPlaceholder':
      return { ...state, focus: null };
    case 'setPlaceholderRulePayload':
      return { ...state, placeholder: { ...state.placeholder, rulePayload: action.rulePayload } };
    case 'ruleKeyResolved':
      // Guarded so an action computed from a stale focus cannot overwrite a focus dispatched after it.
      return state.focus?.groupId === action.groupId && state.focus.ruleKey === action.staleRuleKey
        ? { ...state, focus: { groupId: action.groupId, ruleKey: action.resolvedRuleKey } }
        : state;
    case 'createSucceeded':
      return action.generation === state.generation ? { ...state, focus: action.focus } : state;
    case 'courseExpandedBeforeLoad':
      return { ...state, pendingCourseId: action.courseId };
    case 'pendingCourseResolved':
      return { ...state, pendingCourseId: null, focus: action.focus ?? state.focus };
    case 'initialFocusRan':
      // A focus set before the gate opened wins over the auto-focus.
      return state.focus === null && action.focus !== null
        ? { ...state, initialFocusDone: true, focus: action.focus, pendingCourseId: null }
        : { ...state, initialFocusDone: true };
    case 'settled':
      return { ...state, settled: true };
    default:
      return state;
  }
}

/** Actions that change what the author sees in the placeholder, so a rejection no longer applies. */
const PLACEHOLDER_REJECTION_CLEARING_ACTIONS: ReadonlySet<ProviderAction['type']> = new Set([
  'competencyChanged',
  'focusGroup',
  'focusRuleBox',
  'setFocus',
  'addPlaceholderRuleBox',
  'addPlaceholderGroup',
  'setPlaceholderRulePayload',
  'discardPlaceholder',
  'createSucceeded',
]);

/** Actions that move focus for a reason other than a delete, which drops a pending keyboard focus request. */
const KEYBOARD_REQUEST_CLEARING_ACTIONS: ReadonlySet<ProviderAction['type']> = new Set([
  'competencyChanged',
  'focusGroup',
  'focusRuleBox',
  'setFocus',
  'addPlaceholderRuleBox',
  'addPlaceholderGroup',
  'discardPlaceholder',
]);

function providerReducer(state: ProviderState, action: ProviderAction): ProviderState {
  if (action.type === 'placeholderDuplicateRejected') {
    return { ...state, placeholderDuplicateRejected: true };
  }
  let next = reduceProviderState(state, action);
  const movesFocus = action.type === 'pendingCourseResolved' && action.focus !== null;
  if ((PLACEHOLDER_REJECTION_CLEARING_ACTIONS.has(action.type) || movesFocus) && next.placeholderDuplicateRejected) {
    next = { ...next, placeholderDuplicateRejected: false };
  }
  if ((KEYBOARD_REQUEST_CLEARING_ACTIONS.has(action.type) || movesFocus) && next.keyboardFocusRequest) {
    next = { ...next, keyboardFocusRequest: null };
  }
  return next;
}

/** Provides per-competency criteria-association state to the course panel.
 *
 * Not remounted per competency (no `key={tagId}`), so the content panel keeps
 * its own state; a `tagId` change instead resets focus during render. Expanded
 * courses persist across competencies.
 */
export const CompetencyAssociationsProvider = ({
  tagId,
  competencyName,
  competencyExternalId,
  children,
}: CompetencyAssociationsProviderProps) => {
  const intl = useIntl();
  const { showToast } = useToastContext();

  const [state, dispatch] = useReducer(providerReducer, {
    tagId,
    generation: 0,
    focus: null,
    placeholder: initialPlaceholder,
    placeholderDuplicateRejected: false,
    keyboardFocusRequest: null,
    pendingCourseId: null,
    initialFocusDone: false,
    settled: false,
  });
  const {
    focus,
    placeholder,
    placeholderDuplicateRejected,
    keyboardFocusRequest,
    generation,
    pendingCourseId,
    initialFocusDone,
    settled,
  } = state;
  const [expandedCourseIds, setExpandedCourseIds] = useState<Set<string>>(new Set());
  const [expansionCountByCourseId, setExpansionCountByCourseId] = useState<Record<string, number>>({});

  const competencyChanged = tagId !== state.tagId;
  if (competencyChanged) {
    dispatch({ type: 'competencyChanged', tagId });
  }

  const groupsQuery = useCompetencyCriteriaGroups(tagId);
  const profileQuery = useDefaultCompetencyRuleProfile();
  const { mutateAsync: createCriterion, isPending: isCreatePending, variables } = useCreateCompetencyCriterion();
  const isAssociating = isCreatePending && variables?.tagId === tagId;
  const { mutateAsync: updateGroupOperatorMutateAsync } = useUpdateCompetencyCriteriaGroupOperator();
  const { mutateAsync: updateRuleScoreMutateAsync } = useUpdateCompetencyCriteriaRule();
  const { mutate: mutateDeleteGroup, isPending: isGroupDeletePending } = useDeleteCompetencyCriteriaGroup();
  const { mutate: mutateDeleteCriterion, isPending: isCriterionDeletePending } = useDeleteCompetencyCriterion();
  const isDeleting = isGroupDeletePending || isCriterionDeletePending;
  const queryClient = useQueryClient();
  // A delete's settle callback runs after the refetch, so it reads the latest focus and placeholder through refs to
  // respect a click made while the request was in flight.
  const generationRef = useRef(generation);
  generationRef.current = generation;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;

  const groupsIndex = useMemo(
    () => (groupsQuery.data ? buildCompetencyCriteriaGroupsIndex(groupsQuery.data) : undefined),
    [groupsQuery.data],
  );
  const systemDefaultProfile = profileQuery.data;
  const associatedIds = useMemo(
    () => (groupsQuery.data ? associatedObjectIds(groupsQuery.data) : new Set<string>()),
    [groupsQuery.data],
  );

  // Applied during render so the initial-focus effect below already sees it.
  // Skipped on the render that changes competency: the pending course belongs
  // to the previous one, but `groupsIndex` may already be the new one's cached tree.
  if (!competencyChanged && pendingCourseId !== null && groupsIndex && systemDefaultProfile) {
    dispatch({
      type: 'pendingCourseResolved',
      focus: courseExpansionFocus(pendingCourseId, focus, placeholder, groupsIndex, systemDefaultProfile),
    });
  }

  const notifyCourseExpanded = useCallback((courseId: string) => {
    setExpandedCourseIds((prev) => (prev.has(courseId) ? prev : new Set(prev).add(courseId)));
    setExpansionCountByCourseId((prev) => ({ ...prev, [courseId]: (prev[courseId] ?? 0) + 1 }));
    if (!groupsIndex || !systemDefaultProfile) {
      dispatch({ type: 'courseExpandedBeforeLoad', courseId });
      return;
    }
    const next = courseExpansionFocus(courseId, focus, placeholder, groupsIndex, systemDefaultProfile);
    if (next) {
      dispatch({ type: 'setFocus', focus: next });
    }
  }, [focus, placeholder, groupsIndex, systemDefaultProfile]);

  const courseIdsWithGroups = useMemo(
    () => (groupsIndex ? groupsIndex.courseGroups.map((courseGroup) => courseGroup.courseKey) : []),
    [groupsIndex],
  );

  // Stays referentially stable because TanStack structurally shares the result; `useCallback` avoids recomputing it.
  const combineOutlines = useCallback((results: UseQueryResult[]) => ({
    accessibleCourseIds: courseIdsWithGroups.filter((_, i) => results[i]?.isSuccess).sort(),
    isPending: results.some((result) => result.isPending),
    error: results.find((result) => result.isError && !isInaccessibleCourseError(result.error))?.error ?? null,
  }), [courseIdsWithGroups]);

  const outlines = useQueries({
    // Same key and `retry: false` as `useCourseOutlineIndex`, so the cache is shared.
    queries: courseIdsWithGroups.map((courseId) => ({
      queryKey: courseOutlineQueryKeys.index(courseId),
      queryFn: () => getCourseOutlineIndex(courseId),
      retry: false as const,
    })),
    combine: combineOutlines,
  });

  const accessibleCourseGroups = useMemo(
    () => (groupsIndex ? visibleCourseGroups(groupsIndex, new Set(outlines.accessibleCourseIds)) : []),
    [groupsIndex, outlines.accessibleCourseIds],
  );

  const error = groupsQuery.error ?? profileQuery.error ?? outlines.error;
  let status: 'pending' | 'error' | 'success' = 'success';
  if (error) {
    status = 'error';
  } else if (!groupsIndex || !systemDefaultProfile || (!settled && outlines.isPending)) {
    status = 'pending';
  }
  // Skipped on the render that changes competency, whose data belongs to the previous one.
  if (!competencyChanged && !settled && status === 'success') {
    dispatch({ type: 'settled' });
  }

  const resolvedRuleKey = !competencyChanged && focus && groupsIndex && systemDefaultProfile
    ? resolveStaleRuleKey(focus, groupsIndex, systemDefaultProfile)
    : undefined;
  if (focus?.groupId != null && resolvedRuleKey !== undefined) {
    dispatch({ type: 'ruleKeyResolved', groupId: focus.groupId, staleRuleKey: focus.ruleKey, resolvedRuleKey });
  }

  const focusGroup = useCallback((groupId: number) => {
    const ruleKey = (groupsIndex && systemDefaultProfile)
      ? lastRuleKeyIn(groupId, groupsIndex, systemDefaultProfile)
      : null;
    dispatch({ type: 'focusGroup', groupId, ruleKey });
  }, [groupsIndex, systemDefaultProfile]);

  const focusRuleBox = useCallback((groupId: number, ruleKey: string) => {
    dispatch({ type: 'focusRuleBox', groupId, ruleKey });
  }, []);

  const addPlaceholderRuleBox = useCallback((groupId: number) => {
    dispatch({ type: 'addPlaceholderRuleBox', groupId });
  }, []);

  const addPlaceholderGroup = useCallback((parentRuleGroupId: number) => {
    dispatch({ type: 'addPlaceholderGroup', parentRuleGroupId });
  }, []);

  const setPlaceholderLogicOperator = useCallback((logicOperator: CompetencyGroupLogicOperator) => {
    dispatch({ type: 'setPlaceholderLogicOperator', logicOperator });
  }, []);

  const setPlaceholderRulePayload = useCallback((rulePayload: GradeRulePayload) => {
    dispatch({ type: 'setPlaceholderRulePayload', rulePayload });
  }, []);

  const discardPlaceholder = useCallback(() => {
    dispatch({ type: 'discardPlaceholder' });
  }, []);

  const hasPlaceholder = focus !== null && focus.ruleKey === null;

  // Runs once per competency, after groups, profile and every outline have
  // settled. An inaccessible course's group is not rendered, so it is never
  // auto-focus eligible. Independent of `expandedCourseIds`, which must not
  // delay it.
  useEffect(() => {
    if (initialFocusDone || status !== 'success' || !groupsIndex || !systemDefaultProfile) {
      return;
    }
    const allBottomTierGroups = accessibleCourseGroups
      .flatMap((courseGroup) => bottomTierGroupsForCourse(groupsIndex, courseGroup.courseKey));
    dispatch({
      type: 'initialFocusRan',
      focus: allBottomTierGroups.length === 1
        ? {
          groupId: allBottomTierGroups[0].id,
          ruleKey: lastRuleKeyIn(allBottomTierGroups[0].id, groupsIndex, systemDefaultProfile),
        }
        : null,
    });
  }, [initialFocusDone, status, groupsIndex, systemDefaultProfile, accessibleCourseGroups]);

  // Every course with a group plus every expanded course, even a group-less one.
  const courseIdsForPermissions = useMemo(() => {
    const ids = new Set(expandedCourseIds);
    courseIdsWithGroups.forEach((courseId) => ids.add(courseId));
    return Array.from(ids);
  }, [expandedCourseIds, courseIdsWithGroups]);

  const { permissionsByCourseId, isError: hasPermissionsError } = useCourseTaggingPermissions(courseIdsForPermissions);
  const canEditCourse = useCallback(
    (courseId: string) => permissionsByCourseId[courseId] ?? false,
    [permissionsByCourseId],
  );

  const associateSubsection = useCallback((objectId: string, courseId: string) => {
    if (associatedIds.has(objectId)) {
      showToast(intl.formatMessage(messages.alreadyAssociatedToastMessage), undefined, undefined, InfoOutline);
      return;
    }
    if (!groupsIndex || !systemDefaultProfile) {
      showToast(intl.formatMessage(messages.createCriterionFailedToastMessage), undefined, undefined, ErrorIcon);
      return;
    }

    // Focus on another course falls back to that course's last group, whose rule box has no placeholder score.
    const isFocusInCourse = courseKeyOfFocus(focus, placeholder, groupsIndex) === courseId;
    const target = isFocusInCourse
      ? focus
      : courseExpansionFocus(courseId, focus, placeholder, groupsIndex, systemDefaultProfile);
    const targetPlaceholder = isFocusInCourse ? placeholder : { ...placeholder, rulePayload: null };
    const resolved = resolveCreateTarget(courseId, target, targetPlaceholder, groupsIndex, systemDefaultProfile);
    if (resolved.kind === 'duplicate') {
      dispatch({ type: 'placeholderDuplicateRejected' });
      return;
    }
    if (target && target !== focus) {
      dispatch({ type: 'setFocus', focus: target });
    }

    const payload: CreateCompetencyCriterionPayload = { object_id: objectId, ...resolved.fields };

    createCriterion({ tagId, payload }).then(
      (criterion) => {
        // Read from the response: this callback closed over the pre-create `groupsIndex`,
        // which does not know a brand-new criterion or group.
        dispatch({
          type: 'createSucceeded',
          generation,
          focus: { groupId: criterion.groupId, ruleKey: ruleKeyOf(criterion, systemDefaultProfile) },
        });
      },
      (createError: AxiosError) => {
        // A 400 with a `tag_id` field error is the backend's hierarchy
        // dominance check: an ancestor or descendant competency already has
        // criteria in this course.
        const { response } = createError;
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
    );
  }, [
    associatedIds,
    groupsIndex,
    systemDefaultProfile,
    focus,
    placeholder,
    tagId,
    generation,
    createCriterion,
    showToast,
    intl,
  ]);

  // A bottom-tier group's `logic_operator`: "AND" means every rule box must be met ("all"), "OR" means any one
  // of them ("any").
  const updateGroupOperator = useCallback(
    (groupId: number, logicOperator: CompetencyGroupLogicOperator): Promise<void> =>
      updateGroupOperatorMutateAsync({ tagId, groupId, logicOperator }).then(() => undefined),
    [tagId, updateGroupOperatorMutateAsync],
  );

  const updateRuleScore = useCallback((
    groupId: number,
    criterionIds: number[],
    rulePayload: GradeRulePayload,
  ): Promise<void> => {
    if (!groupsIndex || !systemDefaultProfile) {
      // A rule box is only editable once both queries have resolved, so this is a narrowing guard.
      throw new Error('updateRuleScore called before the groups index and system default profile were loaded.');
    }
    // Every criterion in a rule box shares its effective rule, so any one of them gives the rule type.
    const anchorCriterion = (groupsIndex.criteriaByGroupId.get(groupId) ?? [])
      .find((criterion) => criterionIds.includes(criterion.id));
    if (!anchorCriterion) {
      // Defensive guard, not an expected runtime path: `criterionIds` always comes from this
      // same group's own rendered rule box.
      throw new Error(`updateRuleScore: no criterion in group ${groupId} matched the given criterionIds.`);
    }
    const { ruleType } = effectiveRuleOf(anchorCriterion, systemDefaultProfile);

    const visitGeneration = generationRef.current;
    return updateRuleScoreMutateAsync({ tagId, groupId, criterionIds, ruleType, rulePayload })
      .then((updatedCriteria) => {
        // The author moved to another competency while this ran; its focus is not ours to set.
        if (visitGeneration !== generationRef.current) {
          return;
        }
        // Keyed from the response: a "reset to default" edit can echo back a shared profile reference.
        const [updatedCriterion] = updatedCriteria;
        if (updatedCriterion) {
          const ruleKey = ruleKeyOf(updatedCriterion, systemDefaultProfile);
          dispatch({ type: 'setFocus', focus: { groupId, ruleKey } });
          dispatch({ type: 'keyboardFocusRequested', keyboardFocusRequest: { kind: 'ruleBox', groupId, ruleKey } });
        }
      });
  }, [groupsIndex, systemDefaultProfile, tagId, updateRuleScoreMutateAsync]);

  const consumeKeyboardFocusRequest = useCallback(() => {
    dispatch({ type: 'keyboardFocusRequested', keyboardFocusRequest: null });
  }, []);

  // Unlike `focusGroup`, lands on the group's first rule box. A group with none gets `null`, which focuses a
  // placeholder rule box, as `focusGroup` does.
  const focusGroupAfterRemoval = useCallback((
    groupId: number,
    freshIndex: CompetencyCriteriaGroupsIndex,
    shouldRequestKeyboardFocus: boolean,
  ) => {
    const ruleKey = systemDefaultProfile
      ? (ruleBoxesForGroup(groupId, freshIndex, systemDefaultProfile)[0]?.key ?? null)
      : null;
    dispatch({
      type: 'deleteResolved',
      focus: { groupId, ruleKey },
      keyboardFocusRequest: shouldRequestKeyboardFocus ? { kind: 'group', groupId, expand: true } : null,
    });
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
    // A failed or no-op delete leaves the trash button in the DOM, which keeps the browser's focus. Only a
    // vanished group strands it.
    const isDeletedGroupGone = !freshIndex.groupsById.has(deletedGroupId);

    if (target === 'unchanged') {
      const focusedGroupId = currentFocus?.groupId ?? null;
      if (isDeletedGroupGone && focusedGroupId !== null) {
        dispatch({
          type: 'deleteResolved',
          focus: 'keep',
          keyboardFocusRequest: { kind: 'group', groupId: focusedGroupId, expand: false },
        });
      }
    } else if (target === null) {
      dispatch({
        type: 'deleteResolved',
        focus: null,
        keyboardFocusRequest: isDeletedGroupGone && !hasVisibleOrNewCourseGroup(snapshot, freshIndex)
          ? { kind: 'empty' }
          : null,
      });
    } else {
      focusGroupAfterRemoval(target, freshIndex, isDeletedGroupGone);
    }
  }, [queryClient, tagId, focusGroupAfterRemoval]);

  const deleteGroup = useCallback((groupId: number) => {
    if (!groupsIndex) {
      return;
    }
    const snapshot = snapshotPageOrder(groupsIndex, accessibleCourseGroups);
    mutateDeleteGroup({ tagId, groupId }, {
      onError: (deleteError) => {
        // 404: the group is already gone, which is what the author asked for.
        if (deleteError.response?.status !== 404) {
          showToast(intl.formatMessage(messages.deleteGroupFailedToastMessage), undefined, undefined, ErrorIcon);
        }
      },
      onSettled: () => {
        resolveFocusAfterDelete(groupId, snapshot);
      },
    });
  }, [groupsIndex, accessibleCourseGroups, tagId, mutateDeleteGroup, resolveFocusAfterDelete, showToast, intl]);

  const removeAssociation = useCallback((criterionId: number, returnFocusTo: 'group' | 'subsection') => {
    const criterion = groupsQuery.data?.criteria.find((c) => c.id === criterionId);
    if (isDeleting || !groupsIndex || !criterion) {
      return;
    }
    const snapshot = snapshotPageOrder(groupsIndex, accessibleCourseGroups);
    const { groupId, objectId } = criterion;
    mutateDeleteCriterion({ tagId, criterionId }, {
      onSettled: () => {
        resolveFocusAfterDelete(groupId, snapshot);
        const dataAfterRemoval = queryClient.getQueryData<CompetencyCriteriaGroupsResponse>(
          competencyQueryKeys.competencyCriteriaGroups(tagId),
        );
        if (!dataAfterRemoval) {
          return;
        }
        // A 404 leaves the criterion gone, so a failure shows only when it is still there after the refetch.
        if (dataAfterRemoval.criteria.some((c) => c.id === criterionId)) {
          showToast(intl.formatMessage(messages.removeAssociationFailedToastMessage), undefined, undefined, ErrorIcon);
          if (returnFocusTo === 'subsection') {
            dispatch({ type: 'keyboardFocusRequested', keyboardFocusRequest: { kind: 'subsection', objectId } });
          }
          return;
        }
        if (returnFocusTo === 'subsection') {
          dispatch({ type: 'keyboardFocusRequested', keyboardFocusRequest: { kind: 'subsection', objectId } });
        } else if (dataAfterRemoval.groups.some((group) => group.id === groupId)) {
          dispatch({
            type: 'keyboardFocusRequested',
            keyboardFocusRequest: { kind: 'group', groupId, expand: false },
          });
        }
      },
    });
  }, [
    groupsQuery.data,
    isDeleting,
    groupsIndex,
    accessibleCourseGroups,
    tagId,
    mutateDeleteCriterion,
    resolveFocusAfterDelete,
    queryClient,
    showToast,
    intl,
  ]);

  const removePlaceholderGroup = useCallback(() => {
    const { parentRuleGroupId } = placeholder;
    const parentGroup = parentRuleGroupId !== null ? groupsIndex?.groupsById.get(parentRuleGroupId) : undefined;
    const lastGroup = groupsIndex && parentGroup?.courseKey != null
      ? lastBottomTierGroupForCourse(groupsIndex, parentGroup.courseKey)
      : null;
    if (groupsIndex && lastGroup) {
      focusGroupAfterRemoval(lastGroup.id, groupsIndex, true);
    } else {
      dispatch({ type: 'deleteResolved', focus: null, keyboardFocusRequest: null });
    }
  }, [placeholder, groupsIndex, focusGroupAfterRemoval]);

  const contextValue = useMemo<CompetencyAssociationsContextValue>(() => {
    const shared: CompetencyAssociationsContextBase = {
      error,
      focus,
      placeholder,
      hasPlaceholder,
      addPlaceholderRuleBox,
      addPlaceholderGroup,
      setPlaceholderLogicOperator,
      setPlaceholderRulePayload,
      discardPlaceholder,
      placeholderDuplicateRejected,
      focusGroup,
      focusRuleBox,
      notifyCourseExpanded,
      associateSubsection,
      updateGroupOperator,
      updateRuleScore,
      deleteGroup,
      isDeleting,
      removeAssociation,
      removePlaceholderGroup,
      keyboardFocusRequest,
      consumeKeyboardFocusRequest,
      isAssociating,
      expansionCountByCourseId,
      hasPermissionsError,
      canEditCourse,
      associatedObjectIds: associatedIds,
      accessibleCourseGroups,
      competencyExternalId,
      competencyName,
    };
    if (status === 'success' && groupsIndex && systemDefaultProfile) {
      return { ...shared, status, groupsIndex, systemDefaultProfile };
    }
    return { ...shared, status: status === 'error' ? 'error' : 'pending', groupsIndex, systemDefaultProfile };
  }, [
    status,
    error,
    focus,
    placeholder,
    hasPlaceholder,
    addPlaceholderRuleBox,
    addPlaceholderGroup,
    setPlaceholderLogicOperator,
    setPlaceholderRulePayload,
    discardPlaceholder,
    placeholderDuplicateRejected,
    focusGroup,
    focusRuleBox,
    notifyCourseExpanded,
    associateSubsection,
    updateGroupOperator,
    updateRuleScore,
    deleteGroup,
    isDeleting,
    removeAssociation,
    removePlaceholderGroup,
    keyboardFocusRequest,
    consumeKeyboardFocusRequest,
    isAssociating,
    expansionCountByCourseId,
    hasPermissionsError,
    canEditCourse,
    groupsIndex,
    systemDefaultProfile,
    associatedIds,
    accessibleCourseGroups,
    competencyExternalId,
    competencyName,
  ]);

  return (
    <CompetencyAssociationsContext.Provider value={contextValue}>
      {children}
    </CompetencyAssociationsContext.Provider>
  );
};
