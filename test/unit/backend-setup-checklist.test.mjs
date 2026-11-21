// setup() returns a checklist of what a fresh deployment still needs; diag shows the same data to admins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGas, plain } from './helpers/gas.mjs';

const byId = (list) => Object.fromEntries(plain(list).map((c) => [c.id, c]));

test('setup checklist: a bare deployment lists every missing step with a hint', () => {
  const g = makeGas({ ADMIN_KEY: undefined, GOOGLE_CLIENT_ID: undefined });
  const c = byId(g.run('setupChecklist_()'));
  assert.equal(c.adminKey.ok, false);
  assert.equal(c.googleClientId.ok, false);
  assert.equal(c.adminOwner.ok, false);
  assert.equal(c.triggers.ok, false);
  assert.ok(c.googleClientId.hint.includes('GOOGLE_CLIENT_ID'));
  assert.ok(c.adminOwner.hint.includes('Admins'));
  assert.equal(c.classroomScopes, undefined, 'no Classroom item without the advanced service');
});

test('setup(): installs the trigger, seeds the owner and returns an all-ticked list', () => {
  const g = makeGas({ ADMIN_KEY: 'secret', GOOGLE_CLIENT_ID: 'client-1', ADMIN_EMAILS: 'owner@school.org' });
  const list = plain(g.run('setup()'));
  assert.ok(list.every((c) => c.ok), JSON.stringify(list));
  assert.deepEqual(list.map((c) => c.id), ['adminKey', 'googleClientId', 'adminOwner', 'triggers']);
  assert.ok(list.every((c) => c.hint === ''));
});

test('setup checklist: an Admins sheet with only plain admins is not ticked', () => {
  const g = makeGas({ ADMIN_EMAILS: undefined });
  g.run('ensureAdmins_()');
  g.ctx.getSheet_('Admins', g.run('ADMIN_HEADERS')).appendRow(['a@school.org', 'admin', 'x', new Date()]);
  assert.equal(byId(g.run('setupChecklist_()')).adminOwner.ok, false);
});

test('setup checklist: Classroom item appears when the service is enabled, ticked only if permissions work', () => {
  const g = makeGas();
  g.ctx.Classroom = { Courses: { list: () => { throw new Error('no scope'); } } };
  assert.equal(byId(g.run('setupChecklist_()')).classroomScopes.ok, false);
  g.ctx.Classroom = { Courses: { list: () => ({ courses: [] }) } };
  assert.equal(byId(g.run('setupChecklist_()')).classroomScopes.ok, true);
});

test('diag: carries the checklist for the Platform panel, admins only', () => {
  const g = makeGas();
  assert.equal(g.post({ action: 'diag' }).result, 'error');
  const r = g.A({ action: 'diag' });
  assert.equal(r.result, 'success');
  assert.ok(Array.isArray(r.checklist) && r.checklist.length >= 4);
  assert.ok(r.checklist.every((c) => typeof c.id === 'string' && typeof c.ok === 'boolean'));
});
