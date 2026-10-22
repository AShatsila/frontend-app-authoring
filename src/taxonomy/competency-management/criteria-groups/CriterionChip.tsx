import { useIntl } from '@edx/frontend-platform/i18n';
import { Chip } from '@openedx/paragon';
import { Cancel, Warning } from '@openedx/paragon/icons';

import messages from './messages';

export interface CriterionChipProps {
  /** Already resolved by the caller (`CriterionChipList`) - this component
   * never fetches or looks anything up itself.
   */
  displayName: string;
  /** The criterion's subsection couldn't be resolved: renders the warning style. */
  unavailable?: boolean;
  /** Read aloud for an unavailable chip, which `displayName` alone can't place. */
  courseName?: string;
  /** Shows the remove ("x") icon, which calls this. Omitted when the author can't edit. */
  onRemove?: () => void;
  disabled?: boolean;
}

/** One chip inside a rule box: the associated subsection's display name,
 * truncated rather than wrapping or overflowing for a long one. An
 * unavailable chip is never truncated, since its label must stay readable.
 */
const CriterionChip = ({
  displayName,
  unavailable = false,
  courseName = '',
  onRemove = undefined,
  disabled = false,
}: CriterionChipProps) => {
  const intl = useIntl();
  return (
    <Chip
      variant={unavailable ? 'light' : 'dark'}
      className={unavailable ? 'criterion-chip criterion-chip--unavailable mr-1' : 'criterion-chip mr-1'}
      iconBefore={unavailable ? Warning : undefined}
      iconAfter={onRemove ? Cancel : undefined}
      iconAfterAlt={onRemove
        ? intl.formatMessage(messages.removeCriterionButtonLabel, { subsectionName: displayName })
        : undefined}
      onIconAfterClick={onRemove}
      disabled={disabled}
    >
      {unavailable
        ? (
          <>
            <span className="sr-only">
              {intl.formatMessage(messages.unavailableCriterionAccessibleLabel, { courseName })}
            </span>
            <span aria-hidden="true">{displayName}</span>
          </>
        )
        : displayName}
    </Chip>
  );
};

export default CriterionChip;
