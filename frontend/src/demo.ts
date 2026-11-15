import type { Analysis } from './api/client';

export const examplePhoto = '/fictional-label.png';
const medication = 'Pine Sample 5 mg';
const directions = 'Training label only. Do not take this product.';
const warnings = 'Keep this demonstration container out of reach of children.';
const date = 'Discard after NOV 30 2027.';

export const exampleAnalysis: Analysis = {
  id: 'example',
  created_at: '2026-11-14T12:00:00Z',
  readability: 'readable',
  source_language: 'en',
  explanation_language: 'en',
  extracted_text: ['FICTIONAL LABEL · PRESDES DEMO', medication, directions, warnings, date].join('\n'),
  medication: { state: 'found', excerpts: [medication] },
  directions: { state: 'found', excerpts: [directions] },
  warnings: { state: 'found', excerpts: [warnings] },
  printed_dates: { state: 'found', excerpts: [date] },
  explanations: {
    simple: 'This is a training label. The printed directions say not to take the product.',
    detailed: 'The label says the product is for training only and should not be taken. It says to keep the demonstration container away from children and lists NOV 30 2027 as the discard date.',
  },
  uncertainties: [],
  pharmacist_questions: [],
};
