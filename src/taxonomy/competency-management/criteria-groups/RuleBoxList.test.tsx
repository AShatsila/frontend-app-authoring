import userEvent from '@testing-library/user-event';
import { initializeMocks, render, screen } from '@src/testUtils';
import { MockCompetencyAssociationsProvider } from '../testHelpers';
import type { CompetencyCriteriaGroupsResponse, CompetencyRuleProfile } from '../data/types';
import { buildCompetencyCriteriaGroupsIndex } from '../utils';
import RuleBoxList from './RuleBoxList';

const systemDefaultProfile: CompetencyRuleProfile = {
  id: 1,
  scopeType: 'system_default',
  ruleType: 'grade',
  rulePayload: { op: 'gte', value: 0.7, scale: 'percent' },
  archived: false,
};

// Group 10 holds two criteria sharing the default profile's rule (101, 102)
// and one with a different override (103).
const response: CompetencyCriteriaGroupsResponse = {
  groups: [
    {
      id: 10,
      parentId: null,
      tagId: 42,
      courseKey: null,
      name: 'leaf',
      ordering: 0,
      logicOperator: 'AND',
      archived: false,
    },
  ],
  criteria: [
    {
      id: 101,
      objectId: 'block-a',
      groupId: 10,
      ruleProfileId: 1,
      ruleTypeOverride: null,
      rulePayloadOverride: null,
    },
    {
      id: 102,
      objectId: 'block-b',
      groupId: 10,
      ruleProfileId: 1,
      ruleTypeOverride: null,
      rulePayloadOverride: null,
    },
    {
      id: 103,
      objectId: 'block-c',
      groupId: 10,
      ruleProfileId: null,
      ruleTypeOverride: 'grade',
      rulePayloadOverride: { op: 'lte', value: 0.9, scale: 'percent' },
    },
  ],
};

describe('<RuleBoxList />', () => {
  beforeEach(() => {
    initializeMocks();
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders two criteria sharing a rule as one box, and a different rule as a second box', () => {
    const index = buildCompetencyCriteriaGroupsIndex(response);
    render(
      <MockCompetencyAssociationsProvider>
        <RuleBoxList
          groupId={10}
          index={index}
          systemDefaultProfile={systemDefaultProfile}
          subsectionNamesByUsageKey={{
            'block-a': 'Subsection A',
            'block-b': 'Subsection B',
            'block-c': 'Subsection C',
          }}
        />
      </MockCompetencyAssociationsProvider>,
    );

    const boxes = screen.getAllByRole('button');
    expect(boxes).toHaveLength(2);
    // Box 1 (min criterion id 101) holds both Subsection A and B.
    expect(boxes[0]).toHaveTextContent('Subsection A');
    expect(boxes[0]).toHaveTextContent('Subsection B');
    expect(boxes[0]).toHaveTextContent('With a score of 70% or higher');
    // Box 2 (min criterion id 103) holds only Subsection C, with its own rule.
    expect(boxes[1]).toHaveTextContent('Subsection C');
    expect(boxes[1]).toHaveTextContent('With a score of 90% or lower');
  });

  it('marks only the box matching the context focus as focused', () => {
    const index = buildCompetencyCriteriaGroupsIndex(response);
    render(
      <MockCompetencyAssociationsProvider value={{ focus: { groupId: 10, ruleKey: 'grade:lte:0.9:percent' } }}>
        <RuleBoxList
          groupId={10}
          index={index}
          systemDefaultProfile={systemDefaultProfile}
          subsectionNamesByUsageKey={{}}
        />
      </MockCompetencyAssociationsProvider>,
    );

    const boxes = screen.getAllByRole('button');
    expect(boxes[0].className).not.toContain('rule-box--focused');
    expect(boxes[1].className).toContain('rule-box--focused');
  });

  it('renders no box as focused, without throwing, when the focused key matches none rendered', () => {
    const index = buildCompetencyCriteriaGroupsIndex(response);
    expect(() =>
      render(
        <MockCompetencyAssociationsProvider
          value={{ focus: { groupId: 10, ruleKey: 'stale-key-that-matches-nothing' } }}
        >
          <RuleBoxList
            groupId={10}
            index={index}
            systemDefaultProfile={systemDefaultProfile}
            subsectionNamesByUsageKey={{}}
          />
        </MockCompetencyAssociationsProvider>,
      )
    ).not.toThrow();

    screen.getAllByRole('button').forEach((box) => {
      expect(box.className).not.toContain('rule-box--focused');
    });
  });

  describe('placeholder rule box (#671)', () => {
    // One real box (gte 75%) - distinct from the placeholder's own initial
    // display (the system default profile's gte 70%), so typing a new value
    // that doesn't match it is a genuine change, not a same-value no-op.
    const placeholderGroupResponse: CompetencyCriteriaGroupsResponse = {
      groups: [
        {
          id: 10,
          parentId: null,
          tagId: 42,
          courseKey: null,
          name: 'leaf',
          ordering: 0,
          logicOperator: 'AND',
          archived: false,
        },
      ],
      criteria: [
        {
          id: 201,
          objectId: 'block-x',
          groupId: 10,
          ruleProfileId: null,
          ruleTypeOverride: 'grade',
          rulePayloadOverride: { op: 'gte', value: 0.75, scale: 'percent' },
        },
      ],
    };

    const renderWithPlaceholder = (
      contextOverrides: Parameters<typeof MockCompetencyAssociationsProvider>['0']['value'] = {},
    ) => {
      const index = buildCompetencyCriteriaGroupsIndex(placeholderGroupResponse);
      return render(
        <MockCompetencyAssociationsProvider value={{ focus: { groupId: 10, ruleKey: null }, ...contextOverrides }}>
          <RuleBoxList
            groupId={10}
            index={index}
            systemDefaultProfile={systemDefaultProfile}
            subsectionNamesByUsageKey={{}}
            canEdit
          />
        </MockCompetencyAssociationsProvider>,
      );
    };

    it('renders last, showing the system default\'s own rule when the author has not set a score yet', () => {
      // Read-only (`canEdit` omitted) so the percent renders as plain text,
      // not an input whose value doesn't contribute to `textContent`.
      const index = buildCompetencyCriteriaGroupsIndex(placeholderGroupResponse);
      render(
        <MockCompetencyAssociationsProvider value={{ focus: { groupId: 10, ruleKey: null } }}>
          <RuleBoxList
            groupId={10}
            index={index}
            systemDefaultProfile={systemDefaultProfile}
            subsectionNamesByUsageKey={{}}
          />
        </MockCompetencyAssociationsProvider>,
      );

      const boxes = screen.getAllByRole('button');
      expect(boxes).toHaveLength(2);
      expect(boxes[1]).toHaveTextContent('With a score of 70% or higher');
      expect(boxes[1]).toHaveTextContent('Select content below to add it here.');
    });

    it('writes a score change to setPlaceholderRulePayload, not updateRuleScore', async () => {
      const user = userEvent.setup();
      const setPlaceholderRulePayload = jest.fn();
      const updateRuleScore = jest.fn();
      renderWithPlaceholder({ setPlaceholderRulePayload, updateRuleScore });

      const inputs = screen.getAllByLabelText('Score threshold percentage');
      const placeholderInput = inputs[inputs.length - 1];
      await user.clear(placeholderInput);
      await user.type(placeholderInput, '80');
      await user.keyboard('{Enter}');

      expect(setPlaceholderRulePayload).toHaveBeenCalledWith({ op: 'gte', value: 0.8, scale: 'percent' });
      expect(updateRuleScore).not.toHaveBeenCalled();
    });

    it('refuses a score that would duplicate the real box\'s own rule, without calling setPlaceholderRulePayload', async () => {
      const user = userEvent.setup();
      const setPlaceholderRulePayload = jest.fn();
      renderWithPlaceholder({ setPlaceholderRulePayload });

      const inputs = screen.getAllByLabelText('Score threshold percentage');
      const placeholderInput = inputs[inputs.length - 1];
      await user.clear(placeholderInput);
      await user.type(placeholderInput, '75');
      await user.keyboard('{Enter}');

      expect(screen.getByText('Another rule box in this group already uses this score.')).toBeInTheDocument();
      expect(setPlaceholderRulePayload).not.toHaveBeenCalled();
    });
  });
});
