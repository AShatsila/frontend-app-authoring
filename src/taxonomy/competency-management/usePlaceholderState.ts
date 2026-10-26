import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { CriteriaFocus, CriteriaPlaceholder } from './CompetencyAssociationsContext';
import type { CompetencyGroupLogicOperator, GradeRulePayload } from './data/types';

const EMPTY_PLACEHOLDER: CriteriaPlaceholder = {
  parentRuleGroupId: null,
  logicOperator: 'OR',
  rulePayload: null,
};

/** Owns the placeholder rule box/group choices and the duplicate-rejected flag; writes `focus` through `setFocus`. */
export function usePlaceholderState(setFocus: Dispatch<SetStateAction<CriteriaFocus | null>>) {
  const [placeholder, setPlaceholder] = useState<CriteriaPlaceholder>(EMPTY_PLACEHOLDER);
  const [duplicateRejected, setDuplicateRejected] = useState(false);

  // Not a `useCallback`: the provider calls it during render, on a `tagId` change.
  const resetPlaceholderState = () => {
    setPlaceholder(EMPTY_PLACEHOLDER);
    setDuplicateRejected(false);
  };

  const addPlaceholderRuleBox = useCallback((groupId: number) => {
    setFocus({ groupId, ruleKey: null });
    setPlaceholder((prev) => ({ ...prev, rulePayload: null }));
    setDuplicateRejected(false);
  }, [setFocus]);

  const addPlaceholderGroup = useCallback((parentRuleGroupId: number) => {
    setFocus({ groupId: null, ruleKey: null });
    setPlaceholder({ ...EMPTY_PLACEHOLDER, parentRuleGroupId });
    setDuplicateRejected(false);
  }, [setFocus]);

  const setPlaceholderLogicOperator = useCallback((logicOperator: CompetencyGroupLogicOperator) => {
    setPlaceholder((prev) => ({ ...prev, logicOperator }));
  }, []);

  const setPlaceholderRulePayload = useCallback((rulePayload: GradeRulePayload) => {
    setPlaceholder((prev) => ({ ...prev, rulePayload }));
    setDuplicateRejected(false);
  }, []);

  const discardPlaceholder = useCallback(() => {
    setFocus(null);
    setDuplicateRejected(false);
  }, [setFocus]);

  return {
    placeholder,
    duplicateRejected,
    setDuplicateRejected,
    resetPlaceholderState,
    addPlaceholderRuleBox,
    addPlaceholderGroup,
    setPlaceholderLogicOperator,
    setPlaceholderRulePayload,
    discardPlaceholder,
  };
}
