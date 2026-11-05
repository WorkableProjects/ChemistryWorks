// V4-02 question pools (S11). A section with `pool: { draw: N, tags?: [..] }` gives each student N of its questions,
// drawn with the per-student seeded PRNG, so the same student gets the same questions on every device and in grading.
// The drawn ids are recorded in test.instance.drawn (sent with the submission; the Submissions sheet keeps them).
// Pure; registered as an instantiate step (js/lib/instantiate.js).

import { addInstantiateStep } from './instantiate-steps.js';

/** Questions of a section eligible for its pool (all of them, or those tagged with any of pool.tags). */
export function poolCandidates(test, section) {
  const qs = (test.questions || []).filter((q) => q && q.section === section.id);
  const tags = Array.isArray(section.pool?.tags) ? section.pool.tags.map((t) => String(t).toLowerCase()) : [];
  if (!tags.length) return qs;
  const tagged = qs.filter((q) => (Array.isArray(q.tags) ? q.tags : []).some((t) => tags.includes(String(t).toLowerCase())));
  return tagged.length ? tagged : qs;
}

/** Draw for every pooled section. Returns the ids kept (all non-pooled questions plus the drawn ones), in test order. */
export function drawPools(test, rand) {
  const drop = new Set();
  const drawn = [];
  for (const sec of Array.isArray(test.sections) ? test.sections : []) {
    const n = Number(sec?.pool?.draw);
    if (!sec || !Number.isInteger(n) || n < 1) continue;
    const cands = poolCandidates(test, sec);
    const order = cands.map((q) => q.id);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const keep = new Set(order.slice(0, Math.min(n, order.length)));
    for (const q of (test.questions || []).filter((x) => x && x.section === sec.id)) {
      if (keep.has(q.id)) drawn.push(q.id); else drop.add(q.id);
    }
  }
  return { keep: (test.questions || []).filter((q) => !drop.has(q.id)).map((q) => q.id), drawn };
}

addInstantiateStep('pools', (test, { rand }) => {
  if (!(test.sections || []).some((s) => s && s.pool)) return;
  const { keep, drawn } = drawPools(test, rand);
  const ids = new Set(keep);
  test.questions = test.questions.filter((q) => ids.has(q.id));
  test.instance = { ...(test.instance || {}), drawn };
});
