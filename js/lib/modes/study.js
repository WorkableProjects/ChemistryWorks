// Study: the runner itself (js/views/runner.js). Always first, always available. Picking it navigates to the runner.
export const study = {
  id: 'study', title: 'Study', blurb: 'Answer in order, review and submit', icon: 'book', order: 0, pacing: 'self',
  available: () => ({ ok: true }),
  scoring: () => ({ score: 0, detail: {} }),
};
