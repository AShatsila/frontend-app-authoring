import { useIntl } from '@edx/frontend-platform/i18n';
import { Chip } from '@openedx/paragon';
import { Cancel } from '@openedx/paragon/icons';

import messages from './messages';

export interface CriterionChipProps {
  /** Already resolved by the caller (`CriterionChipList`) - this component
   * never fetches or looks anything up itself.
   */
  displayName: string;
  /** Shows the remove ("x") icon, which calls this. Omitted when the author can't edit. */
  onRemove?: () => void;
  disabled?: boolean;
}

/** One chip inside a rule box: the associated subsection's display name,
 * truncated rather than wrapping or overflowing for a long one.
 */
const CriterionChip = ({ displayName, onRemove = undefined, disabled = false }: CriterionChipProps) => {
  const intl = useIntl();
  return (
    <Chip
      variant="dark"
      className="criterion-chip mr-1"
      iconAfter={onRemove ? Cancel : undefined}
      iconAfterAlt={onRemove
        ? intl.formatMessage(messages.removeCriterionButtonLabel, { subsectionName: displayName })
        : undefined}
      onIconAfterClick={onRemove}
      disabled={disabled}
    >
      {displayName}
    </Chip>
  );
};

export default CriterionChip;
