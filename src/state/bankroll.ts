/**
 * Local practice ledger.
 *
 * This is the honest stand-in for an escrow program: a balance and a short
 * history persisted in `localStorage`. It never touches the chain and never
 * claims to have. Once a reviewed on-chain program exists it replaces this
 * module behind the same `Escrow` interface.
 */

const STORAGE_KEY = 'lumengp.bankroll.v1';

/** Balance every new player starts with, in DEVNET SOL. */
export const STARTING_BANKROLL = 1;

/** How many ledger rows to keep. Older rows are dropped, the balance is not. */
const MAX_ROWS = 24;

export interface LedgerRow {
  id: string;
  at: number;
  /** `entry` locks a stake, `settle` pays the result back. */
  kind: 'entry' | 'settle';
  amountSol: number;
  /** Signed change to the balance caused by this row. */
  deltaSol: number;
  reference: string;
  note: string;
}

export interface Bankroll {
  balanceSol: number;
  rows: LedgerRow[];
}

export const EMPTY_BANKROLL: Bankroll = {
  balanceSol: STARTING_BANKROLL,
  rows: [],
};

export function loadBankroll(): Bankroll {
  if (typeof localStorage === 'undefined') return { ...EMPTY_BANKROLL, rows: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_BANKROLL, rows: [] };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY_BANKROLL, rows: [] };
    const record = parsed as Record<string, unknown>;
    const balance = typeof record.balanceSol === 'number' && Number.isFinite(record.balanceSol) ? record.balanceSol : NaN;
    if (!Number.isFinite(balance) || balance < 0) return { ...EMPTY_BANKROLL, rows: [] };
    const rows = Array.isArray(record.rows) ? (record.rows as LedgerRow[]).filter(isLedgerRow) : [];
    return { balanceSol: balance, rows: rows.slice(0, MAX_ROWS) };
  } catch {
    return { ...EMPTY_BANKROLL, rows: [] };
  }
}

export function saveBankroll(bankroll: Bankroll): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ balanceSol: bankroll.balanceSol, rows: bankroll.rows.slice(0, MAX_ROWS) }),
    );
  } catch {
    // Private mode / quota: the session keeps playing on the in-memory value.
  }
}

export function pushRow(bankroll: Bankroll, row: LedgerRow): Bankroll {
  return {
    balanceSol: Math.round((bankroll.balanceSol + row.deltaSol) * 1e9) / 1e9,
    rows: [row, ...bankroll.rows].slice(0, MAX_ROWS),
  };
}

export function newLedgerId(prefix: string): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const salt = Math.floor(Math.random() * 0xffffff)
    .toString(36)
    .toUpperCase()
    .padStart(5, '0');
  return `${prefix}-${stamp}-${salt}`;
}

function isLedgerRow(value: unknown): value is LedgerRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.at === 'number' &&
    (row.kind === 'entry' || row.kind === 'settle') &&
    typeof row.amountSol === 'number' &&
    typeof row.deltaSol === 'number' &&
    typeof row.reference === 'string' &&
    typeof row.note === 'string'
  );
}
