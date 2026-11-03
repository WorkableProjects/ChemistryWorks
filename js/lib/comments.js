// Instructor comments on submitted questions (V2-07). Pure parser, no DOM, no HTML strings.
//
// Supported formatting (a small, safe Markdown subset):
//   **bold**   *italic* or _italic_   [link text](https://example.com)   bare https://… / http://… URLs
//   "- item" or "* item" lines -> bulleted list;  "1. item" lines -> numbered list;  blank line -> new paragraph
// Allowed link schemes: https, http, mailto. Anything else renders as plain text.
// Rendering (js/views/comment-view.js) builds DOM nodes from this tree with textContent only; links get
// target="_blank" rel="noopener noreferrer nofollow".

export const MAX_COMMENT_CHARS = 2000;

/** Trimmed comment, capped at MAX_COMMENT_CHARS; '' when empty/whitespace (empty comments are never saved). */
export function cleanComment(text) {
  const s = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  return s.slice(0, MAX_COMMENT_CHARS);
}

/** Drop empty comments: { qid: text } -> { qid: cleaned } with only non-empty entries. */
export function cleanComments(map) {
  const out = {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  for (const [k, v] of Object.entries(map)) {
    const c = cleanComment(v);
    if (c) out[k] = c;
  }
  return out;
}

/** The URL if it is safe to open (https/http/mailto, no whitespace/control chars), else ''. */
export function safeHref(url) {
  const s = String(url ?? '').trim();
  if (!s || /[\s\u0000-\u001f\u007f<>"]/.test(s)) return '';
  if (/^https?:\/\/[^/?#]+/i.test(s)) return s;
  if (/^mailto:[^@\s]+@[^@\s]+$/i.test(s)) return s;
  return '';
}

// Inline = { type: 'text', text } | { type: 'strong'|'em', children: Inline[] } | { type: 'link', href, children: Inline[] }
const INLINE_SRC = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|(?<![\w*])\*(?!\s)([^*\n]+?)\*(?!\w)|(?<!\w)_(?!\s)([^_\n]+?)_(?!\w)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

export function parseInline(text, depth = 0) {
  const s = String(text ?? '');
  const out = [];
  let last = 0;
  const pushText = (t) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev && prev.type === 'text') prev.text += t;
    else out.push({ type: 'text', text: t });
  };
  if (depth > 3) { pushText(s); return out; }
  const INLINE_RE = new RegExp(INLINE_SRC.source, 'g'); // fresh per call: parseInline recurses
  let m;
  while ((m = INLINE_RE.exec(s))) {
    pushText(s.slice(last, m.index));
    last = INLINE_RE.lastIndex;
    if (m[1] !== undefined) out.push({ type: 'strong', children: parseInline(m[1], depth + 1) });
    else if (m[2] !== undefined) {
      const href = safeHref(m[3]);
      if (href) out.push({ type: 'link', href, children: parseInline(m[2], depth + 1) });
      else pushText(m[0]);
    } else if (m[4] !== undefined || m[5] !== undefined) out.push({ type: 'em', children: parseInline(m[4] ?? m[5], depth + 1) });
    else if (m[6] !== undefined) {
      const href = safeHref(m[6]);
      if (href) out.push({ type: 'link', href, children: [{ type: 'text', text: m[6] }] });
      else pushText(m[6]);
    }
  }
  pushText(s.slice(last));
  return out;
}

// Block = { type: 'p', children: Inline[] }  (lines inside a paragraph are joined with { type: 'br' })
//       | { type: 'ul'|'ol', items: Inline[][] }
const UL_RE = /^\s*[-*•]\s+(.*)$/;
const OL_RE = /^\s*\d{1,3}[.)]\s+(.*)$/;

export function parseComment(text) {
  const lines = cleanComment(text).split('\n');
  const blocks = [];
  let para = null;
  let list = null;
  const endPara = () => { para = null; };
  const endList = () => { list = null; };
  for (const line of lines) {
    if (!line.trim()) { endPara(); endList(); continue; }
    const ul = UL_RE.exec(line);
    const ol = ul ? null : OL_RE.exec(line);
    if (ul || ol) {
      endPara();
      const kind = ul ? 'ul' : 'ol';
      if (!list || list.type !== kind) { list = { type: kind, items: [] }; blocks.push(list); }
      list.items.push(parseInline((ul || ol)[1]));
      continue;
    }
    endList();
    if (!para) { para = { type: 'p', children: [] }; blocks.push(para); } else para.children.push({ type: 'br' });
    para.children.push(...parseInline(line));
  }
  return blocks;
}

/** Plain-text version (formatting markers removed, links as "text (url)") for CSV and aria. */
export function commentToText(text) {
  const inl = (list) => list.map((n) => (n.type === 'text' ? n.text : n.type === 'br' ? '\n'
    : n.type === 'link' ? (inl(n.children) === n.href ? n.href : `${inl(n.children)} (${n.href})`) : inl(n.children))).join('');
  return parseComment(text).map((b) => (b.type === 'p' ? inl(b.children)
    : b.items.map((it, i) => `${b.type === 'ol' ? `${i + 1}.` : '•'} ${inl(it)}`).join('\n'))).join('\n\n');
}
