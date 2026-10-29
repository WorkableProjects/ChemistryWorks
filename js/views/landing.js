// Landing: "Sign in with Google to Begin" gate, then test-code entry and resumable attempts.

import { h, mount, icon, userBadge, toast, renderMath, formatDurationLong } from '../ui.js';
import { getUser, renderGoogleButton, googleConfigured, demoAllowed, demoSignIn } from '../lib/auth.js';
import { keys, load } from '../lib/storage.js';

function hero() {
  return h('div', { class: 'hero__art', 'aria-hidden': 'true' },
    h('div', { class: 'orbit orbit--1' }, h('span', { class: 'electron' })),
    h('div', { class: 'orbit orbit--2' }, h('span', { class: 'electron' })),
    h('div', { class: 'orbit orbit--3' }, h('span', { class: 'electron' })),
    h('div', { class: 'nucleus' }, icon('flask', { size: 34 })),
  );
}

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

  return h('section', { class: 'card card--glass signin-card', dataset: { testid: 'signin-card' } },
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

function codeCard(ctx, params) {
  const user = getUser();
  const input = h('input', {
    class: 'input input--code', name: 'code', placeholder: 'e.g. CHEM101', value: params.code || '',
    autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Test code',
    dataset: { testid: 'code-input' },
  });
  const err = h('p', { class: 'field-error', role: 'alert', dataset: { testid: 'code-error' } }, params.error || '');
  const btn = h('button', { class: 'btn btn--primary btn--lg', type: 'submit', dataset: { testid: 'code-submit' } }, 'Start test', icon('right'));
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!input.value.trim()) { err.textContent = 'Enter the test code from your teacher.'; return; }
    btn.disabled = true;
    btn.classList.add('is-loading');
    await ctx.openTest(input.value);
  };

  const resumable = inProgress(user);
  return h('section', { class: 'card card--glass code-card', dataset: { testid: 'code-card' } },
    h('div', { class: 'code-card__top' },
      h('h2', { class: 'card__title' }, `Welcome, ${user.name.split(' ')[0]}`),
      userBadge(user, { onSignOut: () => ctx.signOut() }),
    ),
    h('p', { class: 'muted' }, 'Enter your test code to begin.'),
    h('form', { class: 'code-form', on: { submit: onSubmit } }, input, btn),
    err,
    resumable.length
      ? h('div', { class: 'resume', dataset: { testid: 'resume-list' } },
          h('h3', { class: 'resume__title' }, 'Continue where you left off'),
          resumable.map((p) => h('button', {
            class: 'resume__item', type: 'button', dataset: { testid: `resume-${p.code}` },
            on: { click: () => ctx.openTest(p.code) },
          },
            h('span', { class: 'resume__code' }, p.code),
            h('span', { class: 'resume__title-text' }, p.title || 'Test in progress'),
            h('span', { class: 'resume__meta' }, `${Object.keys(p.answers || {}).length} answered · ${p.updatedAt ? formatDurationLong((Date.now() - p.updatedAt) / 1000) + ' ago' : ''}`),
            icon('right'),
          )),
        )
      : null,
  );
}

export function render(root, ctx, params = {}) {
  const user = getUser();
  const features = [
    ['Auto-graded', 'Instant, fair scoring with partial credit where your teacher allows it.'],
    ['Chemistry-native', 'Formulas like H2O render as H₂O; equations are typeset beautifully.'],
    ['Never lose work', 'Answers save as you go — refresh or reconnect and pick up where you left off.'],
  ];
  mount(root,
    h('main', { class: 'landing' },
      h('div', { class: 'landing__bg', 'aria-hidden': 'true' }),
      h('div', { class: 'landing__inner' },
        h('div', { class: 'landing__copy' },
          h('div', { class: 'brand brand--lg' }, h('span', { class: 'brand__mark' }, icon('flask', { size: 22 })), h('span', { class: 'brand__name' }, 'ChemistryWorks')),
          h('h1', { class: 'landing__title' }, 'Chemistry tests that feel ', h('em', {}, 'effortless'), '.'),
          h('p', { class: 'landing__lead' }, 'Focused, beautifully typeset assessments with instant results for students and live analytics for teachers.'),
          h('ul', { class: 'feature-list' }, features.map(([t, d]) => h('li', {}, icon('check'), h('span', {}, h('strong', {}, t), ' — ', d)))),
        ),
        h('div', { class: 'landing__panel' }, hero(), user ? codeCard(ctx, params) : signInCard(ctx, params)),
      ),
      h('footer', { class: 'landing__footer' },
        h('span', {}, '© ChemistryWorks'),
        h('a', { href: '?admin=true', class: 'link-quiet', dataset: { testid: 'admin-link' } }, 'Teacher / admin'),
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
