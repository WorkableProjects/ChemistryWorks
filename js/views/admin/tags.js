// Admin > Tags: three sections.
//   Local            tags on this device that no published test uses yet: rename, recolour, delete.
//   On the Sheet     tags you own that a published test used: rename, recolour, merge, delete, with usage counts.
//   Shared           other teachers' tags: read-only, with the owner.
// Local tags work without the backend; the two Sheet sections need it.

import { h, mount, icon, toast, openModal } from '../../ui.js';
import { ensureCss } from '../../lib/css-loader.js';
import { hasAdminAuth } from '../../lib/admin-session.js';
import { saveTag, deleteTag, mergeTags } from '../../lib/api.js';
import {
  TAG_COLORS, TAG_NAME_MAX, TAG_DESCRIPTION_MAX, listLocal, createTag, updateLocalTag, deleteLocalTag,
  sheetTagsResource, currentEmail, writeLocal,
} from '../../lib/tags.js';
import { field, emptyState, skeleton } from './common.js';
import { tagChip } from './builder/tag-picker.js';

const lower = (s) => String(s || '').trim().toLowerCase();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Name, colour and description in one dialog. `onSave({ name, color, description })` returns a promise that resolves true to close. */
function tagDialog({ title, tag = {}, withDescription = true, onSave, testid = 'tag-modal' }) {
  const name = h('input', { class: 'input', type: 'text', maxlength: TAG_NAME_MAX, value: tag.name || '', dataset: { testid: 'tag-name' } });
  const desc = h('input', { class: 'input', type: 'text', maxlength: TAG_DESCRIPTION_MAX, value: tag.description || '', dataset: { testid: 'tag-description' } });
  let color = TAG_COLORS.includes(tag.color) ? tag.color : TAG_COLORS[0];
  const swatches = h('div', { class: 'tag-swatches', role: 'radiogroup', 'aria-label': 'Colour' }, TAG_COLORS.map((c) => {
    const b = h('button', { class: 'tag-swatch', type: 'button', role: 'radio', 'aria-checked': String(c === color), 'aria-label': c, dataset: { color: c, testid: `tag-color-${c}` }, on: { click: () => {
      color = c;
      swatches.querySelectorAll('.tag-swatch').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.color === color)));
    } } });
    return b;
  }));
  const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
  openModal({
    title, testid,
    body: h('div', { class: 'stack' }, field('Name', name), field('Colour', swatches), withDescription ? field('Description (optional)', desc) : null, error),
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      { label: 'Save', variant: 'primary', testid: 'tag-save', onClick: async (close) => {
        if (!name.value.trim()) { error.textContent = 'A tag needs a name.'; error.hidden = false; name.focus(); return; }
        if (await onSave({ name: name.value.trim(), color, description: desc.value.trim() })) close();
      } },
    ],
  });
  setTimeout(() => name.focus(), 50);
}

function confirm({ title, body, label = 'Delete', testid, onConfirm }) {
  openModal({ title, body, testid, actions: [
    { label: 'Cancel', variant: 'ghost', autofocus: true },
    { label, variant: 'danger', testid: 'confirm-action', onClick: (close) => { close(); onConfirm(); } },
  ] });
}

export function renderTags(root, ctx, { goSettings, go } = {}) {
  ensureCss('tags');
  const gasUrl = ctx.config.GAS_WEB_APP_URL;
  const online = !!gasUrl && hasAdminAuth();
  const email = currentEmail();
  let alive = true;
  const res = sheetTagsResource(gasUrl);
  const localBox = h('section', { class: 'card adm-section stack', 'aria-label': 'Local tags', dataset: { testid: 'tags-local' } });
  const mineBox = h('section', { class: 'card adm-section stack', 'aria-label': 'Tags on the Sheet', dataset: { testid: 'tags-mine' } });
  const sharedBox = h('section', { class: 'card adm-section stack', 'aria-label': 'Shared tags', dataset: { testid: 'tags-shared' } });

  const head = (title, hint, extra) => h('div', { class: 'adm-section__head' }, h('div', {}, h('h3', { class: 'adm-h3' }, title), h('p', { class: 'muted' }, hint)), extra || null);
  const row = (rec, actions, sub, testid) => h('div', { class: 'tag-row', dataset: { testid } },
    tagChip(rec, { testid: `${testid}-chip` }),
    h('span', { class: 'tag-row__sub muted' }, sub || ''),
    h('span', { class: 'spacer' }),
    actions);

  /* ------------------------------------------------------------ local */
  function paintLocal() {
    const local = listLocal(email).filter((t) => !t.onSheet);
    const newBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'tag-new' }, on: { click: () => tagDialog({
      title: 'New local tag', onSave: async (v) => { createTag(v, { email }); paintLocal(); return true; },
    }) } }, icon('plus', { size: 14 }), 'New tag');
    const body = local.length
      ? h('div', { class: 'stack' }, local.map((t) => row({ ...t, source: 'local' }, [
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `tag-edit-${t.id}` }, on: { click: () => tagDialog({
          title: 'Edit tag', tag: t, onSave: async (v) => { updateLocalTag(t.id, v, { email }); paintLocal(); return true; },
        }) } }, 'Edit'),
        h('button', { class: 'btn btn--subtle btn--sm', type: 'button', 'aria-label': `Delete tag ${t.name}`, dataset: { testid: `tag-delete-${t.id}` }, on: { click: () => confirm({
          title: `Delete the tag "${t.name}"?`, body: 'Questions that use it will show "Unknown tag" until you remove it from them.', testid: 'confirm-delete-tag',
          onConfirm: () => { deleteLocalTag(t.id, { email }); paintLocal(); },
        }) } }, icon('trash', { size: 14 })),
      ], 'On this device only', `tag-local-${t.id}`)))
      : h('div', { class: 'tag-empty', dataset: { testid: 'tags-local-empty' } }, h('p', { class: 'muted' }, 'No local tags. Tags you make in the builder stay on this device until a published test uses them.'), newBtn);
    mount(localBox, head('Local', 'On this device, until a published test uses them.', local.length ? newBtn : null), body);
  }

  /* ------------------------------------------------------------ Sheet */
  async function run(label, p) {
    const r = await p;
    if (!r.ok) { toast(`${label} failed: ${r.error}`, { type: 'error', timeout: 6000 }); return false; }
    await res.refresh();
    return true;
  }
  const cacheLocal = (id, patch) => {
    const list = listLocal(email);
    const i = list.findIndex((t) => t.id === id);
    if (i >= 0) { list[i] = { ...list[i], ...patch }; writeLocal(list, email); }
  };

  const dropLocal = (id) => writeLocal(listLocal(email).filter((t) => t.id !== id), email);

  function paintSheet() {
    const all = res.peek();
    if (!online) {
      const msg = emptyState('key', 'Connect the backend to see Sheet tags', 'Tags on the Sheet are shared by every teacher. Sign in as an admin or enter the admin key in Settings.', 'tags-no-auth');
      mount(mineBox, head('On the Sheet, mine', 'Tags you own that a published test used.'), msg, goSettings ? h('button', { class: 'btn btn--primary btn--sm', type: 'button', on: { click: goSettings } }, 'Open Settings') : null);
      mount(sharedBox, head('Shared', 'Tags other teachers own. You can use them, not change them.'), h('p', { class: 'muted' }, 'Connect the backend to see them.'));
      return;
    }
    if (!all) { mount(mineBox, head('On the Sheet, mine', 'Tags you own that a published test used.'), skeleton(2)); mount(sharedBox, head('Shared', 'Tags other teachers own. You can use them, not change them.'), skeleton(2)); return; }
    const live = all.filter((t) => !t.mergedInto);
    const mine = live.filter((t) => lower(t.ownerEmail) === lower(email));
    const shared = live.filter((t) => lower(t.ownerEmail) !== lower(email));
    const usage = (t) => `${plural(t.usage?.questions || 0, 'question', 'questions')} in ${plural(t.usage?.tests || 0, 'test', 'tests')}`;

    mount(mineBox, head('On the Sheet, mine', 'Tags you own that a published test used. Changes show for every teacher.'),
      mine.length ? h('div', { class: 'stack' }, mine.map((t) => row({ ...t, source: 'sheet' }, [
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `tag-edit-${t.id}` }, on: { click: () => tagDialog({
          title: 'Edit tag', tag: t, onSave: async (v) => {
            const ok = await run('Save', saveTag({ gasUrl, tag: { id: t.id, ...v } }));
            if (ok) cacheLocal(t.id, v);
            return ok;
          },
        }) } }, 'Edit'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', disabled: mine.length < 2, title: mine.length < 2 ? 'You need another tag to merge into' : '', dataset: { testid: `tag-merge-${t.id}` }, on: { click: () => mergeDialog(t, mine) } }, 'Merge'),
        h('button', { class: 'btn btn--subtle btn--sm', type: 'button', 'aria-label': `Delete tag ${t.name}`, dataset: { testid: `tag-delete-${t.id}` }, on: { click: () => confirm({
          title: `Delete the tag "${t.name}"?`, body: 'It disappears from the picker for everyone. Old results keep its name.', testid: 'confirm-delete-tag',
          onConfirm: async () => { if (await run('Delete', deleteTag({ gasUrl, id: t.id }))) dropLocal(t.id); },
        }) } }, icon('trash', { size: 14 })),
      ], usage(t), `tag-mine-${t.id}`)))
        : h('div', { class: 'tag-empty', dataset: { testid: 'tags-mine-empty' } }, h('p', { class: 'muted' }, 'None of your tags are on the Sheet yet. Publish a test that uses a tag to put it there.'),
          go ? h('button', { class: 'btn btn--primary btn--sm', type: 'button', on: { click: () => go('builder') } }, 'Open the builder') : null));

    mount(sharedBox, head('Shared', 'Tags other teachers own. You can use them in the builder, not change them.'),
      shared.length ? h('div', { class: 'stack' }, shared.map((t) => row({ ...t, source: 'sheet', mine: false }, null,
        `by ${t.ownerName || String(t.ownerEmail || '').split('@')[0] || 'another teacher'} · ${usage(t)}`, `tag-shared-${t.id}`)))
        : h('div', { class: 'tag-empty', dataset: { testid: 'tags-shared-empty' } }, h('p', { class: 'muted' }, 'No one else has shared a tag yet.')));
  }

  function mergeDialog(from, mine) {
    const targets = mine.filter((t) => t.id !== from.id);
    const sel = h('select', { class: 'select', 'aria-label': 'Merge into', dataset: { testid: 'tag-merge-into' } }, targets.map((t) => h('option', { value: t.id }, t.name)));
    openModal({
      title: `Merge "${from.name}" into another tag`, testid: 'tag-merge-modal',
      body: h('div', { class: 'stack' }, field('Merge into', sel), h('p', { class: 'faint' }, `Your published tests that use "${from.name}" switch to the tag you pick, and "${from.name}" is removed. Other teachers' tests keep working.`)),
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        { label: 'Merge', variant: 'primary', testid: 'tag-merge-go', onClick: async (close) => {
          const r = await mergeTags({ gasUrl, from: from.id, into: sel.value });
          if (!r.ok) { toast(`Merge failed: ${r.error}`, { type: 'error', timeout: 6000 }); return; }
          close();
          await res.refresh();
          toast(`Merged. ${plural(r.data.rewrittenQuestions || 0, 'question', 'questions')} in ${plural(r.data.rewrittenTests || 0, 'test', 'tests')} updated.`, { type: 'success' });
        } },
      ],
    });
  }

  const unsub = res.subscribe(() => { if (alive) paintSheet(); });
  paintLocal();
  paintSheet();
  if (online) res.get().catch((e) => { if (alive && res.peek() === undefined) mount(mineBox, h('p', { class: 'notice notice--error' }, icon('alert'), h('span', {}, `Could not load tags: ${e.message}`))); });

  mount(root, h('div', { class: 'stack adm-tags', dataset: { testid: 'tags-view' } },
    h('h2', { class: 'adm-h2' }, 'Tags'), localBox, mineBox, sharedBox));
  return () => { alive = false; unsub(); res.cancel(); };
}
