import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanComment, cleanComments, safeHref, parseComment, parseInline, commentToText, MAX_COMMENT_CHARS,
} from '../../js/lib/comments.js';

const T = (text) => ({ type: 'text', text });

test('cleanComment: trims, normalizes newlines, caps, empties', () => {
  assert.equal(cleanComment('  hi  '), 'hi');
  assert.equal(cleanComment('a\r\nb\rc'), 'a\nb\nc');
  assert.equal(cleanComment('x'.repeat(2500)).length, 2000);
  assert.equal(MAX_COMMENT_CHARS, 2000);
  assert.equal(cleanComment('   \n\t '), '');
  assert.equal(cleanComment(null), '');
  assert.equal(cleanComment(undefined), '');
  assert.equal(cleanComment(42), '42');
});

test('cleanComments: drops empty, trims, handles non-objects', () => {
  assert.deepEqual(cleanComments({ q1: ' good ', q2: '   ', q3: '', q4: null, q5: 'x'.repeat(3000) }).q1, 'good');
  const out = cleanComments({ q1: ' good ', q2: '   ', q3: '', q4: null, q5: 'x'.repeat(3000) });
  assert.deepEqual(Object.keys(out), ['q1', 'q5']);
  assert.equal(out.q5.length, 2000);
  for (const bad of [null, undefined, 'str', 5, ['a', 'b']]) assert.deepEqual(cleanComments(bad), {});
});

test('safeHref accepts https/http/mailto', () => {
  assert.equal(safeHref('https://example.com/a?b=1#c'), 'https://example.com/a?b=1#c');
  assert.equal(safeHref('http://example.com'), 'http://example.com');
  assert.equal(safeHref('HTTPS://EXAMPLE.COM'), 'HTTPS://EXAMPLE.COM');
  assert.equal(safeHref('mailto:teacher@school.org'), 'mailto:teacher@school.org');
});

test('safeHref rejects unsafe', () => {
  for (const bad of [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', '/relative/path', 'relative.html', '//host/x',
    'https://exa mple.com', 'https://example.com/"onclick=', 'https://example.com/<b>', 'https://', 'mailto:', 'mailto:nope', '', '  ', null, undefined,
    'https://example.com/a\nb',
  ]) assert.equal(safeHref(bad), '', String(bad));
});

test('parseComment: bold, italic (both markers), links', () => {
  assert.deepEqual(parseComment('a **b** c'), [{ type: 'p', children: [T('a '), { type: 'strong', children: [T('b')] }, T(' c')] }]);
  assert.deepEqual(parseComment('*x* and _y_')[0].children, [
    { type: 'em', children: [T('x')] }, T(' and '), { type: 'em', children: [T('y')] },
  ]);
  assert.deepEqual(parseComment('see [site](https://example.com) ok')[0].children, [
    T('see '), { type: 'link', href: 'https://example.com', children: [T('site')] }, T(' ok'),
  ]);
  assert.deepEqual(parseComment('[mail](mailto:a@b.co)')[0].children, [{ type: 'link', href: 'mailto:a@b.co', children: [T('mail')] }]);
});

test('parseComment: bare URLs, trailing punctuation excluded', () => {
  const c = parseComment('Visit https://example.com/page.')[0].children;
  assert.deepEqual(c, [T('Visit '), { type: 'link', href: 'https://example.com/page', children: [T('https://example.com/page')] }, T('.')]);
  const d = parseComment('(see http://a.org/x, ok)')[0].children;
  const link = d.find((n) => n.type === 'link');
  assert.equal(link.href, 'http://a.org/x');
  assert.equal(d[d.length - 1].text, ', ok)');
});

test('parseComment: unsafe link keeps text as plain text', () => {
  const c = parseComment('[click](javascript:alert(1)) now');
  assert.ok(!JSON.stringify(c).includes('"link"'));
  assert.equal(commentToText('[click](javascript:alert(1))'), '[click](javascript:alert(1))');
  const d = parseComment('[x](data:text/html,hi)')[0].children;
  assert.deepEqual(d, [T('[x](data:text/html,hi)')]);
});

test('parseComment: lists (ul, ol, switching)', () => {
  const b = parseComment('- one\n- two\n1. first\n2. second');
  assert.deepEqual(b.map((x) => x.type), ['ul', 'ol']);
  assert.equal(b[0].items.length, 2);
  assert.deepEqual(b[0].items[0], [T('one')]);
  assert.deepEqual(b[1].items[1], [T('second')]);
  assert.equal(parseComment('* a\n* b')[0].type, 'ul');
  assert.equal(parseComment('- **b**')[0].items[0][0].type, 'strong');
});

test('parseComment: paragraphs and line breaks; list ends on blank/para', () => {
  const b = parseComment('line1\nline2\n\npara2');
  assert.equal(b.length, 2);
  assert.deepEqual(b[0].children, [T('line1'), { type: 'br' }, T('line2')]);
  assert.deepEqual(b[1].children, [T('para2')]);
  const c = parseComment('intro\n- a\ntext');
  assert.deepEqual(c.map((x) => x.type), ['p', 'ul', 'p']);
  assert.deepEqual(parseComment(''), []);
  assert.deepEqual(parseComment('  \n '), []);
});

test('parseComment: snake_case and 2*3*4 not italicised', () => {
  assert.deepEqual(parseComment('use snake_case_name here')[0].children, [T('use snake_case_name here')]);
  assert.deepEqual(parseComment('2*3*4 = 24')[0].children, [T('2*3*4 = 24')]);
});

test('parseComment: HTML-looking input stays as text nodes', () => {
  const c = parseComment('<script>alert(1)</script> <b>x</b> <img src=x onerror=y>');
  assert.equal(c.length, 1);
  assert.ok(c[0].children.every((n) => n.type === 'text'));
  assert.equal(c[0].children.map((n) => n.text).join(''), '<script>alert(1)</script> <b>x</b> <img src=x onerror=y>');
});

test('parseInline: deep nesting terminates', () => {
  const s = '**' + '*a*'.repeat(3) + '**';
  assert.ok(Array.isArray(parseInline(s)));
  assert.deepEqual(parseInline(null), []);
});

test('commentToText', () => {
  assert.equal(commentToText('**bold** and *it*'), 'bold and it');
  assert.equal(commentToText('[site](https://e.com)'), 'site (https://e.com)');
  assert.equal(commentToText('https://e.com/a'), 'https://e.com/a');
  assert.equal(commentToText('- a\n- b\n\n1. x\n2. y'), '• a\n• b\n\n1. x\n2. y');
  assert.equal(commentToText('a\nb\n\nc'), 'a\nb\n\nc');
  assert.equal(commentToText(''), '');
});
