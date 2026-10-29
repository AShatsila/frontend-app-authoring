import {
  initializeMocks,
  render,
  screen,
  userEvent,
} from '@src/testUtils';
import { buildMockCompetencyAssociationsContextValue, MockCompetencyAssociationsProvider } from '../testHelpers';
import type { CompetencyCriterion } from '../data/types';
import { RemovalTargetKind } from '@src/taxonomy/competency-management/constants';
import RuleBox from './RuleBox';

const criteria: CompetencyCriterion[] = [
  {
    id: 1,
    objectId: 'block-a',
    groupId: 10,
    ruleProfileId: null,
    ruleTypeOverride: 'grade',
    rulePayloadOverride: { op: 'gte', value: 0.7, scale: 'percent' },
  },
];

const rule = { ruleType: 'grade', rulePayload: { op: 'gte' as const, value: 0.7, scale: 'percent' as const } };

const render70PercentRuleBox = (
  contextOverrides: Parameters<typeof buildMockCompetencyAssociationsContextValue>[0] = {},
  props: Partial<React.ComponentProps<typeof RuleBox>> = {},
) => (
  render(
    <MockCompetencyAssociationsProvider value={contextOverrides}>
      <RuleBox
        groupId={10}
        ruleKey="grade:gte:0.7:percent"
        rule={rule}
        criteria={criteria}
        subsectionNamesByUsageKey={{ 'block-a': 'Subsection A' }}
        {...props}
      />
    </MockCompetencyAssociationsProvider>,
  )
);

describe('<RuleBox /> editing (#794)', () => {
  beforeEach(() => {
    initializeMocks();
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the score as plain text, not an input, when canEdit is omitted (default false)', () => {
    render70PercentRuleBox();

    expect(screen.getByText('With a score of 70% or higher')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it(
    'commits an edited score by calling updateRuleScore with the group id and every criterion id in the box',
    async () => {
      const user = userEvent.setup();
      const updateRuleScore = jest.fn().mockResolvedValue(undefined);
      render70PercentRuleBox({ updateRuleScore }, { canEdit: true });

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, '85');
      await user.keyboard('{Enter}');

      expect(updateRuleScore).toHaveBeenCalledWith(10, [1], { op: 'gte', value: 0.85, scale: 'percent' });
    },
  );

  it('does not call focusRuleBox when the score input itself is clicked', async () => {
    const user = userEvent.setup();
    const focusRuleBox = jest.fn();
    render70PercentRuleBox({ focusRuleBox }, { canEdit: true });

    await user.click(screen.getByRole('textbox'));

    expect(focusRuleBox).not.toHaveBeenCalled();
  });

  it('shows each chip\'s remove button only when the author can edit', () => {
    const { unmount } = render70PercentRuleBox({}, { canEdit: true });
    expect(screen.getByRole('button', { name: 'Remove the association with Subsection A' })).toBeInTheDocument();
    unmount();

    render70PercentRuleBox({}, { canEdit: false });
    expect(screen.queryByRole('button', { name: 'Remove the association with Subsection A' })).not.toBeInTheDocument();
  });

  it('requests the chip\'s removal without selecting the rule box when its remove button is clicked', async () => {
    const user = userEvent.setup();
    const focusRuleBox = jest.fn();
    const requestRemoval = jest.fn();
    render70PercentRuleBox({ focusRuleBox, requestRemoval }, { canEdit: true });

    await user.click(screen.getByRole('button', { name: 'Remove the association with Subsection A' }));

    expect(requestRemoval).toHaveBeenCalledWith({
      kind: RemovalTargetKind.Association,
      criterionId: 1,
      returnFocusTo: 'group',
    });
    expect(focusRuleBox).not.toHaveBeenCalled();
  });

  describe('rule box menu (#833)', () => {
    const savedMenuName = 'More actions for the rule with a score of 70% or higher';
    const placeholderMenuName = 'More actions for the new rule';

    it('shows a menu button named after the box\'s score only when the author can edit', () => {
      const { unmount } = render70PercentRuleBox({}, { canEdit: true });
      expect(screen.getByRole('button', { name: savedMenuName })).toBeInTheDocument();
      unmount();

      render70PercentRuleBox({}, { canEdit: false });
      expect(screen.queryByRole('button', { name: savedMenuName })).not.toBeInTheDocument();
    });

    it('requests its own removal, without selecting the box, when Remove rule is chosen', async () => {
      const user = userEvent.setup();
      const requestRemoval = jest.fn();
      const removePlaceholderRuleBox = jest.fn();
      const focusRuleBox = jest.fn();
      render70PercentRuleBox(
        { requestRemoval, removePlaceholderRuleBox, focusRuleBox },
        { canEdit: true, criteria: [...criteria, { ...criteria[0], id: 2, objectId: 'block-b' }] },
      );

      await user.click(screen.getByRole('button', { name: savedMenuName }));
      await user.click(screen.getByRole('button', { name: 'Remove rule' }));

      expect(requestRemoval).toHaveBeenCalledTimes(1);
      expect(requestRemoval).toHaveBeenCalledWith({
        kind: RemovalTargetKind.RuleBox,
        groupId: 10,
        criterionIds: [1, 2],
      });
      expect(removePlaceholderRuleBox).not.toHaveBeenCalled();
      expect(focusRuleBox).not.toHaveBeenCalled();
    });

    it('lets the placeholder rule box in a saved group discard itself without requesting a removal', async () => {
      const user = userEvent.setup();
      const requestRemoval = jest.fn();
      const removePlaceholderRuleBox = jest.fn();
      render70PercentRuleBox(
        { requestRemoval, removePlaceholderRuleBox },
        { canEdit: true, ruleKey: null, criteria: [] },
      );

      await user.click(screen.getByRole('button', { name: placeholderMenuName }));
      await user.click(screen.getByRole('button', { name: 'Remove rule' }));

      expect(removePlaceholderRuleBox).toHaveBeenCalledTimes(1);
      expect(requestRemoval).not.toHaveBeenCalled();
    });

    it.each(['{Enter}', ' '])(
      'opens from the keyboard and requests the rule\'s removal with %j',
      async (activationKey) => {
        const user = userEvent.setup();
        const requestRemoval = jest.fn();
        render70PercentRuleBox({ requestRemoval }, { canEdit: true });

        await user.tab();
        expect(screen.getByRole('button', { name: 'Select this rule' })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('textbox')).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('button', { name: savedMenuName })).toHaveFocus();
        await user.keyboard('{Enter}');
        await user.keyboard('{ArrowDown}');
        expect(screen.getByRole('button', { name: 'Remove rule' })).toHaveFocus();
        await user.keyboard(activationKey);

        expect(requestRemoval).toHaveBeenCalledWith({
          kind: RemovalTargetKind.RuleBox,
          groupId: 10,
          criterionIds: [1],
        });
      },
    );
  });
});
