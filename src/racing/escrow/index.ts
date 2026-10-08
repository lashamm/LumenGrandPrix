import { PLATFORM_FEE, POOL_PER_ENTRY } from '../../game/config';
import { networkConfig } from '../../network/network';
import type { NetworkId, RaceMode } from '../../game/types';
import { OnChainEscrow } from './onChainEscrow';
import { PracticeEscrow } from './practiceEscrow';
import { feeFor, payoutFor, potFor, roundSol, type Escrow, type RaceEntryRequest } from './types';

export * from './types';
export { PracticeEscrow } from './practiceEscrow';
export { OnChainEscrow } from './onChainEscrow';

/** Devnet settles against the local ledger; mainnet is reserved for the program. */
const practice = new PracticeEscrow();
const onChain = new OnChainEscrow();

export function escrowFor(network: NetworkId): Escrow {
  return networkConfig(network).playable ? practice : onChain;
}

/** True when this mode actually moves a stake. */
export function usesEntry(mode: RaceMode): boolean {
  return mode === 'wager';
}

export interface EntryBreakdown {
  amountSol: number;
  poolSol: number;
  feeSol: number;
  payoutSol: number;
  profitOnWinSol: number;
  profitOnLossSol: number;
}

/** Numbers the confirmation dialog shows before the player commits. */
export function describeEntry(request: RaceEntryRequest): EntryBreakdown {
  const amount = roundSol(Math.max(0, request.amountSol));
  const pool = potFor(amount, POOL_PER_ENTRY);
  const fee = feeFor(pool, PLATFORM_FEE);
  const payout = payoutFor(pool, PLATFORM_FEE);
  return {
    amountSol: amount,
    poolSol: roundSol(pool),
    feeSol: roundSol(fee),
    payoutSol: roundSol(payout),
    profitOnWinSol: roundSol(payout - amount),
    profitOnLossSol: roundSol(-amount),
  };
}

/** Practice bankroll balance in DEVNET SOL. */
export function practiceBalance(): number {
  return practice.balance;
}

export { practice as practiceEscrow, onChain as onChainEscrow };
