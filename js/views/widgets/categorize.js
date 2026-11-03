// Student widget for `categorize` (V3-05): every item card has a <select> to choose its group, so it works with
// keyboard, touch and screen readers. Dragging a card onto a group is an optional extra for mouse users.
// Contract (see runner.js): returns { el, refresh(answer), focus() }. Answer = { itemId: categoryId }.
import { h } from '../../ui.js';

export function categorizeWidget(q, api) {
  const items = Array.isArray(q.items) ? q.items : [];
  const cats = Array.isArray(q.categories) ? q.categories : [];
  const cards = new Map();
  const selects = new Map();
  const current = () => (api.get(q.id) && typeof api.get(q.id) === 'object' && !Array.isArray(api.get(q.id)) ? api.get(q.id) : {});

  function assign(itemId, catId) {
    const next = { ...current() };
    if (catId) next[itemId] = catId; else delete next[itemId];
    api.set(q.id, Object.keys(next).length ? next : undefined);
  }

  const makeCard = (it) => {
    const sel = h('select', {
      class: 'select q-cat__select', 'aria-label': `Group for ${it.text}`, dataset: { testid: `cat-select-${it.id}` },
      on: { change: () => assign(it.id, sel.value) },
    }, h('option', { value: '' }, 'Choose a group…'), cats.map((c) => h('option', { value: c.id }, c.label)));
    selects.set(it.id, sel);
    const card = h('div', {
      class: 'q-cat__card', draggable: 'true', dataset: { testid: `cat-item-${it.id}`, itemId: it.id },
      on: {
        dragstart: (e) => { try { e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'move'; } catch { /* ignore */ } card.classList.add('is-dragging'); },
        dragend: () => card.classList.remove('is-dragging'),
      },
    }, h('span', { class: 'q-cat__text' }, it.text), sel);
    cards.set(it.id, card);
    return card;
  };

  const zone = (id, title, testid) => {
    const list = h('div', { class: 'q-cat__list', dataset: { testid } });
    const el = h('section', {
      class: 'q-cat__bin', 'aria-label': title,
      on: {
        dragover: (e) => { e.preventDefault(); el.classList.add('is-over'); },
        dragleave: () => el.classList.remove('is-over'),
        drop: (e) => {
          e.preventDefault();
          el.classList.remove('is-over');
          let itemId = '';
          try { itemId = e.dataTransfer.getData('text/plain'); } catch { /* ignore */ }
          if (cards.has(itemId)) assign(itemId, id);
        },
      },
    }, h('h3', { class: 'q-cat__title' }, title), list);
    return { el, list };
  };

  const pool = zone('', 'Not sorted yet', 'cat-pool');
  const bins = new Map(cats.map((c) => [c.id, zone(c.id, c.label, `cat-bin-${c.id}`)]));
  items.forEach((it) => pool.list.append(makeCard(it)));

  return {
    el: h('div', { class: 'q-categorize' },
      h('p', { class: 'q-hint' }, 'Choose a group for each item from its menu. You can also drag an item onto a group.'),
      pool.el,
      h('div', { class: 'q-cat__bins' }, [...bins.values()].map((b) => b.el))),
    refresh(answer) {
      const a = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {};
      const active = document.activeElement;
      for (const it of items) {
        const target = bins.get(a[it.id]) || pool;
        const card = cards.get(it.id);
        if (card.parentElement !== target.list) target.list.append(card);
        selects.get(it.id).value = bins.has(a[it.id]) ? a[it.id] : '';
        card.classList.toggle('is-sorted', target !== pool);
      }
      if (active && active !== document.activeElement && active.isConnected) active.focus({ preventScroll: true });
      pool.el.classList.toggle('is-empty', ![...cards.values()].some((c) => c.parentElement === pool.list));
    },
    focus: () => selects.values().next().value?.focus(),
  };
}
