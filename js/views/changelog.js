// Settings > What's new: every version's release notes in one dialog, one collapsible <details> per version.
// The current version starts open. Loaded on demand from the settings popover.

import { h, openModal, flaskLoader } from '../ui.js';
import { SITE_VERSION } from '../version.js';
import { parseInline, fetchChangelog, markChangelogSeen } from '../lib/changelog.js';

const inline = (text) => parseInline(text).map((s) => s.type === 'bold' ? h('strong', {}, s.text) : s.type === 'code' ? h('code', {}, s.text) : s.text);

function renderBlocks(blocks) {
  return blocks.map((b) => {
    if (b.type === 'heading') return h('h4', { class: 'changelog__h' }, inline(b.text));
    if (b.type === 'list') return h('ul', { class: 'changelog__list' }, b.items.map((t) => h('li', {}, inline(t))));
    return h('p', {}, inline(b.text));
  });
}

export function renderEntries(entries, current = SITE_VERSION) {
  return h('div', { class: 'changelog', dataset: { testid: 'changelog-list' } },
    entries.map((e, i) => h('details', { class: 'changelog__entry', open: e.version === current || (i === 0 && !entries.some((x) => x.version === current)), dataset: { version: e.version } },
      h('summary', { class: 'changelog__summary' },
        h('span', { class: 'changelog__ver' }, `v${e.version}`),
        e.version === current ? h('span', { class: 'changelog__badge' }, 'Current') : null,
        e.date ? h('span', { class: 'changelog__date' }, e.date) : null),
      h('div', { class: 'changelog__body' }, e.error ? h('p', { class: 'muted' }, 'Notes could not be loaded.') : renderBlocks(e.blocks)))));
}

export function openChangelog({ onSeen } = {}) {
  const body = h('div', { class: 'changelog-wrap' }, flaskLoader({ size: 48, label: 'Loading release notes…' }));
  const modal = openModal({ title: "What's new", body, wide: true, testid: 'changelog-modal', actions: [{ label: 'Close', variant: 'primary', autofocus: true }] });
  markChangelogSeen();
  onSeen?.();
  fetchChangelog()
    .then((entries) => body.replaceChildren(renderEntries(entries)))
    .catch(() => body.replaceChildren(h('p', { class: 'muted' }, 'Release notes could not be loaded. Check your connection and try again.')));
  return modal;
}
