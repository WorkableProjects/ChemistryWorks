// Offline / outbox banner state. Pure: bannerState(online, outbox) says what (if anything) to tell the student.

/** -> null | { kind: 'offline' | 'queued', text } */
export function bannerState({ online = true, outbox = 0 } = {}) {
  const n = Math.max(0, Number(outbox) || 0);
  if (!online) {
    return { kind: 'offline', text: n
      ? `Offline — ${n === 1 ? 'a submission is' : `${n} submissions are`} waiting and will be sent when you are back online`
      : 'Offline — your answers are saved on this device' };
  }
  if (n) return { kind: 'queued', text: `${n === 1 ? 'A submission is' : `${n} submissions are`} waiting to be sent to your teacher. It will be sent automatically; you can also send it now.` };
  return null;
}
