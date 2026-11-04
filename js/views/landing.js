// Landing: a single centered panel, like a testing-platform login screen.
// Signed out: "Sign in with Google to Begin". Signed in: test-code entry and resumable attempts.

import { h, mount, icon, userBadge, toast, renderMath, formatDurationLong, themeControl, stagger, brandLogo } from '../ui.js';
import { getUser, renderGoogleButton, googleConfigured, demoAllowed, demoSignIn } from '../lib/auth.js';
import { keys, load } from '../lib/storage.js';
import { getLocalResults } from '../lib/submit.js';

function signInCard(ctx, params) {
  const { config } = ctx;
  const err = h('p', { class: 'field-error', role: 'alert', dataset: { testid: 'signin-error' } });
  const showError = (m) => { err.textContent = m; };
  const body = [];

  if (googleConfigured(config)) {
    const slot = h('div', { class: 'gsi-slot', dataset: { testid: 'google-signin' } });
    body.push(slot);
    renderGoogleButton(slot, config, { onError: showError });
  } else if (demoAllowed(config)) {
    const name = h('input', { class: 'input', name: 'name', placeholder: 'Full name', autocomplete: 'name', dataset: { testid: 'demo-name' } });
    const email = h('input', { class: 'input', name: 'email', type: 'email', placeholder: 'Email address', autocomplete: 'email', dataset: { testid: 'demo-email' } });
    body.push(
      h('form', { class: 'stack', on: { submit: (e) => {
        e.preventDefault();
        try { demoSignIn(name.value, email.value); } catch (ex) { showError(ex.message); }
      } } },
        h('div', { class: 'notice notice--info' }, icon('info'), h('span', {}, 'Demo sign-in: Google Sign-In is not configured on this site yet.')),
        name, email,
        h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit', dataset: { testid: 'demo-signin' } }, 'Continue'),
      ),
    );
  } else {
    body.push(h('div', { class: 'notice notice--error' }, icon('alert'), h('span', {}, 'Sign-in is not configured. Ask your teacher for help.')));
  }

  return h('section', { class: 'card signin-card', dataset: { testid: 'signin-card' } },
    h('h2', { class: 'card__title' }, params.code ? `Sign in to begin ${params.code}` : 'Sign in with Google to Begin'),
    h('p', { class: 'muted' }, 'Your name and email are attached to your submission automatically.'),
    ...body,
    err,
  );
}

function inProgress(user) {
  const prefix = `progress:${user.email}:`;
  return keys(prefix)
    .map((k) => ({ code: k.slice(prefix.length), ...load(k, {}) }))
    .filter((p) => p.code)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function pastResults(user) {
  const email = String(user.email || '').toLowerCase();
  return getLocalResults()
    .filter((r) => r && r.submission_id && String(r.student_email || '').toLowerCase() === email)
    .sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')))
    .slice(0, 20);
}

function pastCard(ctx, user) {
  const list = pastResults(user);
  if (!list.length) return null;
  const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { dateStyle: 'medium' }); };
  const card = h('section', { class: 'card past-results', dataset: { testid: 'past-results' } },
    h('h3', { class: 'past-results__title' }, 'Your submitted tests'),
    list.map((p) => h('div', { class: 'past-results__item stagger-item' },
      h('div', { class: 'past-results__main' },
        h('span', { class: 'past-results__name' }, p.test_title || p.test_code),
        h('span', { class: 'past-results__meta' }, h('span', { class: 'past-results__code' }, p.test_code), p.submitted_at ? ` · Submitted ${when(p.submitted_at)}` : '')),
      h('button', { class: 'btn btn--sm', type: 'button', dataset: { testid: `view-feedback-${p.submission_id}` },
        'aria-label': `View feedback for ${p.test_title || p.test_code}`, on: { click: () => ctx.navigate('feedback', { payload: p }) } }, 'View feedback'))));
  stagger(card);
  return card;
}

function codeCard(ctx, params) {
  const user = getUser();
  const input = h('input', {
    class: 'input input--code', name: 'code', placeholder: 'e.g. CHEM101', value: params.code || '',
    autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Test code',
    dataset: { testid: 'code-input' },
  });
  const err = h('p', { class: 'field-error', role: 'alert', dataset: { testid: 'code-error' } }, params.error || '');
  // Errors use the shared .notice style; a Retry shows only when the last attempt failed to load a test.
  const retryBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: 'code-retry' }, hidden: !(params.error && params.code),
    on: { click: () => { retryBtn.disabled = true; ctx.openTest(params.code); } } }, icon('refresh', { size: 14 }), 'Retry');
  const errBox = h('div', { class: 'notice notice--error code-notice', hidden: !params.error }, icon('alert'), err, retryBtn);
  const showError = (msg) => { err.textContent = msg; errBox.hidden = !msg; retryBtn.hidden = true; };
  const btn = h('button', { class: 'btn btn--primary btn--lg', type: 'submit', dataset: { testid: 'code-submit' } }, 'Start test', icon('right'));
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!input.value.trim()) {
      showError('Enter the test code from your teacher.');
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 400);
      return;
    }
    btn.disabled = true;
    btn.classList.add('is-loading');
    await ctx.openTest(input.value);
  };

  const resumable = inProgress(user);
  const resumeBox = resumable.length
    ? h('div', { class: 'resume', dataset: { testid: 'resume-list' } },
        h('h3', { class: 'resume__title' }, 'Continue where you left off'),
        resumable.map((p) => h('button', {
          class: 'resume__item stagger-item', type: 'button', dataset: { testid: `resume-${p.code}` },
          on: { click: () => ctx.openTest(p.code) },
        },
          h('span', { class: 'resume__code' }, p.code),
          h('span', { class: 'resume__title-text' }, p.title || 'Test in progress'),
          h('span', { class: 'resume__meta' }, `${Object.keys(p.answers || {}).length} answered · ${p.updatedAt ? formatDurationLong((Date.now() - p.updatedAt) / 1000) + ' ago' : ''}`),
          icon('right'),
        )),
      )
    : null;
  stagger(resumeBox);
  return h('section', { class: 'card code-card', dataset: { testid: 'code-card' } },
    h('div', { class: 'code-card__top' },
      h('h2', { class: 'card__title' }, `Welcome, ${user.name.split(' ')[0]}`),
      userBadge(user, { onSignOut: () => ctx.signOut() }),
    ),
    h('p', { class: 'muted' }, 'Enter your test code to begin.'),
    h('form', { class: 'code-form', on: { submit: onSubmit } }, input, btn),
    errBox,
    resumeBox,
  );
}

/** Decorative bubbles drifting up behind the panel (pure CSS; hidden from assistive tech, still under reduced motion). */
function bubbles() {
  const spec = [[6, 18, 0, 14], [14, 34, 3, 18], [23, 12, 7, 12], [31, 26, 1.5, 16], [44, 10, 9, 11], [58, 22, 4.5, 17],
    [67, 14, 0.8, 13], [76, 30, 6, 19], [85, 16, 2.5, 15], [93, 24, 8, 14]];
  return h('div', { class: 'landing__bubbles', 'aria-hidden': 'true' },
    spec.map(([x, size, delay, dur]) => h('span', { style: `--x:${x}%;--s:${size}px;--d:${delay}s;--t:${dur}s` })));
}

export function render(root, ctx, params = {}) {
  const user = getUser();
  mount(root,
    h('main', { class: 'landing' },
      h('h1', { class: 'sr-only' }, 'ChemistryWorks'),
      h('div', { class: 'landing__brand', dataset: { testid: 'landing-logo' } }, brandLogo('wordmark')),
      h('div', { class: 'theme-float landing__topbar' },
        h('a', { href: '?admin=true', class: 'theme-ctl__btn', title: 'Teacher / admin', 'aria-label': 'Teacher / admin panel', dataset: { testid: 'admin-link' } }, icon('home')),
        themeControl()),
      bubbles(),
      h('div', { class: 'landing__inner' },
        h('div', { class: 'landing__panel' },
          user ? [codeCard(ctx, params), pastCard(ctx, user)] : signInCard(ctx, params)),
      ),
      h('footer', { class: 'landing__footer' },
        h('span', {}, '© ChemistryWorks'),
      ),
    ),
  );
  renderMath(root);
  if (params.error) toast(params.error, { type: 'error' });
  const focusEl = root.querySelector('[data-testid="code-input"], [data-testid="demo-name"]');
  // Autofocus only if the user hasn't already focused something (or a modal, e.g. the admin gate, is open).
  setTimeout(() => {
    const idle = !document.activeElement || document.activeElement === document.body;
    if (idle && !document.querySelector('#modal-root .modal-overlay')) focusEl?.focus();
  }, 60);
}
