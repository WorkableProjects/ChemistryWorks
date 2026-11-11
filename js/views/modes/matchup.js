// Match-Up view: pick a prompt, then its answer. A right pair is saved with attempt.set (js/lib/modes/matchup.js).
// Pairs run in rounds of six; matching-question lines are merged into the { leftId: rightId } object the runner stores.
import { h, mount, richText, renderMath } from '../../ui.js';
import { matchup, buildPairs, buildRounds, PAIR_POINTS, RETRY_POINTS } from '../../lib/modes/matchup.js';
import { emptyCard } from './play.js';

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export function render(host, attempt, ctx) {
  const pairs = buildPairs(attempt.questions);
  if (pairs.length < 3) {
    emptyCard(host, { title: matchup.title, text: 'This practice has too few pairs to match', label: 'See results', onClick: () => ctx.onEnd({ modeId: matchup.id, score: 0, answered: attempt.answeredCount, correct: 0, total: attempt.total, durationMs: 0 }) });
    return { destroy() {} };
  }
  const rounds = buildRounds(pairs);
  const events = [];
  const startedAt = Date.now();
  let ended = false;
  let roundNo = 0;
  let score = 0;
  let matched = 0;

  const drawHud = () => ctx.hudSlot.replaceChildren(h('div', { class: 'mode-hud' },
    h('span', { class: 'mode-hud__item', dataset: { testid: 'mode-progress' } }, `${matched} of ${pairs.length} matched`),
    h('span', { class: 'mode-hud__item mode-hud__fig', dataset: { testid: 'mode-score' } }, `Score ${score}`)));

  /** Save a right pair the way the runner would. */
  function save(p) {
    if (p.leftId !== undefined) attempt.set(p.qid, { ...(attempt.get(p.qid) || {}), [p.leftId]: p.value });
    else attempt.set(p.qid, p.value);
  }

  function intro() {
    const start = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'mode-start' }, on: { click: playRound } }, 'Start');
    mount(host, h('section', { class: 'mode-card', dataset: { testid: 'mode-intro' } },
      h('h1', { class: 'mode-card__title', tabindex: '-1' }, matchup.title),
      h('p', { class: 'mode-card__lead' }, 'Pick a prompt, then pick its answer. A right pair is saved as your answer'),
      h('p', { class: 'mode-card__note' }, `${pairs.length} pairs in ${rounds.length} ${rounds.length === 1 ? 'round' : 'rounds'}. A pair you get right first time scores ${PAIR_POINTS}`),
      h('div', { class: 'mode-actions' }, start)));
    drawHud();
    start.focus();
  }

  function playRound() {
    if (ended) return;
    const round = rounds[roundNo];
    const answers = shuffle(round.map((p) => ({ pairId: p.id, text: p.answer })));
    const doneTerms = new Set();
    const doneAns = new Set();
    const missed = new Set();
    let selected = null;
    const termBtns = new Map();
    const ansBtns = new Map();
    const status = h('p', { class: 'mode-card__note', role: 'status', dataset: { testid: 'matchup-status' } }, 'Pick a prompt');

    const paint = () => {
      for (const [id, b] of termBtns) { b.classList.toggle('is-selected', selected === id); b.classList.toggle('is-matched', doneTerms.has(id)); b.disabled = doneTerms.has(id); b.setAttribute('aria-pressed', String(selected === id)); }
      for (const [id, b] of ansBtns) { b.classList.toggle('is-matched', doneAns.has(id)); b.disabled = doneAns.has(id); }
    };
    const clearWrong = () => { for (const b of [...termBtns.values(), ...ansBtns.values()]) b.classList.remove('is-wrong'); };

    function chooseTerm(p) {
      clearWrong();
      selected = selected === p.id ? null : p.id;
      status.textContent = selected ? 'Now pick its answer' : 'Pick a prompt';
      paint();
    }
    function chooseAnswer(a) {
      if (!selected) { status.textContent = 'Pick a prompt first'; return; }
      clearWrong();
      const p = round.find((x) => x.id === selected);
      if (p.answer === a.text) {
        const pts = missed.has(p.id) ? RETRY_POINTS : PAIR_POINTS;
        save(p);
        doneTerms.add(p.id); doneAns.add(a.pairId);
        score += pts; matched += 1;
        events.push({ id: p.id, outcome: 'correct', points: pts });
        ctx.sound?.play?.('correct');
        selected = null;
        status.textContent = `Matched. +${pts} points`;
        drawHud();
        paint();
        if (doneTerms.size >= round.length) roundDone();
      } else {
        missed.add(p.id);
        termBtns.get(p.id).classList.add('is-wrong');
        ansBtns.get(a.pairId).classList.add('is-wrong');
        ctx.sound?.play?.('wrong');
        status.textContent = 'Not a match. Try again';
      }
    }
    const termCol = h('div', { class: 'matchup__col', dataset: { testid: 'matchup-prompts' } }, round.map((p) => {
      const b = h('button', { class: 'matchup__item', type: 'button', dataset: { testid: 'matchup-prompt', pairId: p.id }, on: { click: () => chooseTerm(p) } }, richText(p.prompt, 'span'));
      termBtns.set(p.id, b);
      return b;
    }));
    const ansCol = h('div', { class: 'matchup__col', dataset: { testid: 'matchup-answers' } }, answers.map((a) => {
      const b = h('button', { class: 'matchup__item', type: 'button', dataset: { testid: 'matchup-answer', pairId: a.pairId }, on: { click: () => chooseAnswer(a) } }, richText(a.text, 'span'));
      ansBtns.set(a.pairId, b);
      return b;
    }));
    const finish = h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'mode-finish' }, on: { click: end } }, 'Finish');
    mount(host, h('section', { class: 'mode-card', dataset: { testid: 'matchup', round: roundNo + 1 } },
      h('p', { class: 'mode-q__num' }, `Round ${roundNo + 1} of ${rounds.length}`),
      h('div', { class: 'matchup' }, termCol, ansCol),
      status,
      h('div', { class: 'mode-actions' }, finish)));
    renderMath(host);
    drawHud();

    function roundDone() {
      const last = roundNo >= rounds.length - 1;
      const go = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'mode-next' }, on: { click: () => { if (last) end(); else { roundNo += 1; playRound(); } } } }, last ? 'See results' : 'Next round');
      mount(host, h('section', { class: 'mode-card mode-feedback is-correct', dataset: { testid: 'mode-feedback', outcome: 'correct' } },
        h('h2', { class: 'mode-feedback__title' }, `Round ${roundNo + 1} done`),
        h('p', { class: 'mode-feedback__line' }, `${matched} of ${pairs.length} pairs matched`),
        h('div', { class: 'mode-actions' }, go)));
      ctx.announce(`Round ${roundNo + 1} done`);
      setTimeout(() => go.focus(), 0);
    }
  }

  function end() {
    if (ended) return;
    ended = true;
    const { score: points } = matchup.scoring(attempt, events);
    ctx.onEnd({ modeId: matchup.id, score: points, answered: attempt.answeredCount, correct: events.length, total: attempt.total, durationMs: Date.now() - startedAt });
  }

  intro();
  return { destroy() { ended = true; ctx.hudSlot.replaceChildren(); } };
}
