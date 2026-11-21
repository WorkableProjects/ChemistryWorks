// Builder tag UI: the chip, the per-question picker, the list filter bar and the "Apply tag" dialog.
// Tags live in js/lib/tags.js (local store + Sheet tags). A question holds tag ids only.

import { h, mount, icon, toast, openModal } from '../../../ui.js';
import { ensureCss } from '../../../lib/css-loader.js';
import { hasAdminAuth } from '../../../lib/admin-session.js';
import { MAX_TAGS_PER_QUESTION } from '../../../lib/schema.js';
import { createTag, resolve, pickerGroups, sheetTagsResource, TAG_NAME_MAX } from '../../../lib/tags.js';

let uidTag = 0;

/** A tag chip: the tag colour as tint and ink (tokens in css/base.css). `onRemove` adds a remove button. */
export function tagChip(rec, { onRemove = null, testid = `tag-chip-${rec.id}` } = {}) {
  ensureCss('tags');
  return h('span', { class: ['tag-chip', rec.unknown && 'is-unknown'], dataset: { color: rec.color, testid, tagId: rec.id },
    title: rec.unknown ? 'This tag is not on this device or the Sheet' : (rec.description || rec.name) },
  h('span', { class: 'tag-chip__name' }, rec.name),
  onRemove ? h('button', { class: 'tag-chip__x', type: 'button', 'aria-label': `Remove tag ${rec.name}`, dataset: { testid: `tag-remove-${rec.id}` }, on: { click: onRemove } }, icon('x', { size: 12 })) : null);
}

/**
 * One shared hub per builder: loads the Sheet tags once and tells every live picker to redraw when they arrive.
 * Pickers that left the page drop out on the next notification.
 */
function tagsHub(bc) {
  if (bc.tagsHub) return bc.tagsHub;
  const hub = { subs: new Set(), notify() { for (const fn of [...hub.subs]) fn(); } };
  bc.tagsHub = hub;
  if (bc.gasUrl && hasAdminAuth()) {
    const res = sheetTagsResource(bc.gasUrl);
    const unsub = res.subscribe(() => hub.notify());
    bc.cleanups.push(unsub);
    res.get({ force: true }).catch(() => { /* local tags still work */ }); // cached names show at once; fresh ones replace them
  }
  return hub;
}

const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** The "Tags" control of one question: its chips, and a type-to-search box that offers Your tags and Shared tags. */
export function tagPicker(bc, q) {
  ensureCss('tags');
  const uid = ++uidTag;
  const listId = `tagpick-list-${uid}`;
  const chips = h('div', { class: 'tagpick__chips', dataset: { testid: 'q-tag-chips' } });
  const list = h('div', { class: 'tagpick__list', id: listId, role: 'listbox', 'aria-label': 'Tags', hidden: true, dataset: { testid: 'q-tag-list' } });
  const input = h('input', { class: 'input tagpick__input', id: `tagpick-input-${uid}`, type: 'text', autocomplete: 'off', spellcheck: 'false', maxlength: TAG_NAME_MAX,
    placeholder: 'Type to search, Enter to add or create', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-autocomplete': 'list', dataset: { testid: 'q-tag-input' } });
  let options = []; // [{ el, act }] in display order
  let active = -1;

  const ids = () => (Array.isArray(q.tags) ? q.tags : []);
  const save = (next) => { if (next.length) q.tags = next; else delete q.tags; bc.changed(); bc.onTagsChanged?.(); drawChips(); if (!list.hidden) drawList(); };
  const add = (id) => {
    if (ids().includes(id)) { input.value = ''; return; }
    if (ids().length >= MAX_TAGS_PER_QUESTION) { toast(`A question can have up to ${MAX_TAGS_PER_QUESTION} tags`, { type: 'error' }); return; }
    input.value = '';
    save([...ids(), id]);
  };
  const remove = (id) => save(ids().filter((x) => x !== id));
  function drawChips() {
    mount(chips, resolve(ids()).map((r) => tagChip(r, { onRemove: () => remove(r.id) })));
  }

  const setActive = (i) => {
    active = options.length ? (i + options.length) % options.length : -1;
    options.forEach((o, k) => { o.el.classList.toggle('is-active', k === active); o.el.setAttribute('aria-selected', String(k === active)); });
    if (active >= 0) input.setAttribute('aria-activedescendant', options[active].el.id); else input.removeAttribute('aria-activedescendant');
    options[active]?.el.scrollIntoView?.({ block: 'nearest' });
  };
  function drawList() {
    const text = input.value.trim().toLowerCase();
    const groups = pickerGroups();
    const taken = new Set(ids());
    const match = (r) => !taken.has(r.id) && (!text || r.name.toLowerCase().includes(text));
    const nodes = [];
    options = [];
    const addOption = (label, act, testid, sub) => {
      const el = h('button', { class: 'tagpick__opt', type: 'button', role: 'option', id: `${listId}-${options.length}`, 'aria-selected': 'false', tabindex: '-1', dataset: { testid }, on: { click: act, mousedown: (e) => e.preventDefault() } }, label, sub ? h('span', { class: 'tagpick__sub' }, sub) : null);
      options.push({ el, act });
      return el;
    };
    for (const [title, rows, kind] of [['Your tags', groups.mine.filter(match), 'mine'], ['Shared tags', groups.shared.filter(match), 'shared']]) {
      if (!rows.length) continue;
      nodes.push(h('div', { class: 'tagpick__group', role: 'group', 'aria-label': title, dataset: { testid: `tag-group-${kind}` } },
        h('div', { class: 'tagpick__head' }, title),
        rows.map((r) => addOption([tagChip(r, { testid: `tag-option-chip-${r.id}` })], () => add(r.id), `tag-option-${r.id}`, kind === 'shared' && r.owner ? `by ${r.owner}` : ''))));
    }
    const exact = [...groups.mine, ...groups.shared].some((r) => sameName(r.name, input.value));
    if (input.value.trim() && !exact) {
      nodes.push(h('div', { class: 'tagpick__group' }, addOption([icon('plus', { size: 14 }), ` Create “${input.value.trim()}”`], () => create(), 'tag-create')));
    }
    if (!nodes.length) nodes.push(h('p', { class: 'tagpick__empty faint' }, text ? 'No matching tags.' : 'No tags yet. Type a name to create one.'));
    mount(list, nodes);
    active = -1;
    input.removeAttribute('aria-activedescendant'); // Enter adds an exact match or creates the typed name; arrow keys pick another option
  }
  function create() {
    try { add(createTag({ name: input.value }).id); } catch (e) { toast(e.message, { type: 'error' }); }
  }
  const openList = () => { list.hidden = false; input.setAttribute('aria-expanded', 'true'); drawList(); };
  const closeList = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };

  input.addEventListener('focus', openList);
  input.addEventListener('input', openList);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) openList(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Escape') { if (!list.hidden) { e.preventDefault(); e.stopPropagation(); closeList(); } }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const text = input.value.trim();
      if (active >= 0 && options[active]) { options[active].act(); return; }
      if (!text) return;
      const all = [...pickerGroups().mine, ...pickerGroups().shared];
      const hit = all.find((r) => sameName(r.name, text));
      if (hit) add(hit.id); else create();
    }
  });
  input.addEventListener('blur', () => setTimeout(() => { if (!wrap.contains(document.activeElement)) closeList(); }, 120));

  const wrap = h('div', { class: 'tagpick', dataset: { testid: 'q-tags' } },
    chips, h('div', { class: 'tagpick__field' }, input, list));
  const hub = tagsHub(bc);
  const redraw = () => {
    if (!wrap.isConnected) { hub.subs.delete(redraw); return; }
    drawChips();
    if (!list.hidden) drawList();
  };
  hub.subs.add(redraw);
  drawChips();
  return h('div', { class: 'field' }, h('label', { class: 'field__label', for: input.id }, 'Tags'), wrap,
    h('span', { class: 'field__hint' }, 'Tags help you find questions later. Students never see them.'));
}

/**
 * The bar above the question list: filter by tag, and the "Apply tag" action for the selected questions.
 * `used` is the resolved tags the test uses. `filter` is '' (all), 'none' or a tag id.
 */
export function tagBar({ used, filter, selected, shown, onFilter, onSelectShown, onApply, onClear }) {
  ensureCss('tags');
  const sel = h('select', { class: 'select adm-select-sm', 'aria-label': 'Filter questions by tag', dataset: { testid: 'tag-filter' }, on: { change: () => onFilter(sel.value) } },
    h('option', { value: '' }, 'All questions'),
    h('option', { value: 'none' }, 'No tag'),
    used.map((r) => h('option', { value: r.id }, r.name)));
  sel.value = filter && (filter === 'none' || used.some((r) => r.id === filter)) ? filter : '';
  const all = h('input', { type: 'checkbox', 'aria-label': 'Select every question shown', checked: shown > 0 && selected === shown, dataset: { testid: 'q-select-all' }, on: { change: () => onSelectShown(all.checked) } });
  return h('div', { class: 'tagbar', dataset: { testid: 'tag-bar' } },
    h('label', { class: 'tagbar__all' }, all, h('span', {}, 'Select all')),
    sel,
    h('span', { class: 'spacer' }),
    h('span', { class: 'muted tagbar__count', role: 'status', dataset: { testid: 'q-selected-count' } }, selected ? `${selected} selected` : ''),
    h('button', { class: 'btn btn--ghost btn--sm', type: 'button', disabled: !selected, dataset: { testid: 'tag-apply' }, on: { click: onApply } }, 'Apply tag'),
    selected ? h('button', { class: 'btn btn--subtle btn--sm', type: 'button', on: { click: onClear } }, 'Clear') : null);
}

/** Dialog for "Apply tag": pick a tag (or type a new local one) and add it to `count` questions. */
export function applyTagDialog({ count, onApply }) {
  ensureCss('tags');
  const groups = pickerGroups();
  const select = h('select', { class: 'select', 'aria-label': 'Tag to apply', dataset: { testid: 'apply-tag-select' } },
    h('option', { value: '' }, 'Choose a tag'),
    groups.mine.length ? h('optgroup', { label: 'Your tags' }, groups.mine.map((r) => h('option', { value: r.id }, r.name))) : null,
    groups.shared.length ? h('optgroup', { label: 'Shared tags' }, groups.shared.map((r) => h('option', { value: r.id }, r.name))) : null);
  const name = h('input', { class: 'input', type: 'text', maxlength: TAG_NAME_MAX, placeholder: 'Or a new tag name', dataset: { testid: 'apply-tag-new' } });
  openModal({
    title: `Apply a tag to ${count} question${count === 1 ? '' : 's'}`, testid: 'apply-tag-modal',
    body: h('div', { class: 'stack' }, select, name),
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      { label: 'Apply tag', variant: 'primary', testid: 'apply-tag-go', onClick: (close) => {
        let id = select.value;
        if (name.value.trim()) {
          try { id = createTag({ name: name.value }).id; } catch (e) { toast(e.message, { type: 'error' }); return; }
        }
        if (!id) { toast('Choose a tag or type a name', { type: 'error' }); return; }
        close();
        onApply(id);
      } },
    ],
  });
}
