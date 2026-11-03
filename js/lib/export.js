// Printable export of one reviewed submission (V2-08). Pure functions, no DOM.
import { groupQuestions } from './sections.js';

const round1 = (x) => Math.round(x * 10) / 10;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v) => (v == null ? '' : String(v));

function clean(s) {
  // eslint-disable-next-line no-control-regex
  return str(s).replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
}

/** "ChemistryWorks - Ada Lovelace - CHEMV2 Electrons & Bonding" (no extension; browsers add .pdf). */
export function exportFilename(row) {
  const r = row || {};
  const who = clean(r.student_name) || clean(r.student_email) || 'Student';
  const what = [clean(r.test_code), clean(r.test_title)].filter(Boolean).join(' ');
  const name = ['ChemistryWorks', who, what].filter(Boolean).join(' - ');
  return name.slice(0, 120).trim();
}

/** The correct/sample answer as text, minus placeholders and the rubric (rubrics are not printed). */
function correctText(res) {
  const t = str(res.correctAnswerText).replace(/\n*Rubric:[\s\S]*$/, '').trim();
  return t === '—' ? '' : t;
}

function itemFor(res, number, question, includeComments, comments) {
  const qid = str(res.questionId);
  const c = includeComments ? comments[qid] : '';
  return {
    number,
    questionId: qid,
    type: res.type || question?.type || '',
    prompt: str(res.questionText) || str(question?.text),
    question: question || null,
    answered: !!res.answered,
    answerText: str(res.givenAnswerText),
    givenAnswer: res.givenAnswer ?? null,
    correctAnswerText: correctText(res),
    correctAnswer: res.correctAnswer ?? null,
    manual: !!res.manual,
    pointsEarned: Number(res.pointsEarned) || 0,
    pointsPossible: Number(res.pointsPossible) || 0,
    needsGrading: !!res.needsGrading,
    comment: typeof c === 'string' ? c : '',
  };
}

export function buildExportModel({ row, test, includeComments }) {
  const r = row || {};
  const responses = Array.isArray(r.responses) ? r.responses.filter((x) => x && typeof x === 'object') : [];
  const comments = r.comments && typeof r.comments === 'object' && !Array.isArray(r.comments) ? r.comments : {};
  const byId = new Map(responses.map((x) => [str(x.questionId), x]));
  const qs = Array.isArray(test?.questions) ? test.questions : [];
  const qById = new Map(qs.map((q) => [str(q?.id), q]));
  let n = 0;
  const make = (res) => itemFor(res, ++n, qById.get(str(res.questionId)) || null, !!includeComments, comments);

  const groups = [];
  if (test) {
    const used = new Set();
    for (const g of groupQuestions(test, { skipEmpty: true })) {
      const items = [];
      for (const q of g.questions) {
        const res = byId.get(str(q.id));
        if (!res) continue;
        used.add(str(q.id));
        items.push(make(res));
      }
      if (!items.length) continue;
      const s = g.section;
      groups.push({ section: s ? { id: str(s.id), title: str(s.title), instructions: str(s.instructions) } : null, items });
    }
    const rest = responses.filter((x) => !used.has(str(x.questionId)));
    if (rest.length) groups.push({ section: null, items: rest.map(make) });
  } else if (responses.length) {
    groups.push({ section: null, items: responses.map(make) });
  }

  const earnedCalc = responses.reduce((s, x) => s + (Number(x.pointsEarned) || 0), 0);
  const totalCalc = responses.reduce((s, x) => s + (Number(x.pointsPossible) || 0), 0);
  const earned = isNum(Number(r.score_achieved)) && r.score_achieved !== '' && r.score_achieved != null ? Number(r.score_achieved) : earnedCalc;
  const total = isNum(Number(r.score_total)) && r.score_total !== '' && r.score_total != null ? Number(r.score_total) : totalCalc;
  const pct = isNum(Number(r.percentage)) && r.percentage !== '' && r.percentage != null ? Number(r.percentage) : (total > 0 ? (earned / total) * 100 : 0);

  return {
    title: exportFilename(r),
    studentName: str(r.student_name),
    studentEmail: str(r.student_email),
    gradedBy: str(r.graded_by).trim(),
    testCode: str(r.test_code),
    testTitle: str(r.test_title),
    score: { earned: Math.round(earned * 100) / 100, total: Math.round(total * 100) / 100, percentage: round1(pct), pending: responses.filter((x) => x.needsGrading).length },
    groups,
  };
}
