import type {
  BottomTierCompetencyCriteriaGroup,
  CompetencyCriteriaGroup,
  CompetencyCriteriaGroupsResponse,
  CompetencyCriterion,
  CompetencyRuleProfile,
  CourseCompetencyCriteriaGroup,
  EffectiveRule,
  GradeRulePayload,
  RuleBox,
} from './data/types';

/** Lookup maps over a response's flat `groups` and `criteria` arrays. */
export interface CompetencyCriteriaGroupsIndex {
  /** Every group (root, course-level, or leaf), keyed by its own id. */
  groupsById: Map<number, CompetencyCriteriaGroup>;
  /** Every group's direct children, keyed by parent id. Leaf groups have no entry. */
  childGroupsByParentId: Map<number, CompetencyCriteriaGroup[]>;
  /** Every criterion belonging to one leaf group, keyed by that group's id. */
  criteriaByGroupId: Map<number, CompetencyCriterion[]>;
  /** Every course-level group, in the order the API returned them. */
  courseGroups: CourseCompetencyCriteriaGroup[];
}

export function buildCompetencyCriteriaGroupsIndex(
  response: CompetencyCriteriaGroupsResponse,
): CompetencyCriteriaGroupsIndex {
  const groupsById = new Map<number, CompetencyCriteriaGroup>();
  const childGroupsByParentId = new Map<number, CompetencyCriteriaGroup[]>();
  const courseGroups: CourseCompetencyCriteriaGroup[] = [];

  response.groups.forEach((group) => {
    groupsById.set(group.id, group);
    if (group.courseKey !== null) {
      courseGroups.push(group as CourseCompetencyCriteriaGroup);
    }
    if (group.parentId !== null) {
      const siblings = childGroupsByParentId.get(group.parentId) ?? [];
      siblings.push(group);
      childGroupsByParentId.set(group.parentId, siblings);
    }
  });

  const criteriaByGroupId = new Map<number, CompetencyCriterion[]>();
  response.criteria.forEach((criterion) => {
    const siblings = criteriaByGroupId.get(criterion.groupId) ?? [];
    siblings.push(criterion);
    criteriaByGroupId.set(criterion.groupId, siblings);
  });

  return {
    groupsById,
    childGroupsByParentId,
    criteriaByGroupId,
    courseGroups,
  };
}

/** The rule that governs a criterion: its own override fields when set, otherwise the system default rule. */
export function effectiveRuleOf(
  criterion: Pick<CompetencyCriterion, 'ruleTypeOverride' | 'rulePayloadOverride'>,
  systemDefaultProfile: CompetencyRuleProfile,
): EffectiveRule {
  if (criterion.ruleTypeOverride !== null && criterion.rulePayloadOverride !== null) {
    return { ruleType: criterion.ruleTypeOverride, rulePayload: criterion.rulePayloadOverride };
  }
  return { ruleType: systemDefaultProfile.ruleType, rulePayload: systemDefaultProfile.rulePayload };
}

/** A stable key for a criterion's effective rule. It is built from fixed-order fields, not
 * `JSON.stringify`, because key order can differ between two otherwise identical payloads.
 */
export function ruleKeyOf(
  criterion: Pick<CompetencyCriterion, 'ruleTypeOverride' | 'rulePayloadOverride'>,
  systemDefaultProfile: CompetencyRuleProfile,
): string {
  const { ruleType, rulePayload } = effectiveRuleOf(criterion, systemDefaultProfile);
  const { op, value, scale } = rulePayload;
  return `${ruleType}:${op}:${value}:${scale}`;
}

/** Groups one leaf group's criteria into rule boxes by effective rule, ordered by lowest criterion `id`. */
export function ruleBoxesForGroup(
  groupId: number,
  index: CompetencyCriteriaGroupsIndex,
  systemDefaultProfile: CompetencyRuleProfile,
): RuleBox[] {
  const criteria = index.criteriaByGroupId.get(groupId) ?? [];
  const criteriaByKey = new Map<string, CompetencyCriterion[]>();
  criteria.forEach((criterion) => {
    const key = ruleKeyOf(criterion, systemDefaultProfile);
    const box = criteriaByKey.get(key) ?? [];
    box.push(criterion);
    criteriaByKey.set(key, box);
  });

  return Array.from(criteriaByKey.entries())
    .map(([key, boxCriteria]): RuleBox => ({
      key,
      rule: effectiveRuleOf(boxCriteria[0], systemDefaultProfile),
      criteria: boxCriteria,
    }))
    .sort((a, b) => {
      const aMinId = Math.min(...a.criteria.map((c) => c.id));
      const bMinId = Math.min(...b.criteria.map((c) => c.id));
      return (aMinId - bMinId) || a.key.localeCompare(b.key);
    });
}

const percentOf = (rulePayload: GradeRulePayload): number => Math.round(rulePayload.value * 100);

/** Whether a rule box with the same rule type, operator, and rounded percent
 * already exists. Compares percents rather than `ruleKeyOf`'s raw-fraction
 * key, which could differ by formatting alone. `excludeKey` skips the box
 * being edited.
 */
export function isRuleTakenInGroup(rule: EffectiveRule, boxes: RuleBox[], excludeKey?: string): boolean {
  return boxes.some((box) => (
    box.key !== excludeKey
    && box.rule.ruleType === rule.ruleType
    && box.rule.rulePayload.op === rule.rulePayload.op
    && percentOf(box.rule.rulePayload) === percentOf(rule.rulePayload)
  ));
}

const SUGGESTED_SCORE_STEP = 5;

/** The nearest unused score in steps of 5, moving stricter: `gte` up, `lte`
 * down, within 0-100. `null` for `eq` or when nothing is free.
 */
export function nextUnusedScore(rule: EffectiveRule, boxes: RuleBox[]): GradeRulePayload | null {
  const { op } = rule.rulePayload;
  if (op === 'eq') {
    return null;
  }
  const direction = op === 'gte' ? SUGGESTED_SCORE_STEP : -SUGGESTED_SCORE_STEP;
  for (let percent = percentOf(rule.rulePayload) + direction; percent >= 0 && percent <= 100; percent += direction) {
    const candidate: EffectiveRule = { ...rule, rulePayload: { ...rule.rulePayload, value: percent / 100 } };
    if (!isRuleTakenInGroup(candidate, boxes)) {
      return candidate.rulePayload;
    }
  }
  return null;
}

/** The key of a bottom-tier group's last rule box, or `null` if the group has no criteria. */
export function lastRuleKeyIn(
  groupId: number,
  index: CompetencyCriteriaGroupsIndex,
  systemDefaultProfile: CompetencyRuleProfile,
): string | null {
  const boxes = ruleBoxesForGroup(groupId, index, systemDefaultProfile);
  return boxes.length ? boxes[boxes.length - 1].key : null;
}

/** The bottom-tier groups of one course, ordered by `ordering` then `id`. Empty if the course has none. */
export function bottomTierGroupsForCourse(
  index: CompetencyCriteriaGroupsIndex,
  courseId: string,
): BottomTierCompetencyCriteriaGroup[] {
  const courseGroup = index.courseGroups.find((group) => group.courseKey === courseId);
  if (!courseGroup) {
    return [];
  }
  const children = (index.childGroupsByParentId.get(courseGroup.id) ?? []) as BottomTierCompetencyCriteriaGroup[];
  return [...children].sort((a, b) => (a.ordering - b.ordering) || (a.id - b.id));
}

/** The last group in `bottomTierGroupsForCourse`'s order, or `null` if the course has none. */
export function lastBottomTierGroupForCourse(
  index: CompetencyCriteriaGroupsIndex,
  courseId: string,
): BottomTierCompetencyCriteriaGroup | null {
  const sorted = bottomTierGroupsForCourse(index, courseId);
  return sorted.length ? sorted[sorted.length - 1] : null;
}

/** The course-level groups whose course the author can see. The response can include courses
 * the author has no access to, and those must not render.
 */
export function visibleCourseGroups(
  index: CompetencyCriteriaGroupsIndex,
  accessibleCourseIds: Set<string>,
): CourseCompetencyCriteriaGroup[] {
  return index.courseGroups.filter((courseGroup) => accessibleCourseIds.has(courseGroup.courseKey));
}

export function associatedObjectIds(response: CompetencyCriteriaGroupsResponse): Set<string> {
  return new Set(response.criteria.map((criterion) => criterion.objectId));
}

/** One course-level group and its bottom-tier groups, as rendered. */
export interface PageOrderEntry {
  courseGroupId: number;
  ruleGroupIds: number[];
}

/** The rendered group order, captured before a delete to locate the removed focus afterward. */
export interface PageOrderSnapshot {
  /** What was rendered: the accessible course-level groups only. */
  entries: PageOrderEntry[];
  /** Every course-level group that existed. One missing from `entries` is inaccessible. */
  knownCourseGroupIds: number[];
}

/** Captures the order `CourseGroupList` renders: `accessibleCourseGroups`
 * order, then `bottomTierGroupsForCourse` order within each.
 */
export function snapshotPageOrder(
  index: CompetencyCriteriaGroupsIndex,
  accessibleCourseGroups: CourseCompetencyCriteriaGroup[],
): PageOrderSnapshot {
  return {
    entries: accessibleCourseGroups.map((courseGroup) => ({
      courseGroupId: courseGroup.id,
      ruleGroupIds: bottomTierGroupsForCourse(index, courseGroup.courseKey).map((group) => group.id),
    })),
    knownCourseGroupIds: index.courseGroups.map((courseGroup) => courseGroup.id),
  };
}

const isRenderedOrNew = (snapshot: PageOrderSnapshot, courseGroupId: number) => (
  !snapshot.knownCourseGroupIds.includes(courseGroupId)
  || snapshot.entries.some((entry) => entry.courseGroupId === courseGroupId)
);

/** Whether `freshIndex` holds a course-level group that was rendered before the delete or is new since. */
export function hasVisibleOrNewCourseGroup(
  snapshot: PageOrderSnapshot,
  freshIndex: CompetencyCriteriaGroupsIndex,
): boolean {
  return freshIndex.courseGroups.some((courseGroup) => isRenderedOrNew(snapshot, courseGroup.id));
}

/** Where focus goes after a delete, given the page order from before it and
 * the refetched data. Returns the id of the bottom-tier group to focus,
 * `'unchanged'` when focus needs no move, or `null` when nothing is left to
 * focus. In order:
 *
 * 1. The focused group still exists (for the placeholder group, its
 *    course-level group still exists): `'unchanged'`.
 * 2. Its course-level group survives: the nearest surviving group above it
 *    in the snapshot, else the nearest below.
 * 3. Otherwise the last group of the nearest surviving course-level group
 *    above, else the first group of the nearest one below.
 * 4. Otherwise the first group of the first course-level group in
 *    `freshIndex` that has one and did not exist at the snapshot (another
 *    author may have added it). This reads `freshIndex` unfiltered, since a
 *    new course's outline may still be loading.
 * 5. Otherwise `null`.
 *
 * Nothing focused before the delete is `'unchanged'`. A placeholder rule box
 * (`ruleKey === null` with a real `groupId`) is treated as focus on that
 * group.
 */
export function focusTargetAfterRemoval(
  snapshot: PageOrderSnapshot,
  freshIndex: CompetencyCriteriaGroupsIndex,
  focus: { groupId: number | null; ruleKey: string | null; } | null,
  placeholderParentId: number | null,
): number | 'unchanged' | null {
  if (focus === null) {
    return 'unchanged';
  }
  const survives = (id: number) => freshIndex.groupsById.has(id);
  const focusedGroupId = focus.groupId;

  let courseEntryPosition: number;
  if (focusedGroupId === null) {
    if (placeholderParentId === null || survives(placeholderParentId)) {
      return 'unchanged';
    }
    courseEntryPosition = snapshot.entries.findIndex((entry) => entry.courseGroupId === placeholderParentId);
  } else {
    if (survives(focusedGroupId)) {
      return 'unchanged';
    }
    courseEntryPosition = snapshot.entries.findIndex((entry) => entry.ruleGroupIds.includes(focusedGroupId));
  }

  if (courseEntryPosition !== -1) {
    const entry = snapshot.entries[courseEntryPosition];
    if (focusedGroupId !== null && survives(entry.courseGroupId)) {
      const position = entry.ruleGroupIds.indexOf(focusedGroupId);
      const above = entry.ruleGroupIds.slice(0, position).filter(survives).pop();
      const below = entry.ruleGroupIds.slice(position + 1).find(survives);
      const sibling = above ?? below;
      if (sibling !== undefined) {
        return sibling;
      }
    }

    const survivingRuleGroups = (candidate: PageOrderEntry) => (
      survives(candidate.courseGroupId) ? candidate.ruleGroupIds.filter(survives) : []
    );
    for (let i = courseEntryPosition - 1; i >= 0; i -= 1) {
      const last = survivingRuleGroups(snapshot.entries[i]).pop();
      if (last !== undefined) {
        return last;
      }
    }
    for (let i = courseEntryPosition + 1; i < snapshot.entries.length; i += 1) {
      const [first] = survivingRuleGroups(snapshot.entries[i]);
      if (first !== undefined) {
        return first;
      }
    }
  }

  for (const courseGroup of freshIndex.courseGroups) {
    // One that existed before was either handled by rules 2 and 3 or is
    // inaccessible to the author, so focusing it would target nothing visible.
    if (snapshot.knownCourseGroupIds.includes(courseGroup.id)) {
      continue;
    }
    const [first] = bottomTierGroupsForCourse(freshIndex, courseGroup.courseKey);
    if (first) {
      return first.id;
    }
  }
  return null;
}
