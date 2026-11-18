import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, tid, unlockAdmin } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const row = (over = {}) => ({
  submission_id: 'sub-v2-x', timestamp: '2026-03-01T10:00:00Z', student_name: 'Ada Lovelace', student_email: 'ada@example.org',
  test_code: 'CHEMV2', test_title: 'Electrons & Bonding (v2 sample)', score_achieved: 8.5, score_total: 12, percentage: 70.83, duration_seconds: 600,
  status: 'Graded', final_score: 8.5, final_percentage: 70.83, grades: { orbN: 2.5, config: 1, no3: 3 }, comments: { orbN: 'Nice **work** on Hund rule' }, released_at: '2026-03-02T00:00:00Z',
  responses: [
    { questionId: 'warm', type: 'mcq', questionText: 'Which particle has a negative charge?', pointsPossible: 1, pointsEarned: 1, isCorrect: true, answered: true, needsGrading: false, manual: false, givenAnswer: 'b', givenAnswerText: 'Electron', correctAnswerText: 'Electron' },
    { questionId: 'orbN', type: 'orbital', sectionId: 'secA', questionText: 'Draw the orbital diagram for nitrogen.', pointsPossible: 3, pointsEarned: 2.5, isCorrect: false, answered: true, needsGrading: false, manual: true,
      givenAnswer: { '1s': ['ud'], '2s': ['ud'], '2p': ['u', 'u', 'u'] }, givenAnswerText: '1s: ↑↓; 2s: ↑↓; 2p: ↑ ↑ ↑', correctAnswerText: '—' },
    { questionId: 'config', type: 'short', sectionId: 'secA', questionText: 'Write the electron configuration of sodium.', pointsPossible: 1, pointsEarned: 1, isCorrect: true, answered: true, needsGrading: false, manual: true,
      givenAnswer: '1s2 2s2 2p6 3s1', givenAnswerText: '1s2 2s2 2p6 3s1', correctAnswerText: '1s2 2s2 2p6 3s1' },
    { questionId: 'no3', type: 'structure', sectionId: 'secB', questionText: 'Draw the Lewis structure of nitrate.', pointsPossible: 4, pointsEarned: 3, isCorrect: false, answered: true, needsGrading: false, manual: true,
      givenAnswer: { bonds: [2, 1, 1], lonePairs: { n: 0, o1: 2, o2: 3, o3: 3 }, bracket: true, charge: -1, formalCharges: { n: 1, o2: -1, o3: -1 } }, givenAnswerText: 'NO3-', correctAnswerText: '—' },
    { questionId: 'calc', type: 'numeric', questionText: 'Find $n$ for $\\ce{H2O}$.', pointsPossible: 1, pointsEarned: 1, isCorrect: true, answered: true, needsGrading: false, manual: false,
      givenAnswer: 2, givenAnswerText: '$2.0 \\times 10^{3}$', correctAnswerText: '$2.0 \\times 10^{3}$ mol' },
  ],
  ...over,
});

async function openGrader(s, r) {
  const { page, url } = s;
  await page.addInitScript(() => {
    window.__printed = 0; window.__titles = [];
    window.print = () => { window.__printed++; window.__titles.push(document.title); };
    // KaTeX stand-in (the CDN is blocked in tests) that arrives late, so export must wait for it.
    setTimeout(() => {
      window.katex = {};
      window.renderMathInElement = (el) => {
        const walk = (n) => {
          for (const c of [...n.childNodes]) {
            if (c.nodeType === 1) walk(c);
            else if (c.nodeType === 3 && /\$[^$]+\$/.test(c.data)) {
              const span = document.createElement('span');
              span.innerHTML = c.data.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\$([^$]+)\$/g, '<span class="katex">$1</span>');
              c.replaceWith(...span.childNodes);
            }
          }
        };
        walk(el);
      };
    }, 1500);
  });
  s.onGas = (body) => (body.action === 'getResults' ? { result: 'success', rows: [r] } : null);
  await unlockAdmin(page, url);
  await page.evaluate(() => sessionStorage.setItem('cw:adminKey', JSON.stringify('secret')));
  await page.locator(tid('tab-grading')).click();
  await page.locator(tid('grading-status-filter')).selectOption('all');
  await page.locator(tid('grading-row')).first().click();
  await page.locator(tid('grade-item')).first().waitFor();
}

const exportNow = async (page) => {
  await page.locator(tid('export-pdf')).click();
  await page.waitForFunction(() => window.__printed === 1);
};

test('exports a released submission with diagrams and comments', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await openGrader(s, row());
  await exportNow(page);
  const doc = page.locator('#print-root [data-testid="export-doc"]');
  assert.equal(await doc.count(), 1);
  assert.match(await doc.textContent(), /Ada Lovelace/);
  assert.match(await page.locator(`#print-root ${tid('export-score')}`).textContent(), /8\.5 \/ 10 · 85%/);
  assert.equal(await page.locator(`#print-root ${tid('export-section')}`).count(), 2);
  assert.equal(await page.locator(`#print-root ${tid('export-item-orbN')} ${tid('export-answer')} .orb`).count(), 1);
  // correct answers are printed; LaTeX in answers and correct answers is typeset
  assert.match(await page.locator(`#print-root ${tid('export-item-warm')} ${tid('export-correct')}`).textContent(), /Electron/);
  assert.equal(await page.locator(`#print-root ${tid('export-item-calc')} ${tid('export-answer')} .katex`).count(), 1);
  assert.equal(await page.locator(`#print-root ${tid('export-item-calc')} ${tid('export-correct')} .katex`).count(), 1);
  assert.doesNotMatch(await page.locator(`#print-root ${tid('export-item-calc')}`).textContent(), /\$/);
  assert.equal(await page.locator(`#print-root ${tid('export-item-no3')} svg`).count() > 0, true);
  assert.match(await page.locator(`#print-root ${tid('export-item-orbN')}`).textContent(), /Nice work on Hund rule/);
  assert.match(await page.locator(`#print-root ${tid('export-item-orbN')}`).textContent(), /2\.5 \/ 3 pts/);
  assert.deepEqual(await page.evaluate(() => window.__titles), ['ChemistryWorks - Ada Lovelace - CHEMV2 Electrons & Bonding (v2 sample)']);
  // body is a direct parent of #print-root
  assert.equal(await page.evaluate(() => document.getElementById('print-root').parentElement === document.body), true);

  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('#app').isVisible(), false);
  assert.equal(await page.locator('#print-root').isVisible(), true);
}));

test('unreleased submission still includes teacher comments', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await openGrader(s, row({ released_at: '' }));
  await exportNow(page);
  const text = await page.locator('#print-root [data-testid="export-doc"]').textContent();
  assert.match(text, /Ada Lovelace/);
  assert.match(text, /Nice work on Hund rule/);
  assert.equal(await page.locator('#print-root .export-comment').count(), 1);
}));
