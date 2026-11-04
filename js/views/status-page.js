// Shared status-page layout (V4-01): centered card with art, heading, lines, note and actions.
// statusPage({ icon, tone, title, lines, note, actions, testid, art }) -> <main class="status-page">
// The heading carries tabindex=-1 and class .status-page__title; callers focus it after render.

import { h, icon as iconEl, flaskSvg } from '../ui.js';

export function statusPage({ icon = 'check', tone = 'info', title = '', lines = [], note = null, actions = [], testid, art = 'flask' } = {}) {
  const artEl = art === 'none' ? null : h('div', { class: 'status-page__art', 'aria-hidden': 'true' },
    art === 'flask' ? h('span', { html: flaskSvg(96) }) : h('span', { class: 'status-page__badge' }, iconEl(icon, { size: 32 })));
  return h('main', { class: `status-page status-page--${tone}`, dataset: testid ? { testid } : undefined },
    artEl,
    h('h1', { class: 'status-page__title', tabindex: '-1' }, title),
    h('div', { class: 'status-page__lines', role: 'status' }, lines.map((l) => (typeof l === 'string' ? h('p', {}, l) : l))),
    note ? (typeof note === 'string' ? h('p', { class: 'status-page__note' }, note) : note) : null,
    h('div', { class: 'status-page__actions' }, actions));
}
