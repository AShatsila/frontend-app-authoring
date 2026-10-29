import { useCallback, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { useQueryClient } from '@tanstack/react-query';

import type { CourseOutline } from '@src/course-outline/data';
// Bypasses the public barrel for the same reason the provider does: this is
// the key its outline fetches are cached under.
import { courseOutlineQueryKeys } from '@src/course-outline/data/queryKeys';
import { useToastContext } from '@src/generic/toast-context';

import type { PendingRemoval } from './CompetencyAssociationsContext';
import { RemovalTargetKind } from './constants';
import { competencyQueryKeys } from './data/apiHooks';
import type { CompetencyCriteriaGroupsResponse, CompetencyRuleProfile } from './data/types';
import messages from './messages';
import type { CompetencyCriteriaGroupsIndex, RemovalTarget } from './utils';
import {
  buildCompetencyCriteriaGroupsIndex,
  subsectionNamesFromOutline,
  summarizeRemoval,
} from './utils';

interface UseRemovalConfirmationArgs {
  tagId: number;
  index: CompetencyCriteriaGroupsIndex | undefined;
  systemDefaultProfile: CompetencyRuleProfile | undefined;
  /** The courses whose cached outlines name the dialog's courses and subsections. */
  courseIdsWithGroups: string[];
  /** Kept in the provider, whose `tagId` reset clears it during render, before the delete callbacks below exist. */
  pendingRemoval: PendingRemoval | null;
  setPendingRemoval: Dispatch<SetStateAction<PendingRemoval | null>>;
  isDeleteInFlightRef: MutableRefObject<boolean>;
  removeAssociation: (criterionId: number, returnFocusTo: 'group' | 'subsection') => Promise<void>;
  deleteRuleBox: (groupId: number, criterionIds: number[]) => Promise<void>;
  deleteGroup: (groupId: number) => Promise<void>;
}

/** Owns the removal confirmation flow (`#786`): opening it, running the delete it names, and reporting a failure. */
export function useRemovalConfirmation({
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
}: UseRemovalConfirmationArgs) {
  const intl = useIntl();
  const { showToast } = useToastContext();
  const queryClient = useQueryClient();

  // Read once the delete settles, to see a cancel made while it ran.
  const pendingRemovalRef = useRef(pendingRemoval);
  pendingRemovalRef.current = pendingRemoval;

  // Reuses the outline fetches that decide which courses are accessible.
  const outlineNames = useCallback(() => {
    const courseNamesByKey = new Map<string, string>();
    let subsectionNamesByUsageKey: Record<string, string> = {};
    courseIdsWithGroups.forEach((courseId) => {
      const outline = queryClient.getQueryData<CourseOutline>(courseOutlineQueryKeys.index(courseId));
      if (outline) {
        courseNamesByKey.set(courseId, outline.courseStructure.displayName);
        subsectionNamesByUsageKey = {
          ...subsectionNamesByUsageKey,
          ...subsectionNamesFromOutline(outline.courseStructure),
        };
      }
    });
    return { courseNamesByKey, subsectionNamesByUsageKey };
  }, [courseIdsWithGroups, queryClient]);

  const requestRemoval = useCallback((target: RemovalTarget) => {
    if (isDeleteInFlightRef.current || !index || !systemDefaultProfile) {
      return;
    }
    const { courseNamesByKey, subsectionNamesByUsageKey } = outlineNames();
    const summary = summarizeRemoval(target, index, systemDefaultProfile, courseNamesByKey, subsectionNamesByUsageKey);
    if (summary) {
      setPendingRemoval({ target, summary, failure: null });
    }
  }, [isDeleteInFlightRef, index, systemDefaultProfile, outlineNames, setPendingRemoval]);

  const cancelRemoval = useCallback(() => setPendingRemoval(null), [setPendingRemoval]);

  const confirmRemoval = useCallback(async () => {
    const pending = pendingRemovalRef.current;
    if (!pending || isDeleteInFlightRef.current) {
      return;
    }
    const { target } = pending;
    setPendingRemoval({ ...pending, failure: null });
    try {
      switch (target.kind) {
        case RemovalTargetKind.Association:
          await removeAssociation(target.criterionId, target.returnFocusTo);
          break;
        case RemovalTargetKind.RuleBox:
          await deleteRuleBox(target.groupId, target.criterionIds);
          break;
        case RemovalTargetKind.RuleGroup:
        case RemovalTargetKind.CourseGroup:
          await deleteGroup(target.groupId);
          break;
      }
      setPendingRemoval(null);
    } catch {
      if (pendingRemovalRef.current === null) {
        // Cancelled while the request ran, so there is no dialog left to report the failure in.
        showToast(intl.formatMessage(messages.removalFailedAfterCancelToastMessage));
        return;
      }
      // The refetch has landed, so the summary is rebuilt from it: a retry then describes what is left.
      const freshData = queryClient.getQueryData<CompetencyCriteriaGroupsResponse>(
        competencyQueryKeys.competencyCriteriaGroups(tagId),
      );
      const { courseNamesByKey, subsectionNamesByUsageKey } = outlineNames();
      const freshSummary = freshData && systemDefaultProfile
        ? summarizeRemoval(
          target,
          buildCompetencyCriteriaGroupsIndex(freshData),
          systemDefaultProfile,
          courseNamesByKey,
          subsectionNamesByUsageKey,
        )
        : null;
      if (freshData && systemDefaultProfile && freshSummary === null) {
        // The target is gone from the refetched data, which is the outcome the author asked for.
        setPendingRemoval(null);
        return;
      }
      // A retry sends only what is left of a rule box.
      const remainingIds = target.kind === RemovalTargetKind.RuleBox && freshData
        ? freshData.criteria
          .filter((criterion) => criterion.groupId === target.groupId && target.criterionIds.includes(criterion.id))
          .map((criterion) => criterion.id)
        : null;
      const isPartlyRemoved = target.kind === RemovalTargetKind.RuleBox && remainingIds !== null
        && remainingIds.length < target.criterionIds.length;
      setPendingRemoval((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          target: target.kind === RemovalTargetKind.RuleBox && remainingIds
            ? { ...target, criterionIds: remainingIds }
            : prev.target,
          summary: freshSummary ?? prev.summary,
          failure: isPartlyRemoved ? 'partly-removed' : 'nothing-removed',
        };
      });
    }
  }, [
    isDeleteInFlightRef,
    setPendingRemoval,
    removeAssociation,
    deleteRuleBox,
    deleteGroup,
    queryClient,
    tagId,
    systemDefaultProfile,
    outlineNames,
    showToast,
    intl,
  ]);

  return { requestRemoval, confirmRemoval, cancelRemoval };
}
