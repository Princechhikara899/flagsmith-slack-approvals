import { appendFileSync } from 'node:fs';

// Append-only JSON Lines audit log: who requested, who approved, what changed.
export function writeAudit(path, event) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
  appendFileSync(path, line + '\n');
  return line;
}
