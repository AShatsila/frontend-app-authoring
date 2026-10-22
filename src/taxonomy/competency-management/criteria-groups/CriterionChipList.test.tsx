import { initializeMocks, render, screen, userEvent } from '@src/testUtils';
import type { CompetencyCriterion } from '@src/taxonomy/competency-management/data/types';
import { MockCompetencyAssociationsProvider } from '@src/taxonomy/competency-management/testHelpers';
import CriterionChipList from './CriterionChipList';

const renderList = (
  props: React.ComponentProps<typeof CriterionChipList>,
  contextOverrides: Parameters<typeof MockCompetencyAssociationsProvider>[0]['value'] = {},
) =>
  render(
    <MockCompetencyAssociationsProvider value={contextOverrides}>
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
      criteria,
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

  it('shows no remove button on a chip when the author can\'t edit', () => {
    renderList({ criteria: [buildCriterion()], subsectionNamesByUsageKey: { 'block-a': 'Subsection A' } });

    expect(screen.queryByRole('button', { name: 'Remove the association with Subsection A' })).not.toBeInTheDocument();
  });

  it('removes the clicked chip\'s association by its criterion id', async () => {
    const user = userEvent.setup();
    const removeAssociation = jest.fn();
    renderList(
      {
        criteria: [buildCriterion({ id: 1, objectId: 'block-a' }), buildCriterion({ id: 2, objectId: 'block-b' })],
        subsectionNamesByUsageKey: { 'block-a': 'Subsection A', 'block-b': 'Subsection B' },
        canEdit: true,
      },
      { removeAssociation },
    );

    await user.click(screen.getByRole('button', { name: 'Remove the association with Subsection B' }));

    expect(removeAssociation).toHaveBeenCalledTimes(1);
    expect(removeAssociation).toHaveBeenCalledWith(2, 'group');
  });

  it('takes the remove button out of the tab order while a delete is in flight', () => {
    renderList(
      {
        criteria: [buildCriterion()],
        subsectionNamesByUsageKey: { 'block-a': 'Subsection A' },
        canEdit: true,
      },
      { isDeleting: true },
    );

    expect(screen.getByRole('button', { name: 'Remove the association with Subsection A' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('marks only the unresolved criterion as unavailable in a mixed list', () => {
    renderList({
      criteria: [buildCriterion({ id: 1, objectId: 'block-a' }), buildCriterion({ id: 2, objectId: 'deleted-block' })],
      subsectionNamesByUsageKey: { 'block-a': 'Subsection A' },
      courseName: 'Course A',
    });

    expect(screen.getByText('Subsection A')).toBeInTheDocument();
    expect(screen.getAllByText('Content unavailable in Course A')).toHaveLength(1);
  });

  it('renders every criterion when all of them are unavailable', () => {
    renderList({
      criteria: [buildCriterion({ id: 1, objectId: 'gone-a' }), buildCriterion({ id: 2, objectId: 'gone-b' })],
      subsectionNamesByUsageKey: {},
      courseName: 'Course A',
    });

    expect(screen.getAllByText('Content unavailable in Course A')).toHaveLength(2);
  });

  it('removes an unavailable chip\'s criterion by its id', async () => {
    const user = userEvent.setup();
    const removeAssociation = jest.fn();
    renderList(
      {
        criteria: [buildCriterion({ id: 1, objectId: 'deleted-block' })],
        subsectionNamesByUsageKey: {},
        courseName: 'Course A',
        canEdit: true,
      },
      { removeAssociation },
    );

    await user.click(screen.getByRole('button', { name: 'Remove the association with Content unavailable' }));

    expect(removeAssociation).toHaveBeenCalledWith(1, 'group');
  });
});
