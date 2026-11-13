// Tag picker for one question (builder) plus small shared tag helpers for admin views.
// "Your tags" = local tags + Sheet tags you own; "Shared tags" = Sheet tags other teachers own (use only).
import { h, mount } from '../../ui.js';
import { tagChip } from '../tag-chip.js';
import { CONFIG } from '../../config.js';
import { resource } from '../../lib/store.js';
import { listTags } from '../../lib/api.js';
import { confirmedAdminEmail, hasAdminAuth } from '../../lib/admin-session.js';
import { getUser } from '../../lib/auth.js';
import { createLocalTag, tagLookup, MAX_TAGS } from '../../lib/tags.js';

/** The teacher whose local tags this device shows. */
export function teacherEmail() {
  return confirmedAdminEmail() || getUser()?.email || '';
}

/** Sheet tags, cached for the session (one listTags read). Empty when the backend is not reachable. */
export function sheetTagsResource() {
  return resource('tags', { ttl: 120000, fetch: async () => {
    if (!CONFIG.GAS_WEB_APP_URL || !hasAdminAuth()) return [];
    const res = await listTags({ gasUrl: CONFIG.GAS_WEB_APP_URL });
    if (!res.ok) throw new Error(res.error || 'Could not load tags');
    return res.data.tags || [];
  } });
}

/** Current lookup Map(id -> tag) from local storage and whatever Sheet tags are cached. */
export function currentLookup(extraIndex = {}) {
  return tagLookup({ email: teacherEmail(), sheet: sheetTagsResource().peek() || [], index: extraIndex });
}

export { tagChip };

/** Picker for q.tags. Type to search; Enter creates a local tag when nothing matches. */
export function tagPicker(q, onChange) {
  const email = teacherEmail();
  const sheet = sheetTagsResource();
  sheet.get().catch(() => {});
  const chips = h('div', { class: 'tag-picker__chips', dataset: { testid: 'q-tags' } });
  const input = h('input', { class: 'input tag-picker__input', type: 'text', placeholder: 'Add a tag', autocomplete: 'off', 'aria-label': 'Add a tag',
    role: 'combobox', 'aria-expanded': 'false', 'aria-autocomplete': 'list', dataset: { testid: 'q-tag-input' } });
  const listId = `tag-list-${Math.random().toString(36).slice(2, 8)}`;
  const list = h('div', { class: 'tag-picker__list', id: listId, role: 'listbox', hidden: true });
  input.setAttribute('aria-controls', listId);

  const options = () => {
    const look = tagLookup({ email, sheet: sheet.peek() || [] });
    const all = [...look.values()];
    return { look, mine: all.filter((t) => t.mine), shared: all.filter((t) => !t.mine) };
  };
  const add = (id) => {
    const cur = Array.isArray(q.tags) ? q.tags : [];
    if (cur.includes(id) || cur.length >= MAX_TAGS) return;
    q.tags = [...cur, id];
    input.value = '';
    draw();
    onChange();
  };
  const remove = (id) => {
    q.tags = (q.tags || []).filter((x) => x !== id);
    if (!q.tags.length) delete q.tags;
    draw();
    onChange();
  };
  const option = (t) => h('button', { class: 'tag-picker__opt', type: 'button', role: 'option', dataset: { testid: `tag-option-${t.id}` },
    on: { mousedown: (e) => e.preventDefault(), click: () => add(t.id) } }, tagChip(t));
  const drawList = () => {
    const term = input.value.trim().toLowerCase();
    const { mine, shared } = options();
    const used = new Set(q.tags || []);
    const match = (t) => !used.has(t.id) && (!term || t.name.toLowerCase().includes(term));
    const a = mine.filter(match), b = shared.filter(match);
    const exact = [...mine, ...shared].some((t) => t.name.toLowerCase() === term);
    const groups = [];
    if (a.length) groups.push(h('p', { class: 'tag-picker__group' }, 'Your tags'), ...a.map(option));
    if (b.length) groups.push(h('p', { class: 'tag-picker__group' }, 'Shared tags'), ...b.map(option));
    if (term && !exact) groups.push(h('button', { class: 'tag-picker__opt tag-picker__new', type: 'button', role: 'option', dataset: { testid: 'tag-create' },
      on: { mousedown: (e) => e.preventDefault(), click: () => createAndAdd() } }, `Create “${input.value.trim()}”`));
    mount(list, groups);
    list.hidden = !groups.length || document.activeElement !== input;
    input.setAttribute('aria-expanded', String(!list.hidden));
  };
  const createAndAdd = () => {
    const t = createLocalTag(email, { name: input.value });
    if (t) add(t.id);
  };
  const draw = () => {
    const { look } = options();
    mount(chips, (q.tags || []).map((id) => tagChip(look.get(id) || { name: 'Unknown tag', color: 'slate' }, { onRemove: () => remove(id) })));
    input.disabled = (q.tags || []).length >= MAX_TAGS;
    drawList();
  };
  input.addEventListener('input', drawList);
  input.addEventListener('focus', drawList);
  input.addEventListener('blur', () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const term = input.value.trim().toLowerCase();
      if (!term) return;
      const { mine, shared } = options();
      const hit = [...mine, ...shared].find((t) => t.name.toLowerCase() === term);
      if (hit) add(hit.id); else createAndAdd();
    } else if (e.key === 'Escape') { list.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  });
  const unsub = sheet.subscribe(() => draw());
  draw();
  const wrap = h('div', { class: 'field tag-picker' }, h('span', { class: 'field__label' }, 'Tags'), chips, h('div', { class: 'tag-picker__box' }, input, list));
  wrap._cleanup = () => unsub?.();
  return wrap;
}
