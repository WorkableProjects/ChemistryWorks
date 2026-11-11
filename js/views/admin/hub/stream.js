// Teacher stream (V5-10): post text / link / picture, pin one, delete. Assignment posts come from the assignments.
import { h, mount, icon, toast } from '../../../ui.js';
import { postStream, deleteStreamPost } from '../../../lib/api.js';
import { compressImageFile } from '../../../lib/image-upload.js';
import { assignmentsRes, streamRes, creds, fmtWhen } from './data.js';

const IMG_MARK = 'image:';
const POST_MAX = 2000;
const URL_RE = /(https?:\/\/[^\s<>"]+)/g;

/** Post text -> nodes. A line `image:<url>` is a picture; web addresses become links. */
export function postBody(text) {
  return h('div', { class: 'hub-post__body' }, String(text || '').split('\n').map((line) => {
    const t = line.trim();
    if (t.startsWith(IMG_MARK)) {
      const src = t.slice(IMG_MARK.length).trim();
      if (/^(https?:\/\/|data:image\/)/i.test(src)) return h('img', { class: 'hub-post__img', src, alt: 'Picture in post', loading: 'lazy' });
    }
    const parts = line.split(URL_RE);
    return h('p', {}, parts.map((p, i) => (i % 2 ? h('a', { href: p, target: '_blank', rel: 'noopener noreferrer' }, p) : p)));
  }));
}

export function renderStream(host, ctx, cls) {
  const posts = streamRes(cls.id);
  const assigns = assignmentsRes();
  let alive = true;
  let picture = '';
  const input = h('textarea', { class: 'textarea', rows: 3, maxlength: String(POST_MAX), placeholder: 'Share an update, a link or a picture with the class', 'aria-label': 'New post', dataset: { testid: 'stream-input' } });
  const chip = h('span', { class: 'hub-attached' });
  const err = h('p', { class: 'field-error', role: 'alert' });
  const file = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: `stream-file-${cls.id}`, on: { change: async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    err.textContent = '';
    try {
      // The backend keeps a post under 2,000 characters, so only a very small picture fits inline.
      const r = await compressImageFile(f, { budget: POST_MAX - 200 });
      picture = r.url; chip.replaceChildren(icon('upload', { size: 14 }), 'Picture attached');
    } catch (ex) { err.textContent = `${ex.message} Paste a link to the picture instead.`; }
  } } });
  const post = async () => {
    err.textContent = '';
    let body = input.value.trim();
    if (picture) body = `${body}${body ? '\n' : ''}${IMG_MARK}${picture}`;
    if (!body) { err.textContent = 'Write something first'; return; }
    if (body.length > POST_MAX) { err.textContent = 'That post is too long'; return; }
    const tmp = { id: `tmp-${Date.now()}`, classId: cls.id, type: 'post', body, pinned: false, createdAt: new Date().toISOString() };
    input.value = ''; picture = ''; chip.replaceChildren();
    const out = await posts.optimistic((d) => [tmp, ...(d || [])], () => postStream({ ...creds(), classId: cls.id, body }),
      { message: 'Could not post', onSuccess: (d, r) => (d || []).map((p) => (p.id === tmp.id ? (r.data.post || p) : p)) });
    if (!out.ok) { input.value = body; }
  };
  const pin = (p) => {
    const others = (posts.peek() || []).filter((x) => x.pinned && x.id !== p.id);
    const on = !p.pinned;
    return posts.optimistic((d) => (d || []).map((x) => ({ ...x, pinned: x.id === p.id ? on : (on ? false : x.pinned) })), async () => {
      for (const o of others) if (on) await postStream({ ...creds(), id: o.id, pinned: false });
      return postStream({ ...creds(), id: p.id, pinned: on });
    }, { message: 'Could not change the pin' });
  };
  const remove = (p) => posts.optimistic((d) => (d || []).filter((x) => x.id !== p.id), () => deleteStreamPost({ ...creds(), id: p.id }), { message: 'Could not delete the post' })
    .then((r) => { if (r.ok) toast('Post deleted', { type: 'success' }); });

  const list = h('div', { class: 'hub-posts', dataset: { testid: 'class-stream' } });
  function paint() {
    if (!alive) return;
    const mine = (posts.peek() || []).filter((p) => p.type !== 'assignment');
    const fromAssignments = (assigns.peek() || []).filter((a) => a.classId === cls.id)
      .map((a) => ({ id: `asg-${a.id}`, type: 'assignment', body: a.title || a.testCode, assignment: a, pinned: false, createdAt: a.createdAt || a.opensAt || '' }));
    const all = [...mine, ...fromAssignments].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!all.length) { mount(list, h('p', { class: 'hub-empty', dataset: { testid: 'stream-empty' } }, 'No posts yet. Write the first one above')); return; }
    mount(list, ...all.map((p) => h('article', { class: `hub-post${p.pinned ? ' is-pinned' : ''}`, dataset: { testid: `stream-post-${p.id}` } },
      h('div', { class: 'hub-post__head' },
        h('span', { class: 'hub-post__meta' }, p.type === 'assignment' ? 'Assignment' : p.type === 'reminder' ? 'Reminder' : 'Post', p.createdAt ? ` · ${fmtWhen(p.createdAt)}` : ''),
        p.pinned ? h('span', { class: 'pill pill--primary' }, 'Pinned') : null,
        h('span', { class: 'spacer' }),
        p.type === 'post' && !String(p.id).startsWith('tmp-')
          ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `stream-pin-${p.id}` }, on: { click: () => pin(p) } }, icon('flag', { size: 14 }), p.pinned ? 'Unpin' : 'Pin') : null,
        p.type !== 'assignment' && !String(p.id).startsWith('tmp-')
          ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-label': 'Delete post', dataset: { testid: `stream-delete-${p.id}` }, on: { click: () => remove(p) } }, icon('trash', { size: 14 })) : null),
      p.type === 'assignment'
        ? h('p', {}, h('strong', {}, p.body), p.assignment && p.assignment.dueAt ? h('span', { class: 'faint' }, ` · Due ${fmtWhen(p.assignment.dueAt)}`) : null)
        : postBody(p.body))));
  }
  const unsubs = [posts.subscribe(paint), assigns.subscribe(paint)];
  mount(host, h('div', { class: 'stack' },
    h('div', { class: 'hub-composer' }, input,
      h('div', { class: 'row row--wrap' },
        h('label', { class: 'btn btn--ghost btn--sm', for: `stream-file-${cls.id}` }, icon('upload', { size: 14 }), 'Add picture'), file, chip,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'stream-post-btn' }, on: { click: post } }, 'Post')),
      err),
    list));
  paint();
  posts.get().catch(() => {}); assigns.get().catch(() => {});
  return () => { alive = false; unsubs.forEach((u) => u()); };
}
