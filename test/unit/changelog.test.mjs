// Every release needs release notes: changelog/<SITE_VERSION>.md, listed first in changelog/index.json.
// If this fails after a version bump, write the notes (see CLAUDE.md > "Releases and the changelog").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SITE_VERSION } from '../../js/version.js';
import { parseChangelog, parseInline, parseTitle } from '../../js/lib/changelog.js';
import { compareVersions } from '../../js/lib/version-check.js';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const index = JSON.parse(read('changelog/index.json'));
const files = readdirSync(new URL('changelog/', root)).filter((f) => f.endsWith('.md'));

test('current version has a changelog file and is first in index.json', () => {
  assert.ok(files.includes(`${SITE_VERSION}.md`), `missing changelog/${SITE_VERSION}.md`);
  assert.equal(index[0], SITE_VERSION, 'changelog/index.json must list the current version first');
  assert.equal(JSON.parse(read('package.json')).version, SITE_VERSION);
});

test('index.json and the changelog files match, newest first', () => {
  assert.deepEqual([...index].sort(), files.map((f) => f.replace(/\.md$/, '')).sort(), 'every file listed, every listed file present');
  for (let i = 1; i < index.length; i++) assert.equal(compareVersions(index[i - 1], index[i]), 1, `${index[i - 1]} should be newer than ${index[i]}`);
});

test('each changelog has a "# <version> — <date>" title matching its file name and some notes', () => {
  for (const v of index) {
    const parsed = parseChangelog(read(`changelog/${v}.md`));
    assert.equal(parsed.version, v, `changelog/${v}.md title`);
    assert.match(parsed.date, /^\d{4}-\d{2}-\d{2}$/, `changelog/${v}.md date`);
    assert.ok(parsed.blocks.length > 0, `changelog/${v}.md has no notes`);
  }
});

test('parser: title, headings, lists, paragraphs, inline spans', () => {
  assert.deepEqual(parseTitle('# v2.5.0 – 2026-11-03'), { version: '2.5.0', date: '2026-11-03' });
  const p = parseChangelog('# 1.2.3 — 2026-01-01\n\nIntro\nline.\n\n## Added\n- one\n- **two** `x`\n\n## Fixed\n* three\n');
  assert.equal(p.version, '1.2.3');
  assert.deepEqual(p.blocks, [
    { type: 'para', text: 'Intro line.' },
    { type: 'heading', text: 'Added' },
    { type: 'list', items: ['one', '**two** `x`'] },
    { type: 'heading', text: 'Fixed' },
    { type: 'list', items: ['three'] },
  ]);
  assert.deepEqual(parseInline('a **b** `c` d'), [
    { type: 'text', text: 'a ' }, { type: 'bold', text: 'b' }, { type: 'text', text: ' ' }, { type: 'code', text: 'c' }, { type: 'text', text: ' d' },
  ]);
});
