import { useEffect } from 'react';
import { initializeMocks, render, screen } from '@src/testUtils';
import { CompetencyAssociationsProvider, useCompetencyAssociations } from '../CompetencyAssociationsContext';
import { apiUrls } from '../data/api';
import CriteriaAssociationsSection from './CriteriaAssociationsSection';

let axiosMock: ReturnType<typeof initializeMocks>['axiosMock'];

const tagId = 42;
const competencyName = 'Data Literacy';

const noCourseKeys: string[] = [];

/** Stands in for `CourseSearchBrowse`, which reports its listed courses' keys once its page loads. */
const ReportCourseKeys = ({ courseKeys }: { courseKeys: string[]; }) => {
  const { notifyCoursesDisplayed } = useCompetencyAssociations();
  useEffect(() => notifyCoursesDisplayed(courseKeys), [notifyCoursesDisplayed, courseKeys]);
  return null;
};

/** Shows when the profile query has landed, so a test can tell the groups query alone is holding the list back. */
const ProfileLoadedProbe = () => {
  const { profileQuery } = useCompetencyAssociations();
  return profileQuery.isSuccess ? <span>profile loaded</span> : null;
};

/** @param reportedCourseKeys `null` leaves the keys unreported, as before the course list's first page loads. */
const renderSection = (reportedCourseKeys: string[] | null = noCourseKeys) => (
  render(
    <CompetencyAssociationsProvider tagId={tagId} competencyExternalId="CCRS-1.3">
      {reportedCourseKeys !== null && <ReportCourseKeys courseKeys={reportedCourseKeys} />}
      <ProfileLoadedProbe />
      <CriteriaAssociationsSection competencyName={competencyName} />
    </CompetencyAssociationsProvider>,
  )
);

const profileResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{
    id: 1,
    scope_type: 'system_default',
    rule_type: 'grade',
    rule_payload: { op: 'gte', value: 0.7, scale: 'percent' },
    archived: false,
  }],
};

describe('<CriteriaAssociationsSection />', () => {
  beforeEach(() => {
    ({ axiosMock } = initializeMocks());
  });

  it('renders the associations header and the "Demonstrate Mastery For" line for the given competency', () => {
    axiosMock.onGet(apiUrls.competencyCriteriaGroups(tagId)).reply(() => new Promise(() => {}));
    axiosMock.onGet(apiUrls.defaultCompetencyRuleProfile()).reply(() => new Promise(() => {}));
    renderSection();

    expect(screen.getByText('Competency Criteria Associations')).toBeInTheDocument();
    expect(screen.getByText('Demonstrate Mastery For Data Literacy')).toBeInTheDocument();
  });

  it('renders the empty-associations state once both queries resolve with no groups', async () => {
    axiosMock.onGet(apiUrls.competencyCriteriaGroups(tagId)).reply(200, { groups: [], criteria: [] });
    axiosMock.onGet(apiUrls.defaultCompetencyRuleProfile()).reply(200, profileResponse);
    renderSection();

    expect(await screen.findByText('No content associated.')).toBeInTheDocument();
  });

  it('keeps loading, sends no groups request, and shows no empty state until course keys are reported', async () => {
    axiosMock.onGet(apiUrls.competencyCriteriaGroups(tagId)).reply(200, { groups: [], criteria: [] });
    axiosMock.onGet(apiUrls.defaultCompetencyRuleProfile()).reply(200, profileResponse);
    renderSection(null);

    // Only the unreported keys hold the list back once the profile has landed.
    expect(await screen.findByText('profile loaded')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('No content associated.')).not.toBeInTheDocument();
    expect(axiosMock.history.get.filter((req) => req.url === apiUrls.competencyCriteriaGroups(tagId))).toHaveLength(0);
  });

  it('renders a failed state when the groups request fails', async () => {
    axiosMock.onGet(apiUrls.competencyCriteriaGroups(tagId)).reply(500);
    axiosMock.onGet(apiUrls.defaultCompetencyRuleProfile()).reply(200, profileResponse);
    renderSection();

    expect(await screen.findByText('There was a problem loading this competency\'s associations. Please try again.'))
      .toBeInTheDocument();
  });
});
