// Workflow lint: actionlint when installed, otherwise a structural check (no YAML library in the repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = new URL('../../.github/workflows/', import.meta.url);
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
const read = (f) => readFileSync(new URL(f, dir), 'utf8');

// Bodies of `run: |` blocks.
function runBlocks(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:- )?run: \|\s*$/.exec(lines[i]);
    if (!m) continue;
    const base = m[1].length;
    const body = [];
    for (i++; i < lines.length && (lines[i].trim() === '' || lines[i].search(/\S/) > base); i++) body.push(lines[i]);
    i--;
    out.push(body.join('\n'));
  }
  return out;
}

const hasActionlint = spawnSync('actionlint', ['-version']).status === 0;

for (const f of files) {
  test(`workflow ${f}: lint`, () => {
    const text = read(f);
    if (hasActionlint) {
      const r = spawnSync('actionlint', [new URL(f, dir).pathname], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      return;
    }
    assert.ok(!/\t/.test(text), 'no tab characters');
    assert.match(text, /^name: .+/m);
    assert.match(text, /^on:\s*$/m);
    assert.match(text, /^jobs:\s*$/m);
    assert.match(text, /^\s+runs-on: .+/m);
    assert.ok(!text.replace(/\$\{\{[^}\n]*\}\}/g, '').includes('${{'), 'every expression is closed');
    for (const m of text.matchAll(/^\s*- uses: (\S+)/gm)) assert.match(m[1], /^[\w.-]+\/[\w./-]+@[\w.-]+$/, `uses: ${m[1]}`);
    const tmp = mkdtempSync(join(tmpdir(), 'wf-'));
    runBlocks(text).forEach((body, i) => {
      const p = join(tmp, `${i}.sh`);
      writeFileSync(p, body.replace(/\$\{\{[^}]*\}\}/g, 'X'));
      const r = spawnSync('bash', ['-n', p], { encoding: 'utf8' });
      assert.equal(r.status, 0, `run block ${i} in ${f}: ${r.stderr}`);
    });
  });
}

test('gas-deploy: manual only, checks secrets, pushes, deploys to the existing deployment, verifies the version', () => {
  const t = read('gas-deploy.yml');
  assert.match(t, /^on:\s*\n\s+workflow_dispatch:\s*$/m);
  assert.ok(!/^\s+(push|pull_request|schedule):/m.test(t), 'no automatic trigger');
  for (const s of ['CLASPRC_JSON', 'GAS_SCRIPT_ID', 'GAS_DEPLOYMENT_ID', 'GAS_WEB_APP_URL']) assert.ok(t.includes(s), s);
  assert.match(t, /\.clasprc\.json/);
  assert.match(t, /Missing:/);
  assert.match(t, /npm run gas:push/);
  assert.match(t, /npm run gas:deploy/);
  assert.match(t, /action=ping/);
  assert.match(t, /Code\.gs/);
  const order = ['Check secrets', 'npm run gas:push', 'npm run gas:deploy', 'action=ping'].map((s) => t.indexOf(s));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('pages: writes config.local.js from repository variables and publishes the guide', () => {
  const t = read('pages.yml');
  for (const v of ['GAS_WEB_APP_URL', 'GOOGLE_CLIENT_ID', 'SHEET_URL']) assert.match(t, new RegExp(`vars\\.${v}`));
  assert.match(t, /_site\/js\/config\.local\.js/);
  assert.match(t, /docs\/guide\.md _site\/docs\/guide\.md/);
});

test('package.json: gas scripts and clasp', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['gas:push'], /clasp push/);
  assert.match(pkg.scripts['gas:deploy'], /clasp deploy -i "\$GAS_DEPLOYMENT_ID"/);
  assert.ok(pkg.devDependencies['@google/clasp']);
});
