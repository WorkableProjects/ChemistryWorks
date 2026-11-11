// Shared pieces of the student home and profile: element tile, level ring, trend line, badge shelf, sync chip, rows.
// Quiet by design: one moment (the level ring), everything else is rows. Tokens only (css/home.css).

import { h } from '../../ui.js';
import { BADGES } from '../../lib/xp.js';
import { modeById as getGame } from '../../lib/modes/index.js';
import { getLocalResults } from '../../lib/submit.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/** Periodic-table style symbol from a test code: "CHEM101" -> "Ch". */
export const symbolOf = (code) => {
  const letters = String(code || '').replace(/[^A-Za-z]/g, '');
  if (!letters) return '?';
  return letters[0].toUpperCase() + (letters[1] || '').toLowerCase();
};

/** Element tile: 40px square, mono symbol, small number top-left. */
export function elementTile(symbol, number = null, { className = '', title = '' } = {}) {
  return h('span', { class: ['el-tile', className], title: title || null, 'aria-hidden': 'true' },
    number != null ? h('span', { class: 'el-tile__n' }, number) : null,
    h('span', { class: 'el-tile__sym' }, symbol));
}

/** The screen's one moment: level ring with the level in the centre and the XP under it. */
export function levelRing(p) {
  const size = 72; const stroke = 6; const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(1, Number(p.levelProgress) || 0));
  const arc = svgEl('circle', { class: 'level-ring__arc', cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke,
    'stroke-linecap': 'round', transform: `rotate(-90 ${size / 2} ${size / 2})`, 'stroke-dasharray': c, 'stroke-dashoffset': c });
  const svg = svgEl('svg', { class: 'level-ring__svg', width: size, height: size, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgEl('circle', { class: 'level-ring__track', cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke }), arc);
  const num = svgEl('text', { class: 'level-ring__num', x: size / 2, y: size / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  num.textContent = String(p.level || 1);
  svg.append(num);
  // Set the arc on the next frame so the transition runs (zero under reduced motion).
  requestAnimationFrame(() => arc.setAttribute('stroke-dashoffset', String(c * (1 - progress))));
  const span = (p.xpIntoLevel || 0) + (p.xpToNext || 0);
  return h('div', { class: 'level-ring', role: 'img', 'aria-label': `Level ${p.level}, ${p.xpIntoLevel} of ${span} XP`, dataset: { testid: 'level-ring' } },
    svg, h('span', { class: 'level-ring__xp' }, `${p.xpIntoLevel} / ${span} XP`));
}

/** Small trend line of released percentages, oldest to newest. Accent stroke, no fill. */
export function trendLine(values) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const w = 240; const hgt = 40; const pad = 4;
  const lo = Math.min(...v); const hi = Math.max(...v); const range = hi - lo || 1;
  const pts = v.map((y, i) => [pad + (i * (w - 2 * pad)) / (v.length - 1), hgt - pad - ((y - lo) / range) * (hgt - 2 * pad)]);
  const svg = svgEl('svg', { class: 'trend', width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, role: 'img', focusable: 'false',
    'aria-label': `Recent scores, from ${Math.round(v[0])}% to ${Math.round(v[v.length - 1])}%` });
  svg.append(svgEl('polyline', { class: 'trend__line', fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    points: pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') }));
  const last = pts[pts.length - 1];
  svg.append(svgEl('circle', { class: 'trend__dot', cx: last[0].toFixed(1), cy: last[1].toFixed(1), r: 3 }));
  return h('div', { class: 'trend-wrap', dataset: { testid: 'results-trend' } }, svg,
    h('span', { class: 'trend-wrap__note' }, `Last ${v.length} released results`));
}

/** Badge shelf: every badge as an element tile, unearned at 40% opacity. */
export function badgeShelf(earned, { testid = 'badges' } = {}) {
  const have = new Map((earned || []).map((b) => [b.id, b]));
  return h('ul', { class: 'badge-shelf', dataset: { testid } }, BADGES.map((b, i) => {
    const on = have.has(b.id);
    return h('li', { class: ['badge', on ? 'is-earned' : 'is-locked'], title: `${b.title}: ${b.text}`, dataset: { testid: `badge-${b.id}`, earned: on ? 'true' : 'false' } },
      elementTile(symbolOf(b.title.replace(/^\d+\s*/, '')), i + 1),
      h('span', { class: 'badge__name' }, b.title),
      h('span', { class: 'sr-only' }, on ? ' (earned)' : ' (not earned yet)'));
  }));
}

const SYNC_TEXT = { synced: 'Synced', syncing: 'Syncing…', offline: 'Not synced', error: 'Sync failed, retrying' };
export function syncChip(state) {
  const el = h('span', { class: 'chip sync-chip', role: 'status', dataset: { testid: 'sync-chip', state: state || 'offline' } });
  el.textContent = SYNC_TEXT[state] || SYNC_TEXT.offline;
  el.update = (s) => { el.dataset.state = s; el.textContent = SYNC_TEXT[s] || SYNC_TEXT.offline; };
  return el;
}

export const fmtDate = (v) => {
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) && t > 0 ? new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
};
export const modeLabel = (id) => (!id || id === 'study' ? 'Study' : (getGame(id) && getGame(id).title) || id);

/** The local result payload for a profile result row, when this device has it. */
export const localPayload = (r) => getLocalResults().find((x) => x && x.submission_id && String(x.test_code) === r.code && String(x.submitted_at) === r.submittedAt) || null;

/** One result row: tile, title, meta, score in mono (or a quiet "Waiting for grading" chip), one button. */
export function resultRow(ctx, r, i) {
  const payload = r.released ? localPayload(r) : null;
  const open = () => (payload ? ctx.navigate('feedback', { payload }) : ctx.openTest(r.code));
  const score = r.released && r.percentage != null ? `${Math.round(r.percentage)}%` : '';
  const points = r.released && r.scoreTotal ? `${r.scoreAchieved} / ${r.scoreTotal}` : '';
  return h('li', { class: 'row', dataset: { testid: `result-${r.code}-${i}`, code: r.code } },
    elementTile(symbolOf(r.code), i + 1),
    h('div', { class: 'row__main' },
      h('span', { class: 'row__title' }, r.title),
      h('span', { class: 'row__meta' }, [r.code, fmtDate(r.submittedAt), points].filter(Boolean).join(' · '))),
    r.released
      ? h('span', { class: 'row__score', dataset: { testid: 'result-score' } }, score)
      : h('span', { class: 'chip', dataset: { testid: 'result-waiting' } }, 'Waiting for grading'),
    r.released ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: `view-feedback-${r.code}-${i}` }, 'aria-label': `View feedback for ${r.title}`, on: { click: open } }, 'View feedback') : null);
}
