// The page ships a Content-Security-Policy. Every main view must load without a single violation, and hostile
// question text must show up as text, not as elements.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startEnv, newSession, startTest, answerCHEM101, submit, unlockAdmin, adhocTest, signIn, tid } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const CHEM101 = JSON.parse(fs.readFileSync(new URL('../fixtures/tests/CHEM101.json', import.meta.url), 'utf8'));

async function watchCsp(s) {
  await s.context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`));
  });
}
const violations = (s) => s.page.evaluate(() => window.__csp);

test('index.html carries the policy and script-src has no unsafe-inline', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const m = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  assert.ok(m, 'CSP meta tag');
  const script = m[1].split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
  assert.ok(script && !script.includes("'unsafe-inline'") && !script.includes("'unsafe-eval'"), script);
  assert.ok(!/<script>/.test(html), 'no inline scripts');
});

test('index.html has integrity on the KaTeX stylesheet', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const link = /<link[^>]*KaTeX\/0\.16\.11\/katex\.min\.css[^>]*>/.exec(html)?.[0] || '';
  assert.match(link, /integrity="sha384-[A-Za-z0-9+/=]+"/);
  assert.match(link, /crossorigin="anonymous"/);
});

test('landing, home, runner, results and admin load with no CSP violation', { timeout: 60000 }, async () => {
  const s = await newSession(env);
  try {
    await watchCsp(s);
    s.serveTest('CHEM101', CHEM101);
    await s.page.goto(s.url + '/');
    await signIn(s.page);
    await s.page.locator(tid('home-code-input')).waitFor();
    assert.deepEqual(await violations(s), [], 'landing and home');
    await s.page.locator(tid('home-code-input')).fill('CHEM101');
    await s.page.locator(tid('home-code-submit')).click();
    await s.page.locator(tid('runner')).waitFor();
    await answerCHEM101(s.page);
    assert.deepEqual(await violations(s), [], 'runner');
    await submit(s.page);
    assert.deepEqual(await violations(s), [], 'results');

    await s.page.goto(s.url + '/?admin=true');
    await unlockAdmin(s.page, s.url);
    assert.deepEqual(await violations(s), [], 'admin');
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('hostile text in a reaction and a graph question renders as text', { timeout: 30000 }, async () => {
  const s = await newSession(env);
  try {
    await watchCsp(s);
    const bad = '<img src=x onerror=window.__pwn=1>';
    s.serveTest('XSS1', adhocTest('XSS1', {
      questions: [
        { id: 'q1', type: 'reaction', text: `Predict ${bad}`, points: 1, reactants: `${bad}(aq) + NaCl(aq)`, products: ['AgCl(s)'], requireStates: false, requireCoefficients: false, netIonic: false, explanation: '' },
      ],
    }));
    await startTest(s, 'XSS1');
    await s.page.locator(tid('reaction-reactants')).waitFor();
    assert.equal(await s.page.locator(`${tid('runner')} img[src="x"]`).count(), 0, 'no injected img element');
    assert.equal(await s.page.evaluate(() => window.__pwn), undefined, 'handler never ran');
    await s.page.locator(tid('reaction-input')).fill(`2${bad}(s)`);
    assert.equal(await s.page.locator(`${tid('runner')} img[src="x"]`).count(), 0, 'preview is inert too');
    assert.deepEqual(await violations(s), []);
  } finally { await s.close(); }
});
