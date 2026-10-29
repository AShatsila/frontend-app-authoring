import { buildOutlineIndex } from '@src/course-outline/__mocks__';
import { RemovalTargetKind } from './constants';
import type {
  CompetencyCriteriaGroupsResponse,
  CompetencyCriterion,
  CompetencyRuleProfile,
  GradeRulePayload,
  RuleBox,
} from './data/types';
import type { RemovalTarget } from './utils';
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
  nextUnusedScore,
  ruleBoxesForGroup,
  ruleKeyAfterRemoval,
  ruleKeyOf,
  snapshotPageOrder,
  subsectionNamesFromOutline,
  summarizeRemoval,
  visibleCourseGroups,
} from './utils';

const systemDefaultProfile: CompetencyRuleProfile = {
  id: 1,
  scopeType: 'system_default',
  ruleType: 'grade',
  rulePayload: { op: 'gte', value: 0.7, scale: 'percent' },
  archived: false,
};

const buildCriterion = (overrides: Partial<CompetencyCriterion> = {}): CompetencyCriterion => ({
  id: 1,
  objectId: 'block-a',
  groupId: 10,
  ruleProfileId: null,
  ruleTypeOverride: null,
  rulePayloadOverride: null,
  ...overrides,
});

// The competency's root group (id 100, instance-wide, never rendered), one
// course-level group under it (id 1, "course-v1:OrgX+CS101+2024") with two
// leaf groups: group 10 (ordering 0) holds two rule boxes (criteria 101+102
// share the default profile's rule, criterion 104 overrides to a
// different one); group 11 (ordering 1) holds one rule box (criterion
// 103). Group ids and array order are deliberately out of numeric/array
// order so tests can't pass by accident from iterating in id or array
// order instead of by the fields the derivation actually sorts on.
const fixtureResponse: CompetencyCriteriaGroupsResponse = {
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
    {
      id: 11,
      parentId: 1,
      tagId: 42,
      courseKey: null,
      name: 'leaf',
      ordering: 1,
      logicOperator: 'OR',
      archived: false,
    },
    {
      id: 10,
      parentId: 1,
      tagId: 42,
      courseKey: null,
      name: 'leaf',
      ordering: 0,
      logicOperator: 'AND',
      archived: false,
    },
  ],
  criteria: [
    buildCriterion({
      id: 101,
      objectId: 'block-a',
      groupId: 10,
      ruleTypeOverride: 'grade',
      rulePayloadOverride: { op: 'gte', value: 0.7, scale: 'percent' },
    }),
    // No override: resolves through `systemDefaultProfile`, which happens
    // to carry the exact same rule as criterion 101's override above - so
    // this criterion must land in the *same* rule box as 101.
    buildCriterion({ id: 102, objectId: 'block-b', groupId: 10 }),
    buildCriterion({
      id: 104,
      objectId: 'block-d',
      groupId: 10,
      ruleTypeOverride: 'grade',
      rulePayloadOverride: { op: 'lte', value: 0.9, scale: 'percent' },
    }),
    buildCriterion({
      id: 103,
      objectId: 'block-c',
      groupId: 11,
      ruleTypeOverride: 'grade',
      rulePayloadOverride: { op: 'lte', value: 0.5, scale: 'percent' },
    }),
  ],
};

describe('buildCompetencyCriteriaGroupsIndex', () => {
  it('indexes groups by id, by parent, and criteria by containing group', () => {
    const index = buildCompetencyCriteriaGroupsIndex(fixtureResponse);

    expect(index.groupsById.get(100)).toEqual(fixtureResponse.groups[0]);
    expect(index.groupsById.get(1)).toEqual(fixtureResponse.groups[1]);
    expect(index.groupsById.get(11)).toEqual(fixtureResponse.groups[2]);
    expect(index.groupsById.get(10)).toEqual(fixtureResponse.groups[3]);

    const childrenOfCourseGroup = index.childGroupsByParentId.get(1) ?? [];
    expect(childrenOfCourseGroup.map((g) => g.id).sort((a, b) => a - b)).toEqual([10, 11]);
    expect(index.childGroupsByParentId.get(10)).toBeUndefined();

    expect((index.criteriaByGroupId.get(10) ?? []).map((c) => c.id).sort((a, b) => a - b)).toEqual([101, 102, 104]);
    expect((index.criteriaByGroupId.get(11) ?? []).map((c) => c.id)).toEqual([103]);

    expect(index.courseGroups).toEqual([fixtureResponse.groups[1]]);
  });

  it('excludes the root group row from courseGroups, even though it\'s still indexed by id', () => {
    const index = buildCompetencyCriteriaGroupsIndex(fixtureResponse);

    expect(index.groupsById.get(100)).toBeDefined();
    expect(index.courseGroups.map((g) => g.id)).not.toContain(100);
  });
});

describe('effectiveRuleOf', () => {
  it('returns the criterion\'s own override fields when set', () => {
    const criterion = buildCriterion({
      ruleTypeOverride: 'grade',
      rulePayloadOverride: { op: 'eq', value: 1, scale: 'percent' },
    });
    expect(effectiveRuleOf(criterion, systemDefaultProfile)).toEqual({
      ruleType: 'grade',
      rulePayload: { op: 'eq', value: 1, scale: 'percent' },
    });
  });

  it('falls back to the system default profile when no override is set', () => {
    const criterion = buildCriterion();
    expect(effectiveRuleOf(criterion, systemDefaultProfile)).toEqual({
      ruleType: systemDefaultProfile.ruleType,
      rulePayload: systemDefaultProfile.rulePayload,
    });
  });
});

describe('ruleKeyOf', () => {
  it('is stable regardless of the rule payload object\'s own key-insertion order', () => {
    // Same fields, same values, deliberately built with a different
    // property insertion order - `JSON.stringify` would serialize these
    // two objects into different strings; `ruleKeyOf` must not.
    const payloadOpFirst: GradeRulePayload = { op: 'gte', value: 0.7, scale: 'percent' };
    const payloadScaleFirst: GradeRulePayload = { scale: 'percent', value: 0.7, op: 'gte' } as GradeRulePayload;
    expect(JSON.stringify(payloadOpFirst)).not.toEqual(JSON.stringify(payloadScaleFirst));

    const criterionA = buildCriterion({ ruleTypeOverride: 'grade', rulePayloadOverride: payloadOpFirst });
    const criterionB = buildCriterion({ ruleTypeOverride: 'grade', rulePayloadOverride: payloadScaleFirst });

    expect(ruleKeyOf(criterionA, systemDefaultProfile)).toEqual(ruleKeyOf(criterionB, systemDefaultProfile));
  });
});

describe('ruleBoxesForGroup', () => {
  it('groups criteria sharing an effective rule into one box, and different rules into separate boxes', () => {
    const index = buildCompetencyCriteriaGroupsIndex(fixtureResponse);
    const boxes = ruleBoxesForGroup(10, index, systemDefaultProfile);

    expect(boxes).toHaveLength(2);
    // Sorted by lowest criterion id ascending: the 101/102 box (min id
    // 101) comes before the 104 box (min id 104).
    expect(boxes[0].criteria.map((c) => c.id).sort((a, b) => a - b)).toEqual([101, 102]);
    expect(boxes[0].rule).toEqual({ ruleType: 'grade', rulePayload: { op: 'gte', value: 0.7, scale: 'percent' } });
    expect(boxes[1].criteria.map((c) => c.id)).toEqual([104]);
    expect(boxes[1].rule).toEqual({ ruleType: 'grade', rulePayload: { op: 'lte', value: 0.9, scale: 'percent' } });
  });

  it('returns no boxes for a group with no criteria', () => {
    const index = buildCompetencyCriteriaGroupsIndex(fixtureResponse);
    expect(ruleBoxesForGroup(999, index, systemDefaultProfile)).toEqual([]);
  });
});

describe('lastRealRuleKeyIn', () => {
  it('returns the last box\'s rule key for a populated group', () => {
    const index = buildCompetencyCriteriaGroupsIndex(fixtureResponse);
    expect(lastRealRuleKeyIn(10, index, systemDefaultProfile)).toEqual(ruleKeyOf(
      buildCriterion({
        id: 104,
        ruleTypeOverride: 'grade',
        rulePayloadOverride: { op: 'lte', value: 0.9, scale: 'percent' },
      }),
      systemDefaultProfile,
    ));
  });

  it('returns null for a group with no criteria', () => {
    const index = buildCompetencyCriteriaGroupsIndex(fixtureResponse);
    expect(lastRealRuleKeyIn(999, index, systemDefaultProfile)).toBeNull();
  });
});

describe('ruleKeyAfterRemoval', () => {
  it.each([
    { name: 'the second of three', vanished: 'b', keysAfter: ['a', 'c'], expected: 'a' },
    { name: 'the first of three', vanished: 'a', keysAfter: ['b', 'c'], expected: 'b' },
    { name: 'the third of three', vanished: 'c', keysAfter: ['a', 'b'], expected: 'b' },
  ])('prefers the box above, else below, when $name vanishes', ({ vanished, keysAfter, expected }) => {
    expect(ruleKeyAfterRemoval(['a', 'b', 'c'], vanished, keysAfter)).toBe(expected);
  });

  it('prefers the box above over the first box and the box below when the third of four vanishes', () => {
    expect(ruleKeyAfterRemoval(['a', 'b', 'c', 'd'], 'c', ['a', 'b', 'd'])).toBe('b');
  });

  it('skips a neighbour that vanished too and takes the nearest survivor above', () => {
    expect(ruleKeyAfterRemoval(['a', 'b', 'c', 'd', 'e'], 'd', ['a', 'b', 'e'])).toBe('b');
  });

  it('takes the nearest survivor below, not the first box now, when none above survives', () => {
    expect(ruleKeyAfterRemoval(['a', 'b', 'c', 'd', 'e'], 'b', ['x', 'd', 'e'])).toBe('d');
  });

  it('falls back to the first box now when every box it knew has gone but a new one is present', () => {
    expect(ruleKeyAfterRemoval(['a', 'b'], 'b', ['x'])).toBe('x');
  });

  it('returns null when no box is left', () => {
    expect(ruleKeyAfterRemoval(['a', 'b'], 'b', [])).toBeNull();
  });

  it('falls back to the first box now when the order before removal is unknown', () => {
    expect(ruleKeyAfterRemoval([], 'b', ['x', 'y'])).toBe('x');
  });
});

describe('bottomTierGroupsForCourse', () => {
  it('returns every bottom-tier group under the course, ordered by ordering then id', () => {
    const index = buildCompetencyCriteriaGroupsIndex(fixtureResponse);
    const groups = bottomTierGroupsForCourse(index, 'course-v1:OrgX+CS101+2024');
    expect(groups.map((g) => g.id)).toEqual([10, 11]); // group 10 has ordering 0, group 11 has ordering 1
  });

  it('returns an empty array when the course has no course-level group', () => {
    const index = buildCompetencyCriteriaGroupsIndex(fixtureResponse);
    expect(bottomTierGroupsForCourse(index, 'course-v1:Unrelated+X+1')).toEqual([]);
  });
});

describe('lastBottomTierGroupForCourse', () => {
  it('returns the bottom-tier group with the highest ordering', () => {
    const index = buildCompetencyCriteriaGroupsIndex(fixtureResponse);
    const last = lastBottomTierGroupForCourse(index, 'course-v1:OrgX+CS101+2024');
    expect(last?.id).toEqual(11); // ordering 1, higher than group 10's ordering 0
  });

  it('breaks a tie in ordering by the higher id', () => {
    const tieResponse: CompetencyCriteriaGroupsResponse = {
      groups: [
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
        {
          id: 20,
          parentId: 1,
          tagId: 42,
          courseKey: null,
          name: 'leaf',
          ordering: 0,
          logicOperator: 'AND',
          archived: false,
        },
        {
          id: 21,
          parentId: 1,
          tagId: 42,
          courseKey: null,
          name: 'leaf',
          ordering: 0,
          logicOperator: 'AND',
          archived: false,
        },
      ],
      criteria: [],
    };
    const index = buildCompetencyCriteriaGroupsIndex(tieResponse);
    const last = lastBottomTierGroupForCourse(index, 'course-v1:OrgX+CS101+2024');
    expect(last?.id).toEqual(21);
  });

  it('returns null when the course has no course-level group', () => {
    const index = buildCompetencyCriteriaGroupsIndex(fixtureResponse);
    expect(lastBottomTierGroupForCourse(index, 'course-v1:Unrelated+X+1')).toBeNull();
  });

  it('returns null when the course-level group has no bottom-tier children yet', () => {
    const noChildrenResponse: CompetencyCriteriaGroupsResponse = {
      groups: [
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
    const index = buildCompetencyCriteriaGroupsIndex(noChildrenResponse);
    expect(lastBottomTierGroupForCourse(index, 'course-v1:OrgX+CS101+2024')).toBeNull();
  });
});

describe('visibleCourseGroups', () => {
  it('returns a course-level group whose course is in accessibleCourseIds', () => {
    const index = buildCompetencyCriteriaGroupsIndex(fixtureResponse);
    expect(visibleCourseGroups(index, new Set(['course-v1:OrgX+CS101+2024']))).toEqual([fixtureResponse.groups[1]]);
  });

  it('excludes a course-level group whose course isn\'t in accessibleCourseIds', () => {
    const index = buildCompetencyCriteriaGroupsIndex(fixtureResponse);
    expect(visibleCourseGroups(index, new Set())).toEqual([]);
    expect(visibleCourseGroups(index, new Set(['course-v1:SomeOtherCourse+1']))).toEqual([]);
  });
});

describe('associatedObjectIds', () => {
  it('returns every criterion\'s objectId across the whole tree', () => {
    expect(associatedObjectIds(fixtureResponse)).toEqual(new Set(['block-a', 'block-b', 'block-d', 'block-c']));
  });
});

describe('isRuleTakenInGroup / nextUnusedScore', () => {
  const ruleOf = (op: GradeRulePayload['op'], percent: number, ruleType = 'grade') => ({
    ruleType,
    rulePayload: { op, value: percent / 100, scale: 'percent' as const },
  });
  const boxOf = (op: GradeRulePayload['op'], percent: number, ruleType = 'grade'): RuleBox => ({
    key: `${ruleType}:${op}:${percent}`,
    rule: ruleOf(op, percent, ruleType),
    criteria: [],
  });

  it('is taken when a box has the same rule type, operator, and rounded percent', () => {
    expect(isRuleTakenInGroup(ruleOf('gte', 75), [boxOf('gte', 75)])).toBe(true);
  });

  it('is not taken when only the operator differs', () => {
    expect(isRuleTakenInGroup(ruleOf('gte', 75), [boxOf('lte', 75)])).toBe(false);
  });

  it('is not taken when only the rule type differs', () => {
    expect(isRuleTakenInGroup(ruleOf('gte', 75), [boxOf('gte', 75, 'other')])).toBe(false);
  });

  it('ignores the box being edited, by key', () => {
    const box = boxOf('gte', 75);
    expect(isRuleTakenInGroup(ruleOf('gte', 75), [box], box.key)).toBe(false);
  });

  it('suggests the next score up for gte', () => {
    expect(nextUnusedScore(ruleOf('gte', 75), [boxOf('gte', 75)])?.value).toBe(0.8);
  });

  it('suggests the next score down for lte', () => {
    expect(nextUnusedScore(ruleOf('lte', 40), [boxOf('lte', 40)])?.value).toBe(0.35);
  });

  it('skips scores that are also taken', () => {
    const boxes = [boxOf('gte', 75), boxOf('gte', 80)];
    expect(nextUnusedScore(ruleOf('gte', 75), boxes)?.value).toBe(0.85);
  });

  it('returns null when nothing is free in that direction', () => {
    const boxes = [boxOf('gte', 90), boxOf('gte', 95), boxOf('gte', 100)];
    expect(nextUnusedScore(ruleOf('gte', 90), boxes)).toBeNull();
  });

  it('returns null for an eq rule', () => {
    expect(nextUnusedScore(ruleOf('eq', 50), [boxOf('eq', 50)])).toBeNull();
  });
});

/** A tree of course-level groups (ids 1, 2, 3...), each with the given leaf group ids, in order. */
const buildTree = (courses: Array<{ id: number; ruleGroupIds: number[]; }>) => {
  const response: CompetencyCriteriaGroupsResponse = {
    groups: [
      {
        id: 500,
        parentId: null,
        tagId: 42,
        courseKey: null,
        name: 'root',
        ordering: 0,
        logicOperator: 'AND',
        archived: false,
      },
      ...courses.flatMap((course, courseOrdering) => [
        {
          id: course.id,
          parentId: 500,
          tagId: 42,
          courseKey: `course-v1:Org+C${course.id}+2024`,
          name: 'course',
          ordering: courseOrdering,
          logicOperator: 'AND' as const,
          archived: false,
        },
        ...course.ruleGroupIds.map((ruleGroupId, ordering) => ({
          id: ruleGroupId,
          parentId: course.id,
          tagId: 42,
          courseKey: null,
          name: 'leaf',
          ordering,
          logicOperator: 'AND' as const,
          archived: false,
        })),
      ]),
    ],
    criteria: [],
  };
  return buildCompetencyCriteriaGroupsIndex(response);
};

describe('snapshotPageOrder', () => {
  it('lists accessible course groups in their given order, each with its rule groups in ordering order', () => {
    const index = buildTree([{ id: 1, ruleGroupIds: [11, 10] }, { id: 2, ruleGroupIds: [20] }, {
      id: 3,
      ruleGroupIds: [30],
    }]);
    // Course group 3 is not accessible, so it is left out of what is rendered.
    const accessible = [index.courseGroups[1], index.courseGroups[0]];

    expect(snapshotPageOrder(index, accessible)).toEqual({
      entries: [
        { courseGroupId: 2, ruleGroupIds: [20] },
        { courseGroupId: 1, ruleGroupIds: [11, 10] },
      ],
      knownCourseGroupIds: [1, 2, 3],
    });
  });
});

describe('focusTargetAfterRemoval', () => {
  // Course groups 1 (rule groups 10, 11, 12), 2 (20), 3 (30, 31), as rendered before a delete.
  const before = buildTree([
    { id: 1, ruleGroupIds: [10, 11, 12] },
    { id: 2, ruleGroupIds: [20] },
    { id: 3, ruleGroupIds: [30, 31] },
  ]);
  const snapshot = snapshotPageOrder(before, before.courseGroups);

  it('is unchanged when nothing was focused', () => {
    const fresh = buildTree([{ id: 1, ruleGroupIds: [10, 12] }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, null, null)).toBe('unchanged');
  });

  it('is unchanged when the focused rule group still exists', () => {
    const fresh = buildTree([{ id: 1, ruleGroupIds: [10, 12] }, { id: 2, ruleGroupIds: [20] }, {
      id: 3,
      ruleGroupIds: [30, 31],
    }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: 12, ruleKey: 'k' }, null)).toBe('unchanged');
  });

  it('is unchanged for a placeholder rule box in a rule group that still exists', () => {
    const fresh = buildTree([{ id: 1, ruleGroupIds: [10, 12] }, { id: 2, ruleGroupIds: [20] }, {
      id: 3,
      ruleGroupIds: [30, 31],
    }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: 12, ruleKey: null }, null)).toBe('unchanged');
  });

  it('is unchanged for the placeholder rule group while its course group still exists', () => {
    const fresh = buildTree([{ id: 1, ruleGroupIds: [10, 11, 12] }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: null, ruleKey: null }, 1)).toBe('unchanged');
  });

  it('picks the nearest surviving rule group above when the focused one was deleted', () => {
    const fresh = buildTree([{ id: 1, ruleGroupIds: [10, 12] }, { id: 2, ruleGroupIds: [20] }, {
      id: 3,
      ruleGroupIds: [30, 31],
    }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: 11, ruleKey: 'k' }, null)).toBe(10);
  });

  it('skips an above neighbor that was also removed', () => {
    const fresh = buildTree([{ id: 1, ruleGroupIds: [10] }, { id: 2, ruleGroupIds: [20] }, {
      id: 3,
      ruleGroupIds: [30, 31],
    }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: 12, ruleKey: 'k' }, null)).toBe(10);
  });

  it('picks the nearest surviving rule group below when the first one was deleted', () => {
    const fresh = buildTree([{ id: 1, ruleGroupIds: [11, 12] }, { id: 2, ruleGroupIds: [20] }, {
      id: 3,
      ruleGroupIds: [30, 31],
    }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: 10, ruleKey: 'k' }, null)).toBe(11);
  });

  it('treats a placeholder rule box in the deleted rule group like focus on that group', () => {
    const fresh = buildTree([{ id: 1, ruleGroupIds: [10, 12] }, { id: 2, ruleGroupIds: [20] }, {
      id: 3,
      ruleGroupIds: [30, 31],
    }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: 11, ruleKey: null }, null)).toBe(10);
  });

  it('picks the last rule group of the surviving course group above when the course group cascaded away', () => {
    const fresh = buildTree([{ id: 1, ruleGroupIds: [10, 11, 12] }, { id: 3, ruleGroupIds: [30, 31] }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: 20, ruleKey: 'k' }, null)).toBe(12);
  });

  it('picks the first rule group of the surviving course group below when none survives above', () => {
    const fresh = buildTree([{ id: 2, ruleGroupIds: [20] }, { id: 3, ruleGroupIds: [30, 31] }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: 10, ruleKey: 'k' }, null)).toBe(20);
  });

  it('skips a surviving course group above that has no rule groups left', () => {
    const fresh = buildTree([{ id: 1, ruleGroupIds: [10, 11, 12] }, { id: 2, ruleGroupIds: [] }, {
      id: 3,
      ruleGroupIds: [],
    }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: 30, ruleKey: 'k' }, null)).toBe(12);
  });

  it('finds the nearest surviving course group when the placeholder rule group\'s own course group was deleted', () => {
    const fresh = buildTree([{ id: 1, ruleGroupIds: [10, 11, 12] }, { id: 3, ruleGroupIds: [30, 31] }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: null, ruleKey: null }, 2)).toBe(12);
  });

  it('falls back to the first rule group of the first course group in the fresh data (another author\'s)', () => {
    const fresh = buildTree([{ id: 8, ruleGroupIds: [81, 80] }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: 10, ruleKey: 'k' }, null)).toBe(81);
  });

  it('skips a fresh course group with no rule groups when falling back', () => {
    const fresh = buildTree([{ id: 7, ruleGroupIds: [] }, { id: 8, ruleGroupIds: [80] }]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: 10, ruleKey: 'k' }, null)).toBe(80);
  });

  it('skips a course group that existed but was not rendered, since the author cannot see it', () => {
    const withHidden = buildTree([{ id: 1, ruleGroupIds: [10] }, { id: 4, ruleGroupIds: [40] }]);
    const hiddenSnapshot = snapshotPageOrder(withHidden, [withHidden.courseGroups[0]]);
    const fresh = buildTree([{ id: 4, ruleGroupIds: [40] }]);

    expect(focusTargetAfterRemoval(hiddenSnapshot, fresh, { groupId: 10, ruleKey: 'k' }, null)).toBeNull();
  });

  it('picks a new course group past a hidden one that existed before', () => {
    const withHidden = buildTree([{ id: 1, ruleGroupIds: [10] }, { id: 4, ruleGroupIds: [40] }]);
    const hiddenSnapshot = snapshotPageOrder(withHidden, [withHidden.courseGroups[0]]);
    const fresh = buildTree([{ id: 4, ruleGroupIds: [40] }, { id: 8, ruleGroupIds: [80] }]);

    expect(focusTargetAfterRemoval(hiddenSnapshot, fresh, { groupId: 10, ruleKey: 'k' }, null)).toBe(80);
  });

  it('is null when no course group with a rule group is left', () => {
    const fresh = buildTree([]);
    expect(focusTargetAfterRemoval(snapshot, fresh, { groupId: 10, ruleKey: 'k' }, null)).toBeNull();
  });
});

describe('hasVisibleOrNewCourseGroup', () => {
  const before = buildTree([{ id: 1, ruleGroupIds: [10] }, { id: 4, ruleGroupIds: [40] }]);
  // Course group 4 existed but was not rendered.
  const snapshot = snapshotPageOrder(before, [before.courseGroups[0]]);

  it('is true for a course group that was rendered before', () => {
    expect(hasVisibleOrNewCourseGroup(snapshot, buildTree([{ id: 1, ruleGroupIds: [] }]))).toBe(true);
  });

  it('is true for a course group added since', () => {
    expect(hasVisibleOrNewCourseGroup(snapshot, buildTree([{ id: 8, ruleGroupIds: [80] }]))).toBe(true);
  });

  it('is false when only a course group that was never rendered is left, or none', () => {
    expect(hasVisibleOrNewCourseGroup(snapshot, buildTree([{ id: 4, ruleGroupIds: [40] }]))).toBe(false);
    expect(hasVisibleOrNewCourseGroup(snapshot, buildTree([]))).toBe(false);
  });
});

describe('subsectionNamesFromOutline', () => {
  it('maps every subsection id, across sections, to its display name', () => {
    const { courseStructure } = buildOutlineIndex({
      sections: [
        {
          id: 'section-1',
          displayName: 'Section 1',
          children: [
            // `usageKey: undefined` mirrors the real `course_index` response, which never populates it.
            { id: 'sub-1a', displayName: 'Subsection 1A', overrides: { usageKey: undefined } },
            { id: 'sub-1b', displayName: 'Subsection 1B' },
          ],
        },
        {
          id: 'section-2',
          displayName: 'Section 2',
          children: [{ id: 'sub-2a', displayName: 'Subsection 2A' }],
        },
      ],
    });

    expect(subsectionNamesFromOutline(courseStructure)).toEqual({
      'sub-1a': 'Subsection 1A',
      'sub-1b': 'Subsection 1B',
      'sub-2a': 'Subsection 2A',
    });
  });

  it('is empty for a course with no sections', () => {
    expect(subsectionNamesFromOutline(buildOutlineIndex([]).courseStructure)).toEqual({});
  });
});

describe('summarizeRemoval', () => {
  const courseKey = 'course-v1:OrgX+CS101+2024';
  const courseNames = new Map([[courseKey, 'Intro to CS']]);
  const subsectionNames = { 'block-a': 'Quiz A', 'block-b': 'Quiz B', 'block-d': 'Quiz D' };
  const index = buildCompetencyCriteriaGroupsIndex(fixtureResponse);
  const summarize = (target: RemovalTarget, names = subsectionNames) => (
    summarizeRemoval(target, index, systemDefaultProfile, courseNames, names)
  );
  // Group 11 and its criterion are gone, so group 10 is the course's only group.
  const onlyGroupIndex = buildCompetencyCriteriaGroupsIndex({
    groups: fixtureResponse.groups.filter((group) => group.id !== 11),
    criteria: fixtureResponse.criteria.filter((criterion) => criterion.groupId !== 11),
  });

  const targetsWithACourse: RemovalTarget[] = [
    { kind: RemovalTargetKind.RuleGroup, groupId: 10 },
    { kind: RemovalTargetKind.CourseGroup, groupId: 1 },
    { kind: RemovalTargetKind.RuleBox, groupId: 10, criterionIds: [101] },
  ];
  it.each(targetsWithACourse)('falls back to the course key for a $kind when the outline gave no name', (target) => {
    expect(summarizeRemoval(target, index, systemDefaultProfile, new Map(), subsectionNames))
      .toMatchObject({ courseName: courseKey });
  });

  describe('association', () => {
    it('names the content from the subsection names', () => {
      expect(summarize({ kind: RemovalTargetKind.Association, criterionId: 101, returnFocusTo: 'group' }))
        .toEqual({ kind: RemovalTargetKind.Association, contentName: 'Quiz A' });
    });

    it('has a null name for a subsection the outline no longer lists', () => {
      expect(summarize({ kind: RemovalTargetKind.Association, criterionId: 103, returnFocusTo: 'subsection' }))
        .toEqual({ kind: RemovalTargetKind.Association, contentName: null });
    });

    it('is null for a criterion the data does not have', () => {
      expect(summarize({ kind: RemovalTargetKind.Association, criterionId: 999, returnFocusTo: 'group' })).toBeNull();
    });
  });

  describe('ruleGroup', () => {
    it('counts the group\'s associations and names its course', () => {
      expect(summarize({ kind: RemovalTargetKind.RuleGroup, groupId: 10 })).toEqual({
        kind: RemovalTargetKind.RuleGroup,
        associationCount: 3,
        courseName: 'Intro to CS',
        isOnlyGroupInCourse: false,
      });
    });

    it('flags the only group in its course', () => {
      expect(summarizeRemoval(
        { kind: RemovalTargetKind.RuleGroup, groupId: 10 },
        onlyGroupIndex,
        systemDefaultProfile,
        courseNames,
        subsectionNames,
      )).toEqual({
        kind: RemovalTargetKind.RuleGroup,
        associationCount: 3,
        courseName: 'Intro to CS',
        isOnlyGroupInCourse: true,
      });
    });

    it('is null for a missing group and for a course-level group', () => {
      expect(summarize({ kind: RemovalTargetKind.RuleGroup, groupId: 999 })).toBeNull();
      expect(summarize({ kind: RemovalTargetKind.RuleGroup, groupId: 1 })).toBeNull();
    });
  });

  describe('courseGroup', () => {
    it('sums the associations of every leaf group under the course', () => {
      expect(summarize({ kind: RemovalTargetKind.CourseGroup, groupId: 1 })).toEqual({
        kind: RemovalTargetKind.CourseGroup,
        associationCount: 4,
        courseName: 'Intro to CS',
      });
    });

    it('is null for a leaf group and for a missing group', () => {
      expect(summarize({ kind: RemovalTargetKind.CourseGroup, groupId: 10 })).toBeNull();
      expect(summarize({ kind: RemovalTargetKind.CourseGroup, groupId: 999 })).toBeNull();
    });
  });

  describe('ruleBox', () => {
    it('lists the names of the given criteria in criterion order and counts the other rules', () => {
      expect(summarize({ kind: RemovalTargetKind.RuleBox, groupId: 10, criterionIds: [101, 102] })).toEqual({
        kind: RemovalTargetKind.RuleBox,
        contentNames: ['Quiz A', 'Quiz B'],
        otherRuleCount: 1,
        courseName: 'Intro to CS',
        isOnlyGroupInCourse: false,
      });
    });

    it('counts every box the ids span as removed', () => {
      expect(summarize({ kind: RemovalTargetKind.RuleBox, groupId: 10, criterionIds: [101, 102, 104] })).toMatchObject({
        contentNames: ['Quiz A', 'Quiz B', 'Quiz D'],
        otherRuleCount: 0,
      });
    });

    it('skips an id the group no longer has', () => {
      expect(summarize({ kind: RemovalTargetKind.RuleBox, groupId: 10, criterionIds: [101, 999] })).toMatchObject({
        contentNames: ['Quiz A'],
        otherRuleCount: 1,
      });
    });

    it('has a null entry for a subsection the outline no longer lists', () => {
      expect(summarize({ kind: RemovalTargetKind.RuleBox, groupId: 11, criterionIds: [103] })).toMatchObject({
        contentNames: [null],
        otherRuleCount: 0,
      });
    });

    it('flags the only group in its course', () => {
      expect(summarizeRemoval(
        { kind: RemovalTargetKind.RuleBox, groupId: 10, criterionIds: [104] },
        onlyGroupIndex,
        systemDefaultProfile,
        courseNames,
        subsectionNames,
      )).toMatchObject({ contentNames: ['Quiz D'], otherRuleCount: 1, isOnlyGroupInCourse: true });
    });

    it('is null when none of the ids is left in the group', () => {
      expect(summarize({ kind: RemovalTargetKind.RuleBox, groupId: 10, criterionIds: [999] })).toBeNull();
      expect(summarize({ kind: RemovalTargetKind.RuleBox, groupId: 10, criterionIds: [103] })).toBeNull();
    });

    it('is null for a missing group', () => {
      expect(summarize({ kind: RemovalTargetKind.RuleBox, groupId: 999, criterionIds: [101] })).toBeNull();
    });
  });
});
