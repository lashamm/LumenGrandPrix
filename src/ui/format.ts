/** Race time formatting: seconds with two decimals, or a dash when unset. */
export function formatTime(time: number | null | undefined): string {
  if (time === null || time === undefined || !Number.isFinite(time) || time <= 0) return '—';
  return `${time.toFixed(2)}s`;
}

/** SOL amount: always signed when `signed`, never more than 9 decimals. */
export function formatSol(value: number | null | undefined, currency = 'DEVNET SOL', signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return `— ${currency}`;
  const fixed = Math.abs(value) >= 1 ? value.toFixed(4) : value.toFixed(9);
  const body = signed && value > 0 ? `+${fixed}` : fixed;
  return `${body} ${currency}`;
}