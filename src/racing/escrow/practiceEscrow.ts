import { PLATFORM_FEE, POOL_PER_ENTRY } from '../../game/config';
import { networkConfig, assertPlayableNetwork } from '../../network/network';
import {
  loadBankroll,
  newLedgerId,
  pushRow,
  saveBankroll,
  type Bankroll,
} from '../../state/bankroll';
import {
  InsufficientBankrollError,
  feeFor,
  payoutFor,
  potFor,
  roundSol,
  type EntryReceipt,
  type Escrow,
  type RaceEntryRequest,
  type RaceOutcome,
  type Settlement,
} from './types';

interface BankrollStore {
  get(): Bankroll;
  set(next: Bankroll): void;
}

function defaultStore(): BankrollStore {
  let cached: Bankroll | null = null;
  return {
    get() {
      if (!cached) cached = loadBankroll();
      return cached;
    },
    set(next) {
      cached = next;
      saveBankroll(next);
    },
  };
}

/**
 * Local-ledger escrow for DEVNET practice races.
 *
 * Locks the stake when the player enters and pays the result back on settle.
 * Every field that a real program would fill (`reference`, `method`,
 * `onChain`) is set to something that cannot be mistaken for a signature.
 */
export class PracticeEscrow implements Escrow {
  readonly id = 'practice-ledger' as const;
  readonly onChain = false;
  readonly label = 'DEVNET PRACTICE LEDGER';
  readonly requiresConfirmation = true;

  private readonly store: BankrollStore;

  constructor(store: BankrollStore = defaultStore()) {
    this.store = store;
  }

  isAvailable(): boolean {
    return true;
  }

  /** Current practice balance, in DEVNET SOL. */
  get balance(): number {
    return this.store.get().balanceSol;
  }

  /** Rows newest-first, for the ledger panel. */
  get rows() {
    return this.store.get().rows;
  }

  async enter(request: RaceEntryRequest): Promise<EntryReceipt> {
    assertPlayableNetwork(request.network);
    const amount = roundSol(Math.max(0, request.amountSol));
    const currency = networkConfig(request.network).currency;

    if (amount === 0) {
      return {
        escrowId: this.id,
        network: request.network,
        amountSol: 0,
        reference: 'NO-STAKE',
        onChain: false,
        method: 'local-ledger',
        bankrollAfter: this.balance,
        createdAt: Date.now(),
      };
    }

    const bankroll = this.store.get();
    if (bankroll.balanceSol < amount) throw new InsufficientBankrollError();

    const reference = newLedgerId('LN');
    const next = pushRow(bankroll, {
      id: reference,
      at: Date.now(),
      kind: 'entry',
      amountSol: amount,
      deltaSol: -amount,
      reference,
      note: `Entry locked · ${amount.toFixed(3)} ${currency}`,
    });
    this.store.set(next);

    return {
      escrowId: this.id,
      network: request.network,
      amountSol: amount,
      reference,
      onChain: false,
      method: 'local-ledger',
      bankrollAfter: next.balanceSol,
      createdAt: Date.now(),
    };
  }

  async settle(request: RaceEntryRequest, outcome: RaceOutcome): Promise<Settlement> {
    assertPlayableNetwork(request.network);
    const amount = roundSol(Math.max(0, request.amountSol));
    const currency = networkConfig(request.network).currency;
    const settledAt = Date.now();

    if (amount === 0) {
      return {
        escrowId: this.id,
        network: request.network,
        amountSol: 0,
        poolSol: 0,
        feeSol: 0,
        payoutSol: 0,
        profitSol: 0,
        outcome,
        reference: 'NO-STAKE',
        onChain: false,
        method: 'local-ledger',
        bankrollAfter: this.balance,
        settledAt,
      };
    }

    const pool = potFor(amount, POOL_PER_ENTRY);
    const fee = feeFor(pool, PLATFORM_FEE);
    const payout = outcome === 'win' ? payoutFor(pool, PLATFORM_FEE) : outcome === 'draw' ? amount : 0;
    const reference = newLedgerId('TX');

    const bankroll = this.store.get();
    const next = pushRow(bankroll, {
      id: reference,
      at: settledAt,
      kind: 'settle',
      amountSol: amount,
      deltaSol: payout,
      reference,
      note:
        outcome === 'win'
          ? `Practice win · +${payout.toFixed(3)} ${currency}`
          : outcome === 'draw'
            ? `Refunded · ${payout.toFixed(3)} ${currency}`
            : `Practice loss · −${amount.toFixed(3)} ${currency}`,
    });
    this.store.set(next);

    return {
      escrowId: this.id,
      network: request.network,
      amountSol: amount,
      poolSol: pool,
      feeSol: outcome === 'win' ? fee : 0,
      payoutSol: payout,
      profitSol: roundSol(payout - amount),
      outcome,
      reference,
      onChain: false,
      method: 'local-ledger',
      bankrollAfter: next.balanceSol,
      settledAt,
    };
  }
}
