import { Chip } from '@openedx/paragon';
import { Close } from '@openedx/paragon/icons';

export interface CriterionChipProps {
  displayName: string;
  // SPIKE: shape not final
  /** When set, the chip shows a remove ("x") affordance that calls it. */
  onRemove?: () => void;
}

const CriterionChip = ({ displayName, onRemove = undefined }: CriterionChipProps) => (
  <Chip
    variant="dark"
    className="criterion-chip mr-1"
    iconAfter={onRemove ? Close : undefined}
    iconAfterAlt={onRemove ? `Remove ${displayName}` : undefined}
    onIconAfterClick={onRemove}
  >
    {displayName}
  </Chip>
);

export default CriterionChip;
