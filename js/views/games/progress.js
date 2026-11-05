// End-screen extras: XP / level / badges / cosmetics / history chart (local) and the class leaderboard (only when the
// test turns it on). Also the leaderboard panel for the game picker. Nothing here sends anything unless leaderboardOn(test).

import { h, icon } from '../../ui.js';
import { getFreshIdToken } from '../../lib/auth.js';
import { levelInfo, badgeInfo, FLASKS, FRAMES, unlocked, equip, loadXp, saveXp, HISTORY_LIMIT } from '../../lib/xp.js';
import {
  leaderboardOn, nameMode, displayName, nicknameChoices, saveNickname, loadNickname, submitGameScore, fetchBoard, TOP_N,
} from '../../lib/leaderboard.js';

const svg = (tag, attrs = {}, ...kids) => h(tag, { xmlns: 'http://www.w3.org/2000/svg', ...attrs }, ...kids);

/** Original flask art: a conical flask whose liquid and frame take their colours from CSS tokens (see css/game.css). */
export function flaskArt(state, { size = 64 } = {}) {
  const eq = state.equipped || {};
  return h('span', { class: `xp-flask xp-flask--${eq.flask || 'navy'} xp-frame--${eq.frame || 'plain'}`, dataset: { testid: 'xp-flask', flask: eq.flask || 'navy', frame: eq.frame || 'plain' } },
    svg('svg', { viewBox: '0 0 48 56', width: String(size), height: String(Math.round(size * 56 / 48)), role: 'img', 'aria-label': `${eq.flask || 'navy'} flask` },
      svg('path', { class: 'xp-flask__liquid', d: 'M14 34h20l7 15a4 4 0 0 1-3.6 5.5H10.6A4 4 0 0 1 7 49z' }),
      svg('path', { class: 'xp-flask__glass', d: 'M18 4h12M20 4v16L7 49a4 4 0 0 0 3.6 5.5h26.8A4 4 0 0 0 41 49L28 20V4', fill: 'none', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      svg('circle', { class: 'xp-flask__bubble', cx: '22', cy: '42', r: '2.5' }),
      svg('circle', { class: 'xp-flask__bubble', cx: '29', cy: '46', r: '1.8' })));
}

/** Bars for the last rounds' scores (relative to the best of them). */
export function historyChart(history) {
  const rows = (history || []).slice(-HISTORY_LIMIT);
  if (!rows.length) return h('p', { class: 'game-note', dataset: { testid: 'xp-history-empty' } }, 'No rounds yet.');
  const max = Math.max(1, ...rows.map((r) => r.score));
  const W = 22; const gap = 6; const H = 60;
  const bars = rows.map((r, i) => svg('rect', { class: 'xp-bar', x: String(i * (W + gap)), y: String(H - Math.max(3, Math.round(H * r.score / max))), width: String(W), height: String(Math.max(3, Math.round(H * r.score / max))), rx: '3' },
    svg('title', {}, `${r.game}: ${r.score.toLocaleString()}`)));
  return h('figure', { class: 'xp-history', dataset: { testid: 'xp-history' } },
    svg('svg', { viewBox: `0 0 ${rows.length * (W + gap)} ${H}`, class: 'xp-history__svg', role: 'img', 'aria-label': `Scores of your last ${rows.length} rounds, from ${rows[0].score} to ${rows[rows.length - 1].score}` }, bars),
    h('figcaption', { class: 'game-note' }, `Last ${rows.length} round${rows.length === 1 ? '' : 's'}`));
}

function cosmeticPicker(email, state, onChange) {
  const u = unlocked(state);
  const sel = (label, kind, list, current) => h('label', { class: 'xp-pick' }, h('span', {}, label),
    h('select', { class: 'input', dataset: { testid: `xp-pick-${kind}` }, on: { change: (e) => onChange(kind, e.target.value) } },
      list.map((c) => h('option', { value: c.id, selected: c.id === current, disabled: !(kind === 'flask' ? u.flasks : u.frames).includes(c.id) },
        `${c.label}${(kind === 'flask' ? u.flasks : u.frames).includes(c.id) ? '' : c.badge ? ' (earn a badge)' : ` (level ${c.level})`}`))));
  return h('div', { class: 'xp-picks' }, sel('Flask', 'flask', FLASKS, state.equipped.flask), sel('Badge frame', 'frame', FRAMES, state.equipped.frame));
}

/** The XP panel for a finished round. `res` is the recordRoundXp / awardRound result (null = nothing earned). */
export function xpPanel(email, res) {
  let state = res ? res.state : loadXp(email);
  const root = h('section', { class: 'xp-panel', 'aria-label': 'Your progress', dataset: { testid: 'xp-panel' } });
  const paint = () => {
    const li = levelInfo(state.xp);
    const unlocks = res ? res.newUnlocks : [];
    root.replaceChildren(
      h('div', { class: 'xp-head' },
        flaskArt(state),
        h('div', { class: 'xp-head__text' },
          h('p', { class: 'xp-level', dataset: { testid: 'xp-level' } }, h('strong', {}, `Level ${li.level}`), ` · ${state.xp.toLocaleString()} XP`),
          res ? h('p', { class: 'xp-gain', dataset: { testid: 'xp-gained' } }, `+${res.gained} XP this round${res.levelUp ? ` · Level up! You are level ${res.levelAfter}.` : ''}`) : null,
          h('div', { class: 'xp-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(li.span), 'aria-valuenow': String(li.into), 'aria-label': `${li.into} of ${li.span} XP to level ${li.level + 1}` },
            h('span', { class: 'xp-meter__fill', style: { transform: `scaleX(${Math.max(0.02, li.progress).toFixed(3)})` } })))),
      res && res.newBadges.length ? h('ul', { class: 'xp-new', dataset: { testid: 'xp-new-badges' } }, res.newBadges.map((id) => {
        const b = badgeInfo(id);
        return h('li', { class: 'xp-badge is-new', dataset: { badge: id } }, icon('award', { size: 18 }), h('span', {}, h('strong', {}, `Badge: ${b.title}`), ` ${b.text}`));
      })) : null,
      unlocks.length ? h('p', { class: 'xp-unlocks', dataset: { testid: 'xp-unlocks' } }, `Unlocked: ${unlocks.map((u) => u.label).join(', ')}.`) : null,
      h('details', { class: 'xp-more' }, h('summary', {}, 'Badges, flasks and history'),
        h('ul', { class: 'xp-badges', dataset: { testid: 'xp-badges' } }, Object.keys(state.badges).length
          ? Object.keys(state.badges).map((id) => { const b = badgeInfo(id); return h('li', { class: 'xp-badge' }, icon('award', { size: 16 }), h('span', {}, h('strong', {}, b.title), ` ${b.text}`)); })
          : [h('li', { class: 'game-note' }, 'No badges yet.')]),
        cosmeticPicker(email, state, (kind, id) => { state = equip(state, { [kind]: id }); saveXp(email, state); paint(); }),
        historyChart(state.history)));
  };
  paint();
  return root;
}

// ---------- leaderboard ----------
export function boardList(board, { title = 'Class leaderboard' } = {}) {
  return h('div', { class: 'lb', dataset: { testid: 'lb-panel' } },
    h('h2', { class: 'game-review__title' }, title),
    board.top.length
      ? h('ol', { class: 'lb__list', dataset: { testid: 'lb-top' } }, board.top.map((r) => h('li', { class: ['lb__row', r.you && 'is-you'] },
        h('span', { class: 'lb__rank' }, String(r.rank)), h('span', { class: 'lb__name' }, r.name, r.you ? ' (you)' : ''), h('span', { class: 'lb__score' }, r.score.toLocaleString()))))
      : h('p', { class: 'game-note' }, 'No scores yet. Be the first.'),
    board.own && !board.top.some((r) => r.you) ? h('p', { class: 'lb__own', dataset: { testid: 'lb-own' } }, `Your rank: ${board.own.rank} (${board.own.score.toLocaleString()})`) : null,
    h('p', { class: 'game-note' }, `Top ${TOP_N}. The leaderboard is for fun, not grades: scores are computed in your browser.`));
}

/** Nickname chooser (only used when the teacher chose nicknames). onPicked(nick) fires after saving. */
export function nicknamePicker(user, onPicked) {
  const choices = nicknameChoices(12, (user.email || '').length * 13);
  const select = h('select', { class: 'input', 'aria-label': 'Nickname', dataset: { testid: 'lb-nick-select' } }, choices.map((n) => h('option', { value: n }, n)));
  return h('div', { class: 'lb-nick', dataset: { testid: 'lb-nick' } },
    h('p', {}, 'Pick a nickname for the class leaderboard.'),
    h('div', { class: 'game-form' }, select,
      h('button', { class: 'btn btn--primary', type: 'button', dataset: { testid: 'lb-nick-save' }, on: { click: () => { saveNickname(user.email, select.value); onPicked(select.value); } } }, 'Use this nickname')));
}

async function tokenFor(user) { return user && user.provider === 'google' ? getFreshIdToken() : null; }

/**
 * Leaderboard for the end screen: submits the final capped score, then lists the top 10 and the student's rank.
 * Returns null when the test has no leaderboard. Renders nothing at all when the backend is unavailable.
 */
export function endLeaderboard(shell, { score, info }) {
  const { test, user, game, ctx } = shell;
  if (!leaderboardOn(test) || game.scored === false || score === null) return null;
  const gasUrl = ctx.config && ctx.config.GAS_WEB_APP_URL;
  const slot = h('div', { class: 'lb-slot' });
  const run = async () => {
    if (!displayName(test, user)) { slot.replaceChildren(nicknamePicker(user, run)); return; }
    slot.replaceChildren();
    const idToken = await tokenFor(user);
    const sent = await submitGameScore({ gasUrl, idToken, test, user, gameId: game.id, score, info });
    if (sent.unavailable) return; // old backend or offline: show nothing
    const board = await fetchBoard({ gasUrl, idToken, test, user, gameId: game.id });
    if (board.unavailable) return;
    slot.replaceChildren(boardList(board));
  };
  run();
  return slot;
}

/** Leaderboard block for the game picker: nickname choice plus a game selector. Null when the test has no leaderboard. */
export function pickerLeaderboard({ ctx, test, user, games }) {
  if (!leaderboardOn(test)) return null;
  const gasUrl = ctx.config && ctx.config.GAS_WEB_APP_URL;
  const slot = h('div', { class: 'lb-slot', dataset: { testid: 'lb-picker' } });
  const body = h('div', { class: 'lb-body' });
  let gameId = games[0];
  const select = h('select', { class: 'input', 'aria-label': 'Leaderboard game', dataset: { testid: 'lb-game-select' }, on: { change: (e) => { gameId = e.target.value; load(); } } },
    games.map((g) => h('option', { value: g.id }, g.title)));
  async function load() {
    body.replaceChildren();
    const idToken = await tokenFor(user);
    const board = await fetchBoard({ gasUrl, idToken, test, user, gameId: gameId.id || gameId });
    if (board.unavailable) { slot.replaceChildren(); return; }
    body.replaceChildren(boardList(board, { title: 'Leaderboard' }));
  }
  const start = () => { slot.replaceChildren(h('label', { class: 'xp-pick' }, h('span', {}, 'Leaderboard for'), select), body); gameId = games[0]; load(); };
  if (nameMode(test) === 'nicknames' && !loadNickname(user.email)) slot.replaceChildren(nicknamePicker(user, start)); else start();
  return slot;
}
