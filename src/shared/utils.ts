export function nowIso(): string {
  return new Date().toISOString();
}

export function randomId(prefix = "id"): string {
  if (crypto?.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const rand = Math.random().toString(16).slice(2, 10);
  return `${prefix}-${rand}`;
}


