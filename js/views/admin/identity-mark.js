// "Unverified" mark for submissions whose student email was typed in, not taken from a verified Google sign-in
// (the backend stores identity = 'unverified'). Rows written before identity existed ('') and verified rows show nothing.
import { h, icon } from '../../ui.js';

export function isUnverified(row) {
  return !!row && row.identity === 'unverified';
}

/** A small warning pill, or null for verified and older rows. */
export function unverifiedMark(row) {
  if (!isUnverified(row)) return null;
  return h('span', {
    class: 'pill pill--warning', title: 'The student’s email was not verified by Google sign-in.', dataset: { testid: 'unverified-mark' },
  }, icon('alert', { size: 13 }), 'Unverified');
}
