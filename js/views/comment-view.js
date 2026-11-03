// Renders an instructor comment (V2-07) as safe DOM: text via textContent only, links forced to open safely.
import { h } from '../ui.js';
import { parseComment } from '../lib/comments.js';

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
