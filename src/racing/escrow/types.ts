import type { NetworkId, RaceMode } from '../../game/types';

/**
 * Escrow interfaces.
 *
 * Two implementations exist and they are deliberately not interchangeable at the
 * UI layer: `PracticeEscrow` settles against a local ledger and `OnChainEscrow`
 * is a stub that fails closed. Nothing in this file can produce a transaction
 * signature, so no code path can pretend a transfer happened.
 */

export type EscrowId = 'practice-ledger' | 'on-chain-program';

export type SettlementMethod = 'local-ledger' | 'on-chain-program';

export interface RaceEntryRequest {
  network: NetworkId;
  mode: RaceMode;
  /** Stake in SOL. `0` for modes that do not wager. */
  amountSol: number;
}

export interface EntryReceipt {
  escrowId: EscrowId;
  network: NetworkId;
  amountSol: number;
  /** Human reference: a ledger row id now, a signature once a program exists. */
  reference: string;
  onChain: boolean;
  method: SettlementMethod;
  bankrollAfter: number;
  createdAt: number;
}

export type RaceOutcome = 'win' | 'loss' | 'draw';

export interface Settlement {
  escrowId: EscrowId;
  network: NetworkId;
  amountSol: number;
  poolSol: number;
  feeSol: number;
  payoutSol: number;
  /** Positive when the player is up after this race. */
  profitSol: number;
  outcome: RaceOutcome;
  reference: string;
  onChain: boolean;
  method: SettlementMethod;
  bankrollAfter: number;
  settledAt: number;
}

export interface Escrow {
  readonly id: EscrowId;
  readonly onChain: boolean;
  /** Short label shown in the confirmation dialog. */
  readonly label: string;
  /** True when the player must read and accept a dialog before entering. */
  readonly requiresConfirmation: boolean;
  /** False for the on-chain stub — the UI must then refuse the race. */
  isAvailable(): boolean;
  enter(request: RaceEntryRequest): Promise<EntryReceipt>;
  settle(request: RaceEntryRequest, outcome: RaceOutcome): Promise<Settlement>;
}

export class OnChainUnavailableError extends Error {
  constructor() {
    super('On-chain escrow is not deployed. No transaction was created.');
    this.name = 'OnChainUnavailableError';
  }
}

export class InsufficientBankrollError extends Error {
  constructor() {
    super('Practice bankroll is too low for that entry.');
    this.name = 'InsufficientBankrollError';
  }
}

export class NetworkNotAllowedError extends Error {
  constructor() {
    super('That network is not playable. No transaction was created.');
    this.name = 'NetworkNotAllowedError';
  }
}

/** Prize pool for a head-to-head race before fees. */
export function potFor(amountSol: number, poolPerEntry: number): number {
  return amountSol * poolPerEntry;
}

/** Platform rake taken out of the pot. */
export function feeFor(potSol: number, platformFee: number): number {
  return potSol * platformFee;
}

/** What the winner is paid out of the pot. */
export function payoutFor(potSol: number, platformFee: number): number {
  return potSol - feeFor(potSol, platformFee);
}

/** Rounds to 9 decimal places — the smallest unit a SOL UI should show. */
export function roundSol(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}
