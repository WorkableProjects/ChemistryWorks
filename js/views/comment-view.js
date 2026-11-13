// Renders an instructor comment as safe DOM: text via textContent only, links forced to open safely.
import { h, icon, openModal, toast } from '../ui.js';
import { parseComment, loadBank, saveBank, addBankComment, updateBankComment, deleteBankComment, setBankRubric, getBankRubric, insertComment, MAX_COMMENT_CHARS } from '../lib/comments.js';

function inline(nodes) {
  return nodes.map((n) => {
    switch (n.type) {
      case 'text': return document.createTextNode(n.text);
      case 'br': return h('br');
      case 'strong': return h('strong', {}, inline(n.children));
      case 'em': return h('em', {}, inline(n.children));
      case 'link': return h('a', { href: n.href, target: '_blank', rel: 'noopener noreferrer nofollow' }, inline(n.children));
      default: return null;
    }
  });
}

/** <div class="comment-body"> with paragraphs and lists; empty div for an empty comment. */
export function commentBody(text, { className = 'comment-body', testid } = {}) {
  return h('div', { class: className, dataset: testid ? { testid } : undefined },
    parseComment(text).map((b) => (b.type === 'p'
      ? h('p', {}, inline(b.children))
      : h(b.type, {}, b.items.map((it) => h('li', {}, inline(it)))))));
}

/* ------------------------------------------------------------------ comment bank */

const bankListeners = new Set();
const shorten = (t, n = 48) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}\u2026` : t);
function changeBank(next) {
  saveBank(next);
  for (const fn of [...bankListeners]) fn();
}

/**
 * Saved-comment strip for a grading comment box: one click inserts a saved comment, "Save" stores the current
 * text, "Manage" opens the editor. When the bank holds a rubric for this test + question, its criteria show as
 * checkboxes that fill the points (onRubricPoints(sum)).
 *   getText() -> current comment text,  setText(text) -> put text in the comment box (and refresh its preview)
 */
export function commentBankPicker({ testCode = '', questionId, getText, setText, onRubricPoints } = {}) {
  const qid = String(questionId ?? '');
  const el = h('div', { class: 'adm-bank', dataset: { testid: `bank-picker-${qid}` } });
  const draw = () => {
    const bank = loadBank();
    const rubric = getBankRubric(bank, testCode, qid);
    const boxes = rubric.map((c, k) => h('input', { type: 'checkbox', dataset: { testid: `bank-rubric-${qid}-${k}` },
      on: { change: () => onRubricPoints?.(Math.round(boxes.reduce((sum, b, j) => sum + (b.checked ? rubric[j].points : 0), 0) * 100) / 100) } }));
    el.replaceChildren(
      h('div', { class: 'adm-bank__bar' },
        h('span', { class: 'field__label' }, 'Saved comments'),
        h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: `bank-save-${qid}` }, on: { click: () => {
          const text = getText().trim();
          if (!text) { toast('Write a comment first, then save it to reuse it.', { type: 'info' }); return; }
          const next = addBankComment(bank, text);
          if (next === bank) { toast('That comment is already saved.', { type: 'info' }); return; }
          changeBank(next);
          toast('Comment saved to your bank (this device).', { type: 'success' });
        } } }, icon('plus', { size: 14 }), 'Save this'),
        h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: `bank-manage-${qid}` }, on: { click: () => openCommentBankManager({ testCode, questionId: qid }) } }, icon('pen', { size: 14 }), 'Manage')),
      bank.comments.length
        ? h('div', { class: 'adm-bank__chips', role: 'group', 'aria-label': 'Insert a saved comment' }, bank.comments.map((c, i) =>
          h('button', { class: 'adm-chip', type: 'button', title: c.text, dataset: { testid: `bank-insert-${qid}-${i}` }, on: { click: () => setText(insertComment(getText(), c.text)) } }, shorten(c.text))))
        : h('span', { class: 'field__hint' }, 'No saved comments yet. Write one and choose Save this.'),
      rubric.length ? h('ul', { class: 'adm-bank__rubric', 'aria-label': 'Saved rubric' }, rubric.map((c, k) => h('li', {},
        h('label', { class: 'adm-rubric__item' }, boxes[k], h('span', {}, c.text), h('span', { class: 'pill' }, `${c.points} pt${c.points === 1 ? '' : 's'}`))))) : null);
  };
  const onChange = () => { if (el.isConnected) draw(); else bankListeners.delete(onChange); };
  bankListeners.add(onChange);
  draw();
  return el;
}

/** Modal to add, edit and delete saved comments and (when a question is given) that question's rubric. */
export function openCommentBankManager({ testCode = '', questionId = '' } = {}) {
  let bank = loadBank();
  const body = h('div', { class: 'stack adm-bankmgr', dataset: { testid: 'bank-manager' } });
  const commit = (next) => { bank = next; changeBank(next); drawBody(); };

  function commentRow(c) {
    const ta = h('textarea', { class: 'textarea', rows: 2, maxlength: String(MAX_COMMENT_CHARS), 'aria-label': 'Saved comment', dataset: { testid: `bank-edit-${c.id}` } });
    ta.value = c.text;
    return h('li', { class: 'adm-bankmgr__row' }, ta,
      h('div', { class: 'adm-bankmgr__btns' },
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `bank-update-${c.id}` }, on: { click: () => commit(updateBankComment(bank, c.id, ta.value)) } }, 'Update'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `bank-delete-${c.id}` }, on: { click: () => commit(deleteBankComment(bank, c.id)) } }, icon('trash', { size: 14 }), 'Delete')));
  }

  function drawBody() {
    const newTa = h('textarea', { class: 'textarea', rows: 2, maxlength: String(MAX_COMMENT_CHARS), placeholder: 'New saved comment', 'aria-label': 'New saved comment', dataset: { testid: 'bank-new' } });
    const sections = [
      h('section', { class: 'stack' },
        h('h3', { class: 'adm-h3' }, 'Saved comments'),
        bank.comments.length ? h('ul', { class: 'adm-bankmgr__list' }, bank.comments.map(commentRow)) : h('p', { class: 'muted' }, 'Nothing saved yet.'),
        newTa,
        h('div', {}, h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'bank-add' }, on: { click: () => { if (newTa.value.trim()) commit(addBankComment(bank, newTa.value)); } } }, icon('plus', { size: 14 }), 'Add comment'))),
    ];
    if (testCode && questionId) {
      const rubric = getBankRubric(bank, testCode, questionId);
      const rows = (rubric.length ? rubric : [{ text: '', points: 1 }]).map((c) => ({ ...c }));
      const rowEls = [];
      const addRow = (c) => {
        const text = h('input', { class: 'input', type: 'text', value: c.text, placeholder: 'Criterion', 'aria-label': 'Criterion', dataset: { testid: 'bank-rubric-text' } });
        const pts = h('input', { class: 'input adm-points', type: 'text', inputmode: 'decimal', value: String(c.points), 'aria-label': 'Points', dataset: { testid: 'bank-rubric-points' } });
        const li = h('li', { class: 'adm-bankmgr__crit' }, text, pts, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove criterion', title: 'Remove criterion', on: { click: () => { rowEls.splice(rowEls.findIndex((r) => r.li === li), 1); li.remove(); } } }, icon('x', { size: 14 })));
        rowEls.push({ li, text, pts });
        return li;
      };
      const list = h('ul', { class: 'adm-bankmgr__list' });
      rows.forEach((c) => list.appendChild(addRow(c)));
      sections.push(h('section', { class: 'stack' },
        h('h3', { class: 'adm-h3' }, `Rubric for ${testCode} \u00B7 ${questionId}`),
        h('p', { class: 'field__hint' }, 'Criteria and points for this question. They show as checkboxes next to the comment box and fill in the points. Saved on this device only.'),
        list,
        h('div', { class: 'adm-toolbar adm-toolbar--wrap' },
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'bank-rubric-add' }, on: { click: () => list.appendChild(addRow({ text: '', points: 1 })) } }, icon('plus', { size: 14 }), 'Add criterion'),
          h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'bank-rubric-save' }, on: { click: () => commit(setBankRubric(bank, testCode, questionId, rowEls.map((r) => ({ text: r.text.value, points: r.pts.value })))) } }, 'Save rubric'))));
    }
    body.replaceChildren(...sections);
  }
  drawBody();
  openModal({ title: 'Comment bank', testid: 'bank-modal', body, wide: true, actions: [{ label: 'Done', variant: 'primary', autofocus: true }] });
}
