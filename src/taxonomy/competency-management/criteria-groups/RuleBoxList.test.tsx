import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { initializeMocks, render, screen } from '@src/testUtils';
import type { GradeRulePayload } from '../data/types';
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
    // The real box's 75% differs from the placeholder's default 70%, so typing 75 is a real change.
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
      // Read-only, so the percent is plain text rather than an input value.
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

    describe('when the displayed score is already used in the group', () => {
      const hintText = 'Another rule in this group already uses 70% or higher. Choose a different score.';

      // `response`'s group 10 already holds the 70% default (gte) and 90% (lte).
      const renderDuplicate = (
        contextOverrides: Parameters<typeof MockCompetencyAssociationsProvider>['0']['value'] = {},
        groupsResponse: CompetencyCriteriaGroupsResponse = response,
      ) => (
        render(
          <MockCompetencyAssociationsProvider value={{ focus: { groupId: 10, ruleKey: null }, ...contextOverrides }}>
            <RuleBoxList
              groupId={10}
              index={buildCompetencyCriteriaGroupsIndex(groupsResponse)}
              systemDefaultProfile={systemDefaultProfile}
              subsectionNamesByUsageKey={{}}
              canEdit
            />
          </MockCompetencyAssociationsProvider>,
        )
      );

      // Every 5% step from 70 up to 100 is taken, so no stricter score is free.
      const fullGroupResponse: CompetencyCriteriaGroupsResponse = {
        ...response,
        criteria: [70, 75, 80, 85, 90, 95, 100].map((percent, i) => ({
          id: 300 + i,
          objectId: `block-${percent}`,
          groupId: 10,
          ruleProfileId: null,
          ruleTypeOverride: 'grade',
          rulePayloadOverride: { op: 'gte' as const, value: percent / 100, scale: 'percent' as const },
        })),
      };

      it('does not pull focus back into the score input when a typed score is committed by tabbing out', async () => {
        const user = userEvent.setup();
        const Harness = () => {
          const [rulePayload, setRulePayload] = useState<GradeRulePayload | null>(null);
          return (
            <MockCompetencyAssociationsProvider
              value={{
                focus: { groupId: 10, ruleKey: null },
                placeholder: { parentRuleGroupId: null, logicOperator: 'OR', rulePayload },
                setPlaceholderRulePayload: setRulePayload,
              }}
            >
              <RuleBoxList
                groupId={10}
                index={buildCompetencyCriteriaGroupsIndex(response)}
                systemDefaultProfile={systemDefaultProfile}
                subsectionNamesByUsageKey={{}}
                canEdit
              />
            </MockCompetencyAssociationsProvider>
          );
        };
        render(<Harness />);

        const inputs = screen.getAllByLabelText('Score threshold percentage');
        await user.clear(inputs[inputs.length - 1]);
        await user.type(inputs[inputs.length - 1], '80');
        await user.tab();

        const updatedInputs = screen.getAllByLabelText('Score threshold percentage');
        expect(updatedInputs[updatedInputs.length - 1]).toHaveValue('80');
        expect(updatedInputs[updatedInputs.length - 1]).not.toHaveFocus();
      });

      it('focuses and selects the placeholder score input', () => {
        renderDuplicate();

        const inputs = screen.getAllByLabelText('Score threshold percentage') as HTMLInputElement[];
        const placeholderInput = inputs[inputs.length - 1];
        expect(placeholderInput).toHaveFocus();
        expect(placeholderInput.selectionEnd).toBe(placeholderInput.value.length);
      });

      it('shows the hint, tied to the input, with a link to the nearest unused score', () => {
        renderDuplicate();

        const inputs = screen.getAllByLabelText('Score threshold percentage');
        expect(inputs[inputs.length - 1]).toHaveAccessibleDescription(expect.stringContaining(hintText));
        expect(screen.getByRole('button', { name: 'Use 75% or higher' })).toBeInTheDocument();
      });

      it('shows no hint when the displayed score is unique', () => {
        renderWithPlaceholder();
        expect(screen.queryByText(/already uses/)).not.toBeInTheDocument();
      });

      it('applies the suggested score through the link', async () => {
        const user = userEvent.setup();
        const setPlaceholderRulePayload = jest.fn();
        renderDuplicate({ setPlaceholderRulePayload });

        await user.click(screen.getByRole('button', { name: 'Use 75% or higher' }));

        expect(setPlaceholderRulePayload).toHaveBeenCalledWith({ op: 'gte', value: 0.75, scale: 'percent' });
      });

      it('offers no link when no stricter score is free', () => {
        renderDuplicate({}, fullGroupResponse);

        expect(screen.getByText(/already uses 70% or higher/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Use / })).not.toBeInTheDocument();
      });

      it('turns the hint into an error and focuses the link after a rejected content selection', () => {
        renderDuplicate({ placeholderDuplicateRejected: true });

        const inputs = screen.getAllByLabelText('Score threshold percentage');
        expect(inputs[inputs.length - 1]).toBeInvalid();
        expect(screen.getByRole('button', { name: 'Use 75% or higher' })).toHaveFocus();
      });

      it('focuses the input after a rejected content selection when there is no link', () => {
        renderDuplicate({ placeholderDuplicateRejected: true }, fullGroupResponse);

        const inputs = screen.getAllByLabelText('Score threshold percentage');
        expect(inputs[inputs.length - 1]).toBeInvalid();
        expect(inputs[inputs.length - 1]).toHaveFocus();
      });
    });
  });
});
