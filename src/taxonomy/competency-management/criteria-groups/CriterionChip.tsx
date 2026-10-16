import { Chip } from '@openedx/paragon';
import { Close } from '@openedx/paragon/icons';

export interface CriterionChipProps {
  /** Already resolved by the caller (`CriterionChipList`) - this component
   * never fetches or looks anything up itself.
   */
  displayName: string;
  // SPIKE: shape not final
  /** When set, the chip shows a remove ("x") affordance that calls it. */
  onRemove?: () => void;
}

/** One chip inside a rule box: the associated subsection's display name,
 * truncated rather than wrapping or overflowing for a long one. No remove
 * ("x") affordance: deleting an association is out of scope here.
 */
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
