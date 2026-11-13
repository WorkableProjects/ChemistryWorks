// Admin › Tags: local tags (this device), your tags on the Sheet, and other teachers' shared tags (read-only).
import { h, mount, toast, openModal } from '../../ui.js';
import { saveSheetTag, deleteSheetTag, mergeSheetTags } from '../../lib/api.js';
import { hasAdminAuth } from '../../lib/admin-session.js';
import { localTags, createLocalTag, updateLocalTag, deleteLocalTag, TAG_COLORS } from '../../lib/tags.js';
import { field } from './common.js';
import { tagChip, teacherEmail, sheetTagsResource } from './tag-picker.js';

const COLOR_LABELS = { navy: 'Navy', teal: 'Teal', green: 'Green', amber: 'Amber', red: 'Red', violet: 'Violet', slate: 'Slate' };

export function renderTags(root, ctx) {
  const gasUrl = ctx.config.GAS_WEB_APP_URL;
  const email = teacherEmail();
  const sheet = sheetTagsResource();
  let alive = true;
  const host = h('div', { class: 'stack', dataset: { testid: 'admin-tags' } });

  const colorSelect = (value) => h('select', { class: 'select', 'aria-label': 'Colour' },
    TAG_COLORS.map((c) => h('option', { value: c, selected: c === value }, COLOR_LABELS[c])));

  function editDialog(tag, { onSave }) {
    const name = h('input', { class: 'input', value: tag.name, maxlength: '60', dataset: { testid: 'tag-name-input' } });
    const color = colorSelect(tag.color);
    openModal({
      title: 'Edit tag', testid: 'tag-edit',
      body: h('div', { class: 'stack' }, field('Name', name), field('Colour', color)),
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        { label: 'Save', variant: 'primary', testid: 'tag-save', onClick: async (close) => { close(); await onSave({ name: name.value, color: color.value }); } },
      ],
    });
  }

  function mergeDialog(tag, mine) {
    const others = mine.filter((t) => t.id !== tag.id);
    if (!others.length) { toast('You need another tag on the Sheet to merge into.', { type: 'info' }); return; }
    const into = h('select', { class: 'select', dataset: { testid: 'tag-merge-into' } }, others.map((t) => h('option', { value: t.id }, t.name)));
    openModal({
      title: `Merge “${tag.name}”`, testid: 'tag-merge',
      body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Questions in your published tests move to the tag you pick. Other teachers’ tests keep working.'), field('Merge into', into)),
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        { label: 'Merge', variant: 'primary', testid: 'tag-merge-confirm', onClick: async (close) => {
          close();
          const res = await mergeSheetTags({ gasUrl, from: tag.id, into: into.value });
          toast(res.ok ? 'Tags merged' : `Merge failed: ${res.error}`, { type: res.ok ? 'success' : 'error' });
          if (res.ok) sheet.refresh?.();
        } },
      ],
    });
  }

  const actionBtn = (label, onClick, testid, variant = 'subtle') => h('button', { class: `btn btn--${variant} btn--sm`, type: 'button', dataset: { testid }, on: { click: onClick } }, label);

  function row(tag, actions, meta) {
    return h('li', { class: 'tags-row', dataset: { testid: `tag-row-${tag.id}` } }, tagChip(tag), meta ? h('span', { class: 'muted tags-row__meta' }, meta) : null,
      h('span', { class: 'spacer' }), ...actions);
  }

  function paint() {
    if (!alive) return;
    const local = localTags(email).filter((t) => !t.onSheet);
    const onSheet = sheet.peek() || [];
    const mine = onSheet.filter((t) => t.mine);
    const shared = onSheet.filter((t) => !t.mine);
    const newName = h('input', { class: 'input', placeholder: 'New tag name', maxlength: '60', dataset: { testid: 'tag-new-name' } });
    const create = () => { const t = createLocalTag(email, { name: newName.value }); if (t) { toast(`Tag “${t.name}” created`, { type: 'success' }); paint(); } };
    newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
    const usage = (t) => `Used in ${t.questions} question${t.questions === 1 ? '' : 's'} across ${t.tests} published test${t.tests === 1 ? '' : 's'}`;

    mount(host,
      h('header', { class: 'stack-sm' }, h('h1', { class: 'adm-h2' }, 'Tags'),
        h('p', { class: 'muted' }, 'A tag stays on this device until a published test uses it. Then it is shared with every teacher through the Sheet.')),
      h('section', { class: 'card stack', 'aria-label': 'Local tags' },
        h('h2', { class: 'adm-h3' }, 'On this device'),
        h('div', { class: 'row' }, newName, actionBtn('Create tag', create, 'tag-create-btn', 'primary')),
        local.length ? h('ul', { class: 'tags-list' }, local.map((t) => row(t, [
          actionBtn('Edit', () => editDialog(t, { onSave: (p) => { updateLocalTag(email, t.id, p); paint(); } }), `tag-edit-${t.id}`),
          actionBtn('Delete', () => { deleteLocalTag(email, t.id); paint(); }, `tag-delete-${t.id}`),
        ]))) : h('p', { class: 'muted' }, 'No local tags.')),
      h('section', { class: 'card stack', 'aria-label': 'Your tags on the Sheet' },
        h('h2', { class: 'adm-h3' }, 'Yours on the Sheet'),
        !gasUrl || !hasAdminAuth() ? h('p', { class: 'muted' }, 'Sign in as an admin to see tags on the Sheet.')
          : mine.length ? h('ul', { class: 'tags-list' }, mine.map((t) => row(t, [
            actionBtn('Edit', () => editDialog(t, { onSave: async (p) => {
              const res = await saveSheetTag({ gasUrl, tag: { id: t.id, ...p } });
              toast(res.ok ? 'Tag updated everywhere' : `Save failed: ${res.error}`, { type: res.ok ? 'success' : 'error' });
              if (res.ok) sheet.refresh?.();
            } }), `tag-edit-${t.id}`),
            actionBtn('Merge', () => mergeDialog(t, mine), `tag-merge-${t.id}`),
            actionBtn('Delete', async () => {
              const res = await deleteSheetTag({ gasUrl, id: t.id });
              toast(res.ok ? 'Tag deleted. Old results keep its name.' : `Delete failed: ${res.error}`, { type: res.ok ? 'success' : 'error' });
              if (res.ok) sheet.refresh?.();
            }, `tag-delete-${t.id}`),
          ], usage(t)))) : h('p', { class: 'muted' }, 'None yet. Publish a test with tagged questions.')),
      h('section', { class: 'card stack', 'aria-label': 'Shared tags' },
        h('h2', { class: 'adm-h3' }, 'Shared by other teachers'),
        shared.length ? h('ul', { class: 'tags-list' }, shared.filter((t) => t.tests > 0).map((t) => row(t, [], `${t.ownerEmail} · ${usage(t)}`)))
          : h('p', { class: 'muted' }, 'No shared tags yet.')));
  }

  const unsub = sheet.subscribe(() => paint());
  paint();
  if (gasUrl && hasAdminAuth()) sheet.get().catch(() => {});
  mount(root, host);
  return () => { alive = false; unsub(); };
}
