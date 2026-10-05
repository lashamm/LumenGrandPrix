/** Race time formatting: seconds with two decimals, or a dash when unset. */
export function formatTime(time: number | null | undefined): string {
  if (time === null || time === undefined || !Number.isFinite(time) || time <= 0) return '—';
  return `${time.toFixed(2)}s`;
}