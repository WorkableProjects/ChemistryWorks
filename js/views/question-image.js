// Optional image shown alongside a question's text (question.image = { url, alt, position }).
// position: 'right' (default) | 'left' | 'below'. Narrow screens always stack the image under the text.
import { h } from '../ui.js';
import { safeImageUrl } from '../lib/sections.js';

export const IMAGE_POSITIONS = ['right', 'left', 'below'];

/** The question's image element, or null when there is no usable image. */
export function questionImageEl(q, { className = '' } = {}) {
  const img = q && q.image;
  const url = img && safeImageUrl(img.url);
  if (!url) return null;
  return h('figure', { class: ['q-image', className].filter(Boolean).join(' '), dataset: { testid: 'q-image' } },
    h('img', { src: url, alt: String(img.alt || ''), loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' }));
}

/** Wrap a question's text element with its image (side by side or below). Returns textEl unchanged when there is none. */
export function withQuestionImage(q, textEl, opts) {
  const fig = questionImageEl(q, opts);
  if (!fig) return textEl;
  const pos = IMAGE_POSITIONS.includes(q.image.position) ? q.image.position : 'right';
  return h('div', { class: `q-media q-media--${pos}`, dataset: { testid: 'q-media' } }, textEl, fig);
}
