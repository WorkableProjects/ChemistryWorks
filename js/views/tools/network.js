// Offline / outbox banner state. Pure: bannerState(online, outbox) says what (if anything) to tell the student.

/** -> null | { kind: 'offline' | 'queued', text } */
export function bannerState({ online = true, outbox = 0 } = {}) {
  const n = Math.max(0, Number(outbox) || 0);
  if (!online) {
    return { kind: 'offline', text: n
      ? `You are offline. ${n === 1 ? 'A submission is' : `${n} submissions are`} waiting to be sent and will go out when you are back online.`
      : 'You are offline. Your answers are saved on this device; keep working and submit when you are back online.' };
  }
  if (n) return { kind: 'queued', text: `${n === 1 ? 'A submission is' : `${n} submissions are`} waiting to be sent to your teacher. It will be sent automatically; you can also send it now.` };
  return null;
}
