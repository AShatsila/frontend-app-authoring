import * as api from './api';
import * as taxonomyApi from '../../taxonomy/data/api';
import { languageExportId } from '../utils';

/**
 * Mock for `getContentTaxonomyTagsData()`
 */
export async function mockContentTaxonomyTagsData(contentId: string): Promise<any> {
  const thisMock = mockContentTaxonomyTagsData;
  switch (contentId) {
    case thisMock.stagedTagsId:
      return thisMock.stagedTags;
    case thisMock.otherTagsId:
      return thisMock.otherTags;
    case thisMock.editableOtherTagsId:
      return thisMock.editableOtherTags;
    case thisMock.languageWithTagsId:
      return thisMock.languageWithTags;
    case thisMock.languageWithoutTagsId:
      return thisMock.languageWithoutTags;
    case thisMock.largeTagsId:
      return thisMock.largeTags;
    case thisMock.containerTagsId:
      return thisMock.largeTags;
    case thisMock.emptyTagsId:
      return thisMock.emptyTags;
    case thisMock.veryLongTagsId:
      return thisMock.veryLongTags;
    case thisMock.competencyTagsId:
      return thisMock.competencyTags;
    case thisMock.competencyOtherTagsId:
      return thisMock.competencyOtherTags;
    case thisMock.twoCompetencyTagsId:
      return thisMock.twoCompetencyTags;
    case thisMock.untypedCompetencyTagsId:
      return thisMock.untypedCompetencyTags;
    case thisMock.listUntypedCompetencyTagsId:
      return thisMock.listUntypedCompetencyTags;
    case thisMock.conflictingTypeCompetencyTagsId:
      return thisMock.conflictingTypeCompetencyTags;
    case thisMock.nestedCompetencyTagsId:
      return thisMock.nestedCompetencyTags;
    case thisMock.untaggableCompetencyTagsId:
      return thisMock.untaggableCompetencyTags;
    default:
      throw new Error(`No mock has been set up for contentId "${contentId}"`);
  }
}
mockContentTaxonomyTagsData.stagedTagsId = 'block-v1:StagedTagsOrg+STC1+2023_1+type@vertical+block@stagedTagsId';
mockContentTaxonomyTagsData.stagedTags = {
  taxonomies: [
    {
      name: 'Taxonomy 1',
      taxonomyId: 123,
      canTagObject: true,
      tags: [
        {
          value: 'Tag 1',
          lineage: ['Tag 1'],
          canDeleteObjecttag: true,
        },
        {
          value: 'Tag 2',
          lineage: ['Tag 2'],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};
mockContentTaxonomyTagsData.otherTagsId = 'block-v1:StagedTagsOrg+STC1+2023_1+type@vertical+block@otherTagsId';
mockContentTaxonomyTagsData.otherTags = {
  taxonomies: [
    {
      name: 'Taxonomy 1',
      taxonomyId: 123,
      canTagObject: true,
      tags: [
        {
          value: 'Tag 1',
          lineage: ['Tag 1'],
          canDeleteObjecttag: true,
        },
        {
          value: 'Tag 2',
          lineage: ['Tag 2'],
          canDeleteObjecttag: true,
        },
      ],
    },
    {
      name: 'Taxonomy 2',
      taxonomyId: 1234,
      canTagObject: false,
      tags: [
        {
          value: 'Tag 3',
          lineage: ['Tag 3'],
          canDeleteObjecttag: true,
        },
        {
          value: 'Tag 4',
          lineage: ['Tag 4'],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};
mockContentTaxonomyTagsData.editableOtherTagsId =
  'block-v1:StagedTagsOrg+STC1+2023_1+type@vertical+block@editableOtherTagsId';
// Same shape as `otherTags`, but the "other" taxonomy is taggable, so its
// "Add a tag" select is available and tags can be staged onto it.
mockContentTaxonomyTagsData.editableOtherTags = {
  taxonomies: [
    {
      name: 'Taxonomy 1',
      taxonomyId: 123,
      canTagObject: true,
      tags: [
        {
          value: 'Tag 2',
          lineage: ['Tag 2'],
          canDeleteObjecttag: true,
        },
      ],
    },
    {
      // Not present in `mockTaxonomyListData.stagedTags`, so it is rendered
      // under the "Other tags" section.
      name: 'Taxonomy 2',
      taxonomyId: 1234,
      canTagObject: true,
      tags: [
        {
          value: 'Tag 3',
          lineage: ['Tag 3'],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};
mockContentTaxonomyTagsData.languageWithTagsId =
  'block-v1:LanguageTagsOrg+STC1+2023_1+type@vertical+block@languageWithTagsId';
mockContentTaxonomyTagsData.languageWithTags = {
  taxonomies: [
    {
      name: 'Languages',
      taxonomyId: 1234,
      exportId: languageExportId,
      canTagObject: true,
      tags: [
        {
          value: 'Tag 1',
          lineage: ['Tag 1'],
          canDeleteObjecttag: true,
        },
      ],
    },
    {
      name: 'Taxonomy 1',
      taxonomyId: 12345,
      canTagObject: true,
      tags: [
        {
          value: 'Tag 1',
          lineage: ['Tag 1'],
          canDeleteObjecttag: true,
        },
        {
          value: 'Tag 2',
          lineage: ['Tag 2'],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};
mockContentTaxonomyTagsData.languageWithoutTagsId =
  'block-v1:LanguageTagsOrg+STC1+2023_1+type@vertical+block@languageWithoutTagsId';
mockContentTaxonomyTagsData.languageWithoutTags = {
  taxonomies: [
    {
      name: 'Languages',
      taxonomyId: 1234,
      exportId: languageExportId,
      canTagObject: true,
      tags: [],
    },
    {
      name: 'Taxonomy 1',
      taxonomyId: 12345,
      canTagObject: true,
      tags: [
        {
          value: 'Tag 1',
          lineage: ['Tag 1'],
          canDeleteObjecttag: true,
        },
        {
          value: 'Tag 2',
          lineage: ['Tag 2'],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};
mockContentTaxonomyTagsData.largeTagsId = 'block-v1:LargeTagsOrg+STC1+2023_1+type@vertical+block@largeTagsId';
mockContentTaxonomyTagsData.largeTags = {
  taxonomies: [
    {
      name: 'Taxonomy 1',
      taxonomyId: 123,
      canTagObject: true,
      tags: [
        {
          value: 'Tag 1',
          lineage: ['Tag 1'],
          canDeleteObjecttag: true,
        },
        {
          value: 'Tag 2',
          lineage: ['Tag 2'],
          canDeleteObjecttag: true,
        },
      ],
    },
    {
      name: 'Taxonomy 2',
      taxonomyId: 124,
      canTagObject: true,
      tags: [
        {
          value: 'Tag 1',
          lineage: ['Tag 1'],
          canDeleteObjecttag: true,
        },
      ],
    },
    {
      name: 'Taxonomy 3',
      taxonomyId: 125,
      canTagObject: true,
      tags: [
        {
          value: 'Tag 1.1.1',
          lineage: ['Tag 1', 'Tag 1.1', 'Tag 1.1.1'],
          canDeleteObjecttag: true,
        },
      ],
    },
    {
      name: '(B) Taxonomy 4',
      taxonomyId: 126,
      canTagObject: true,
      tags: [],
    },
    {
      name: '(A) Taxonomy 5',
      taxonomyId: 127,
      canTagObject: true,
      tags: [],
    },
  ],
};
mockContentTaxonomyTagsData.emptyTagsId = 'block-v1:EmptyTagsOrg+STC1+2023_1+type@vertical+block@emptyTagsId';
mockContentTaxonomyTagsData.emptyTags = {
  taxonomies: [],
};
mockContentTaxonomyTagsData.veryLongTagsId = 'block-v1:VeryLongTagsOrg+STC1+2023_1+type@vertical+block@veryLongTagsId';
mockContentTaxonomyTagsData.veryLongTags = {
  taxonomies: [
    {
      name: 'ESDC Skills and Competencies',
      taxonomyId: 1,
      canTagObject: true,
      tags: [
        {
          value: 'Technical Skills',
          lineage: [
            'Skills',
            'Technical Skills Sub-Category',
            'Technical Skills',
          ],
          canDeleteObjecttag: true,
        },
        {
          value: 'Communication Abilities',
          lineage: [
            'Abilities',
            'Cognitive Abilities',
            'Communication Abilities',
          ],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};

mockContentTaxonomyTagsData.competencyTagsId =
  'block-v1:CompetencyTagsOrg+STC1+2023_1+type@vertical+block@competencyTagsId';
mockContentTaxonomyTagsData.competencyTags = {
  taxonomies: [
    {
      name: 'Taxonomy 1',
      taxonomyId: 123,
      canTagObject: true,
      taxonomyType: 'tags',
      tags: [
        {
          value: 'Tag 1',
          lineage: ['Tag 1'],
          canDeleteObjecttag: true,
        },
      ],
    },
    {
      name: 'Critical Thinking',
      taxonomyId: 321,
      canTagObject: true,
      taxonomyType: 'competency',
      tags: [
        {
          value: 'Inference',
          lineage: ['Inference'],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};
mockContentTaxonomyTagsData.competencyOtherTagsId =
  'block-v1:CompetencyTagsOrg+STC1+2023_1+type@vertical+block@competencyOtherTagsId';
// Taxonomy 322 is deliberately absent from `mockTaxonomyListData.competencyTags`.
mockContentTaxonomyTagsData.competencyOtherTags = {
  taxonomies: [
    {
      name: 'Nursing Competencies',
      taxonomyId: 322,
      canTagObject: false,
      taxonomyType: 'competency',
      tags: [
        {
          value: 'Triage',
          lineage: ['Triage'],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};
mockContentTaxonomyTagsData.twoCompetencyTagsId =
  'block-v1:OnlyCompetencyOrg+STC1+2023_1+type@vertical+block@twoCompetencyTagsId';
mockContentTaxonomyTagsData.twoCompetencyTags = {
  taxonomies: [
    {
      name: 'Critical Thinking',
      taxonomyId: 321,
      canTagObject: true,
      taxonomyType: 'competency',
      tags: [
        {
          value: 'Inference',
          lineage: ['Inference'],
          canDeleteObjecttag: true,
        },
      ],
    },
    {
      name: 'Problem Solving',
      taxonomyId: 324,
      canTagObject: true,
      taxonomyType: 'competency',
      tags: [
        {
          value: 'Decomposition',
          lineage: ['Decomposition'],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};
mockContentTaxonomyTagsData.untypedCompetencyTagsId =
  'block-v1:CompetencyTagsOrg+STC1+2023_1+type@vertical+block@untypedCompetencyTagsId';
// No `taxonomyType`, as on backends that predate #783.
mockContentTaxonomyTagsData.untypedCompetencyTags = {
  taxonomies: [
    {
      name: 'Critical Thinking',
      taxonomyId: 321,
      canTagObject: true,
      tags: [
        {
          value: 'Inference',
          lineage: ['Inference'],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};
mockContentTaxonomyTagsData.listUntypedCompetencyTagsId =
  'block-v1:ListUntypedOrg+STC1+2023_1+type@vertical+block@listUntypedCompetencyTagsId';
// Only this payload says `competency`; the taxonomy list entry for 321 has no `taxonomyType`.
mockContentTaxonomyTagsData.listUntypedCompetencyTags = {
  taxonomies: [
    {
      name: 'Critical Thinking',
      taxonomyId: 321,
      canTagObject: true,
      taxonomyType: 'competency',
      tags: [
        {
          value: 'Inference',
          lineage: ['Inference'],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};
mockContentTaxonomyTagsData.conflictingTypeCompetencyTagsId =
  'block-v1:ConflictingTypeOrg+STC1+2023_1+type@vertical+block@conflictingTypeCompetencyTagsId';
// The taxonomy list types 321 as `tags`, while this payload says `competency`.
mockContentTaxonomyTagsData.conflictingTypeCompetencyTags = {
  taxonomies: [
    {
      name: 'Critical Thinking',
      taxonomyId: 321,
      canTagObject: true,
      taxonomyType: 'competency',
      tags: [
        {
          value: 'Inference',
          lineage: ['Inference'],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};
mockContentTaxonomyTagsData.untaggableCompetencyTagsId =
  'block-v1:UntaggableCompetencyOrg+STC1+2023_1+type@vertical+block@untaggableCompetencyTagsId';
// The taxonomy list entry for 321 has `canTagObject: false`.
mockContentTaxonomyTagsData.untaggableCompetencyTags = {
  taxonomies: [
    {
      name: 'Critical Thinking',
      taxonomyId: 321,
      canTagObject: false,
      taxonomyType: 'competency',
      tags: [
        {
          value: 'Inference',
          lineage: ['Inference'],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};
mockContentTaxonomyTagsData.nestedCompetencyTagsId =
  'block-v1:CompetencyTagsOrg+STC1+2023_1+type@vertical+block@nestedCompetencyTagsId';
// One explicit tag with a three-level lineage, so the tree renders three nodes.
mockContentTaxonomyTagsData.nestedCompetencyTags = {
  taxonomies: [
    {
      name: 'Critical Thinking',
      taxonomyId: 321,
      canTagObject: true,
      taxonomyType: 'competency',
      tags: [
        {
          value: 'Deduction',
          lineage: ['Reasoning', 'Logic', 'Deduction'],
          canDeleteObjecttag: true,
        },
      ],
    },
  ],
};
mockContentTaxonomyTagsData.containerTagsId = 'lct:StagedTagsOrg:lib:unit:container_tags';
mockContentTaxonomyTagsData.applyMock = () =>
  jest.spyOn(api, 'getContentTaxonomyTagsData').mockImplementation(mockContentTaxonomyTagsData);

/**
 * Mock for `getTaxonomyListData()`
 */
export async function mockTaxonomyListData(org: string): Promise<any> {
  const thisMock = mockTaxonomyListData;
  switch (org) {
    case thisMock.stagedTagsOrg:
      return thisMock.stagedTags;
    case thisMock.languageTagsOrg:
      return thisMock.languageTags;
    case thisMock.largeTagsOrg:
      return thisMock.largeTags;
    case thisMock.emptyTagsOrg:
      return thisMock.emptyTags;
    case thisMock.competencyTagsOrg:
      return thisMock.competencyTags;
    case thisMock.onlyCompetencyOrg:
      return thisMock.onlyCompetency;
    case thisMock.listUntypedOrg:
      return thisMock.listUntyped;
    case thisMock.conflictingTypeOrg:
      return thisMock.conflictingType;
    case thisMock.untaggableCompetencyOrg:
      return thisMock.untaggableCompetency;
    default:
      throw new Error(`No mock has been set up for org "${org}"`);
  }
}
mockTaxonomyListData.stagedTagsOrg = 'StagedTagsOrg';
mockTaxonomyListData.stagedTags = {
  results: [
    {
      id: 123,
      name: 'Taxonomy 1',
      description: 'This is a description 1',
      canTagObject: true,
    },
  ],
};
mockTaxonomyListData.languageTagsOrg = 'LanguageTagsOrg';
mockTaxonomyListData.languageTags = {
  results: [
    {
      id: 1234,
      name: 'Languages',
      description: 'This is a description 1',
      exportId: languageExportId,
      canTagObject: true,
    },
    {
      id: 12345,
      name: 'Taxonomy 1',
      description: 'This is a description 2',
      canTagObject: true,
    },
  ],
};
mockTaxonomyListData.largeTagsOrg = 'LargeTagsOrg';
mockTaxonomyListData.largeTags = {
  results: [
    {
      id: 123,
      name: 'Taxonomy 1',
      description: 'This is a description 1',
      canTagObject: true,
    },
    {
      id: 124,
      name: 'Taxonomy 2',
      description: 'This is a description 2',
      canTagObject: true,
    },
    {
      id: 125,
      name: 'Taxonomy 3',
      description: 'This is a description 3',
      canTagObject: true,
    },
    {
      id: 127,
      name: '(A) Taxonomy 5',
      description: 'This is a description 5',
      canTagObject: true,
    },
    {
      id: 126,
      name: '(B) Taxonomy 4',
      description: 'This is a description 4',
      canTagObject: true,
    },
  ],
};
mockTaxonomyListData.emptyTagsOrg = 'EmptyTagsOrg';
mockTaxonomyListData.emptyTags = {
  results: [],
};
mockTaxonomyListData.competencyTagsOrg = 'CompetencyTagsOrg';
mockTaxonomyListData.competencyTags = {
  results: [
    {
      id: 123,
      name: 'Taxonomy 1',
      description: 'This is a description',
      canTagObject: true,
      taxonomyType: 'tags',
    },
    {
      id: 321,
      name: 'Critical Thinking',
      description: 'This is a description',
      canTagObject: true,
      taxonomyType: 'competency',
    },
    {
      id: 323,
      name: 'Empty Competencies',
      description: 'This is a description',
      canTagObject: true,
      taxonomyType: 'competency',
    },
  ],
};
mockTaxonomyListData.onlyCompetencyOrg = 'OnlyCompetencyOrg';
mockTaxonomyListData.onlyCompetency = {
  results: [
    {
      id: 321,
      name: 'Critical Thinking',
      description: 'This is a description',
      canTagObject: true,
      taxonomyType: 'competency',
    },
    {
      id: 324,
      name: 'Problem Solving',
      description: 'This is a description',
      canTagObject: true,
      taxonomyType: 'competency',
    },
  ],
};
mockTaxonomyListData.listUntypedOrg = 'ListUntypedOrg';
mockTaxonomyListData.listUntyped = {
  results: [
    {
      id: 321,
      name: 'Critical Thinking',
      description: 'This is a description',
      canTagObject: true,
    },
  ],
};
mockTaxonomyListData.conflictingTypeOrg = 'ConflictingTypeOrg';
mockTaxonomyListData.conflictingType = {
  results: [
    {
      id: 321,
      name: 'Critical Thinking',
      description: 'This is a description',
      canTagObject: true,
      taxonomyType: 'tags',
    },
  ],
};
mockTaxonomyListData.untaggableCompetencyOrg = 'UntaggableCompetencyOrg';
mockTaxonomyListData.untaggableCompetency = {
  results: [
    {
      id: 321,
      name: 'Critical Thinking',
      description: 'This is a description',
      canTagObject: false,
      taxonomyType: 'competency',
    },
  ],
};
mockTaxonomyListData.applyMock = () =>
  jest.spyOn(taxonomyApi, 'getTaxonomyListData').mockImplementation(mockTaxonomyListData);

/**
 * Mock for `getTaxonomyTagsData()`
 */
export async function mockTaxonomyTagsData(taxonomyId: number): Promise<any> {
  const thisMock = mockTaxonomyTagsData;
  switch (taxonomyId) {
    case thisMock.stagedTagsTaxonomy:
      return thisMock.stagedTags;
    case thisMock.languageTagsTaxonomy:
      return thisMock.languageTags;
    default:
      throw new Error(`No mock has been set up for taxonomyId "${taxonomyId}"`);
  }
}
mockTaxonomyTagsData.stagedTagsTaxonomy = 123;
mockTaxonomyTagsData.stagedTags = {
  count: 3,
  currentPage: 1,
  next: null,
  numPages: 1,
  previous: null,
  start: 1,
  results: [
    {
      value: 'Tag 1',
      externalId: null,
      childCount: 0,
      depth: 0,
      parentValue: null,
      id: 12345,
      subTagsUrl: null,
      canChangeTag: false,
      canDeleteTag: false,
    },
    {
      value: 'Tag 2',
      externalId: null,
      childCount: 0,
      depth: 0,
      parentValue: null,
      id: 12346,
      subTagsUrl: null,
      canChangeTag: false,
      canDeleteTag: false,
    },
    {
      value: 'Tag 3',
      externalId: null,
      childCount: 0,
      depth: 0,
      parentValue: null,
      id: 12347,
      subTagsUrl: null,
      canChangeTag: false,
      canDeleteTag: false,
    },
  ],
};
mockTaxonomyTagsData.languageTagsTaxonomy = 1234;
mockTaxonomyTagsData.languageTags = {
  count: 1,
  currentPage: 1,
  next: null,
  numPages: 1,
  previous: null,
  start: 1,
  results: [{
    value: 'Tag 1',
    externalId: null,
    childCount: 0,
    depth: 0,
    parentValue: null,
    id: 12345,
    subTagsUrl: null,
    canChangeTag: false,
    canDeleteTag: false,
  }],
};
mockTaxonomyTagsData.applyMock = () => jest.spyOn(api, 'getTaxonomyTagsData').mockImplementation(mockTaxonomyTagsData);

/**
 * Mock for `getContentData()`
 */
export async function mockContentData(contentId: string): Promise<any> {
  switch (contentId) {
    case mockContentData.textXBlock:
      return mockContentData.textXBlockData;
    default:
      return mockContentData.data;
  }
}
mockContentData.data = {
  displayName: 'Unit 1',
};
mockContentData.textXBlock = 'block-v1:edX+DemoX+Demo_Course+type@html+block@030e35c4756a4ddc8d40b95fbbfff4d4';
mockContentData.textXBlockData = {
  displayName: 'Text XBlock 1',
};
mockContentData.applyMock = () => jest.spyOn(api, 'getContentData').mockImplementation(mockContentData);
