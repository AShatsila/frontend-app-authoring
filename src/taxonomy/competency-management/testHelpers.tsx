import type MockAdapter from 'axios-mock-adapter';
import type { ReactNode } from 'react';
import {
  CompetencyAssociationsContext,
  type CompetencyAssociationsContextValue,
} from './CompetencyAssociationsContext';
import { apiUrls } from './data/api';
import type { CompetencyCriteriaGroupsResponse } from './data/types';

/** Builds a full `CompetencyAssociationsContextValue`, overriding only the
 * fields a given test cares about. Used by component tests below
 * `CompetencyAssociationsProvider` that want to control selection/data state
 * directly, without mocking every HTTP request the real provider would
 * otherwise issue - the provider's own data-fetching and selection mechanics
 * get their own dedicated coverage in `CompetencyAssociationsContext.test.tsx`.
 */
export const buildMockCompetencyAssociationsContextValue = (
  overrides: Partial<CompetencyAssociationsContextValue> = {},
): CompetencyAssociationsContextValue => ({
  selection: null,
  placeholder: { parentRuleGroupId: null, logicOperator: 'OR', rulePayload: null },
  addPlaceholderRuleBox: jest.fn(),
  addPlaceholderGroup: jest.fn(),
  setPlaceholderLogicOperator: jest.fn(),
  setPlaceholderRulePayload: jest.fn(),
  discardPlaceholder: jest.fn(),
  hasPlaceholder: false,
  placeholderDuplicateRejected: false,
  selectGroup: jest.fn(),
  selectRuleBox: jest.fn(),
  notifyCourseExpanded: jest.fn(),
  associateSubsection: jest.fn(),
  updateGroupOperator: jest.fn(),
  isDeleting: false,
  pendingRemoval: null,
  requestRemoval: jest.fn(),
  confirmRemoval: jest.fn().mockResolvedValue(undefined),
  cancelRemoval: jest.fn(),
  removePlaceholderGroup: jest.fn(),
  removePlaceholderRuleBox: jest.fn(),
  keyboardFocusRequest: null,
  consumeKeyboardFocusRequest: jest.fn(),
  updateRuleScore: jest.fn().mockResolvedValue(undefined),
  canEditCourse: () => true,
  groupsQuery: {
    isLoading: false,
    isError: false,
    isSuccess: true,
    data: { groups: [], criteria: [] },
  } as unknown as CompetencyAssociationsContextValue['groupsQuery'],
  profileQuery: {
    isLoading: false,
    isError: false,
    isSuccess: true,
    data: undefined,
  } as unknown as CompetencyAssociationsContextValue['profileQuery'],
  index: undefined,
  systemDefaultProfile: undefined,
  associatedObjectIds: new Set(),
  accessibleCourseGroups: [],
  areCourseOutlinesLoading: false,
  competencyExternalId: null,
  competencyName: 'Test Competency',
  ...overrides,
});

export interface MockCompetencyAssociationsProviderProps {
  value?: Partial<CompetencyAssociationsContextValue>;
  children: ReactNode;
}

/** A lightly-mocked stand-in for `CompetencyAssociationsProvider` - renders
 * the raw context directly with a hand-built value, instead of the real
 * provider's own data-fetching.
 */
export const MockCompetencyAssociationsProvider = ({ value, children }: MockCompetencyAssociationsProviderProps) => (
  <CompetencyAssociationsContext.Provider value={buildMockCompetencyAssociationsContextValue(value)}>
    {children}
  </CompetencyAssociationsContext.Provider>
);

/** Answers the first GET of `tagId`'s criteria groups with `initial`, then holds every later one until `release`
 * answers it with `refetched`. Replaces a reply already registered for that URL, such as a `beforeEach` default.
 */
export const mockHeldGroupsRefetch = (
  axiosMock: MockAdapter,
  tagId: number,
  initial: CompetencyCriteriaGroupsResponse,
  refetched: CompetencyCriteriaGroupsResponse,
) => {
  const control = { release: () => {} };
  let reads = 0;
  axiosMock.onGet(apiUrls.competencyCriteriaGroups(tagId)).reply(() => {
    reads += 1;
    return reads === 1
      ? [200, initial]
      : new Promise((resolve) => {
        control.release = () => resolve([200, refetched]);
      });
  });
  return control;
};
