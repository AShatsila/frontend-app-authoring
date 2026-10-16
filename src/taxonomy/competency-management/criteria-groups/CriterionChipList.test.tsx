import { initializeMocks, render, screen } from '@src/testUtils';
import type { CompetencyCriterion } from '../data/types';
import { MockCompetencyAssociationsProvider } from '../testHelpers';
import CriterionChipList from './CriterionChipList';

const renderList = (props: React.ComponentProps<typeof CriterionChipList>) =>
  render(
    <MockCompetencyAssociationsProvider>
      <CriterionChipList {...props} />
    </MockCompetencyAssociationsProvider>,
  );

const buildCriterion = (overrides: Partial<CompetencyCriterion> = {}): CompetencyCriterion => ({
  id: 1,
  objectId: 'block-a',
  groupId: 10,
  ruleProfileId: 1,
  ruleTypeOverride: null,
  rulePayloadOverride: null,
  ...overrides,
});

describe('<CriterionChipList />', () => {
  beforeEach(() => {
    initializeMocks();
  });

  it('renders one chip per criterion, using the resolved subsection name', () => {
    const criteria = [
      buildCriterion({ id: 1, objectId: 'block-a' }),
      buildCriterion({ id: 2, objectId: 'block-b' }),
    ];
    renderList({
      criteria: criteria,
      subsectionNamesByUsageKey: { 'block-a': 'Subsection A', 'block-b': 'Subsection B' },
    });

    expect(screen.getByText('Subsection A')).toBeInTheDocument();
    expect(screen.getByText('Subsection B')).toBeInTheDocument();
  });

  it('falls back to a neutral label when a criterion\'s objectId isn\'t in the resolved names', () => {
    renderList({
      criteria: [buildCriterion({ id: 1, objectId: 'deleted-block' })],
      subsectionNamesByUsageKey: {},
    });

    expect(screen.getByText('Content unavailable')).toBeInTheDocument();
  });

  it('renders nothing for an empty criteria list', () => {
    const { container } = renderList({ criteria: [], subsectionNamesByUsageKey: {} });
    // `container` isn't empty outright - the test harness's own provider
    // wrappers still render - so check no chip list markup was produced.
    expect(container.querySelector('.criterion-chip-list')).not.toBeInTheDocument();
  });
});
