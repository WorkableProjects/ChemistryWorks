// Landing: hero + code entry as the main action, then "Continue where you left off" and "Your tests" cards.
// Signed out: "Sign in with Google to Begin". Signed in: test-code entry and resumable attempts.

import { h, mount, icon, userBadge, toast, renderMath, formatDurationLong, themeControl, stagger, brandLogo } from '../ui.js';
import { getUser, renderGoogleButton, googleConfigured, demoAllowed, demoSignIn } from '../lib/auth.js';
import { keys, load, remove } from '../lib/storage.js';
import { getLocalResults } from '../lib/submit.js';
import { SITE_VERSION } from '../version.js';

import { dashboardSection } from './tools/dashboard.js';
import { networkBanner } from './tools/banner.js';
import { ensureToolsCss } from './tools/settings.js';
import * as home from './home/index.js';

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
    h('h2', { class: 'card__title' }, params.code ? `Sign in to begin ${params.code}` : 'Sign in with Google'),
    h('p', { class: 'muted' }, 'Your name and email are attached to your submission automatically.'),
    ...body,
    err,
    h('p', { class: 'site-version', dataset: { testid: 'site-version' } }, `v${SITE_VERSION}`),
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

// Local result payloads carry no "released" flag (release state lives on the server and is fetched on the feedback
// view), so a local result is shown as Submitted. If a payload ever gains `released`/`feedback_released`, show Released.
function resultStatus(p) {
  return (p.released || p.feedback_released || p.feedback?.released)
    ? h('span', { class: 'pill pill--success' }, 'Released')
    : h('span', { class: 'pill pill--warning' }, 'Submitted');
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

  return h('section', { class: 'card code-card', dataset: { testid: 'code-card' } },
    h('div', { class: 'code-card__top' },
      h('h2', { class: 'card__title' }, `Welcome, ${user.name.split(' ')[0]}`),
      userBadge(user, { onSignOut: () => ctx.signOut() }),
    ),
    h('p', { class: 'muted' }, 'Enter the test code from your teacher.'),
    h('form', { class: 'code-form', on: { submit: onSubmit } }, input, btn),
    errBox,
    h('p', { class: 'site-version', dataset: { testid: 'site-version' } }, `v${SITE_VERSION}`),
  );
}

/** Decorative bubbles drifting up behind the panel (pure CSS; hidden from assistive tech, still under reduced motion). */
function bubbles() {
  const spec = [[6, 18, 0, 14], [14, 34, 3, 18], [23, 12, 7, 12], [31, 26, 1.5, 16], [44, 10, 9, 11], [58, 22, 4.5, 17],
    [67, 14, 0.8, 13], [76, 30, 6, 19], [85, 16, 2.5, 15], [93, 24, 8, 14]];
  return h('div', { class: 'landing__bubbles', 'aria-hidden': 'true' },
    spec.map(([x, size, delay, dur]) => h('span', { style: `--x:${x}%;--s:${size}px;--d:${delay}s;--t:${dur}s` })));
}

/** Decorative hex/molecule pattern for the hero (inline SVG, aria-hidden). */
function heroPattern() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'landing__pattern');
  svg.setAttribute('viewBox', '0 0 200 120');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 3 * i + Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  [[40, 40, 18], [75, 60, 18], [40, 80, 18], [110, 40, 18], [145, 60, 18], [180, 40, 18]].forEach(([x, y, r]) => {
    const p = document.createElementNS(ns, 'polygon');
    p.setAttribute('points', hex(x, y, r));
    svg.appendChild(p);
  });
  return svg;
}

export function render(root, ctx, params = {}) {
  const user = getUser();
  if (user) return home.render(root, ctx, params);
  // V4-05: "My dashboard" and the waiting-submission banner (student tools flag).
  const tools = !!user;
  ensureToolsCss(); // the merged tests list uses the dashboard styles
  const banner = tools ? networkBanner({ config: ctx.config }) : null;
  mount(root,
    h('main', { class: 'landing' },
      h('div', { class: 'landing__topbar' },
        h('a', { href: '?admin=true', class: 'theme-ctl__btn', title: 'Teacher / admin', 'aria-label': 'Teacher / admin panel', dataset: { testid: 'admin-link' } }, icon('home')),
        themeControl()),
      bubbles(),
      h('header', { class: 'landing__hero' },
        heroPattern(),
        h('h1', { class: 'sr-only' }, 'ChemistryWorks'),
        h('div', { class: 'landing__brand', dataset: { testid: 'landing-logo' } }, brandLogo('wordmark')),
        h('p', { class: 'landing__intro' }, 'ChemistryWorks — chemistry tests, study and games'),
      ),
      h('div', { class: 'landing__inner' },
        h('div', { class: 'landing__panel' }, user ? codeCard(ctx, params) : signInCard(ctx, params)),
        banner ? banner.el : null,
        user ? h('div', { class: 'landing__lists' },
          dashboardSection(ctx, { progress: inProgress(user), results: pastResults(user), practice: tools,
            onRemove: (code) => remove(`progress:${user.email}:${code}`) })) : null,
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
  return () => banner?.destroy();
}
