import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { CriteriaSelection, CriteriaPlaceholder } from './CompetencyAssociationsContext';
import type { CompetencyGroupLogicOperator, GradeRulePayload } from './data/types';

const EMPTY_PLACEHOLDER: CriteriaPlaceholder = {
  parentRuleGroupId: null,
  logicOperator: 'OR',
  rulePayload: null,
};

/** Owns the placeholder rule box/group choices and the duplicate-rejected flag; writes `selection` through `setSelection`. */
export function usePlaceholderState(setSelection: Dispatch<SetStateAction<CriteriaSelection | null>>) {
  const [placeholder, setPlaceholder] = useState<CriteriaPlaceholder>(EMPTY_PLACEHOLDER);
  const [duplicateRejected, setDuplicateRejected] = useState(false);

  // Not a `useCallback`: the provider calls it during render, on a `tagId` change.
  const resetPlaceholderState = () => {
    setPlaceholder(EMPTY_PLACEHOLDER);
    setDuplicateRejected(false);
  };

  const addPlaceholderRuleBox = useCallback((groupId: number) => {
    setSelection({ groupId, ruleKey: null });
    setPlaceholder((prev) => ({ ...prev, rulePayload: null }));
    setDuplicateRejected(false);
  }, [setSelection]);

  const addPlaceholderGroup = useCallback((parentRuleGroupId: number) => {
    setSelection({ groupId: null, ruleKey: null });
    setPlaceholder({ ...EMPTY_PLACEHOLDER, parentRuleGroupId });
    setDuplicateRejected(false);
  }, [setSelection]);

  const setPlaceholderLogicOperator = useCallback((logicOperator: CompetencyGroupLogicOperator) => {
    setPlaceholder((prev) => ({ ...prev, logicOperator }));
  }, []);

  const setPlaceholderRulePayload = useCallback((rulePayload: GradeRulePayload) => {
    setPlaceholder((prev) => ({ ...prev, rulePayload }));
    setDuplicateRejected(false);
  }, []);

  const discardPlaceholder = useCallback(() => {
    setSelection(null);
    setDuplicateRejected(false);
  }, [setSelection]);

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
