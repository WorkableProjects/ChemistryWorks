// Namespaced, exception-safe wrappers over localStorage / sessionStorage.
// Storage can be unavailable (private mode, blocked site data); every call degrades to a no-op.

const PREFIX = 'cw:';

function area(kind) {
  try {
    const s = kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
    return s || null;
  } catch {
    return null;
  }
}

export function load(key, fallback = null, kind = 'local') {
  try {
    const raw = area(kind)?.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value, kind = 'local') {
  try {
    area(kind)?.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key, kind = 'local') {
  try {
    area(kind)?.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

// Keys (without prefix) that start with `startsWith`.
export function keys(startsWith = '', kind = 'local') {
  const s = area(kind);
  if (!s) return [];
  const out = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX + startsWith)) out.push(k.slice(PREFIX.length));
    }
  } catch {
    /* ignore */
  }
  return out;
}
