import {
  OnChainUnavailableError,
  type EntryReceipt,
  type Escrow,
  type RaceEntryRequest,
  type RaceOutcome,
  type Settlement,
} from './types';

/**
 * Placeholder for the real Anchor escrow program.
 *
 * It is wired into the same `Escrow` interface so the UI already knows where a
 * settlement would come from, but it refuses every operation. It has no wallet,
 * no connection and no program id — there is deliberately no way to make it
 * return a signature, so it cannot be mistaken for a working implementation.
 *
 * Implementing it means: deploy and audit an escrow program, pass its program id
 * here, and build the transaction from the connected wallet. Until then
 * `isAvailable()` returns false and the race entry screen disables mainnet.
 */
export class OnChainEscrow implements Escrow {
  readonly id = 'on-chain-program' as const;
  readonly onChain = true;
  readonly label = 'ON-CHAIN ESCROW';
  readonly requiresConfirmation = true;

  isAvailable(): boolean {
    return false;
  }

  async enter(_request: RaceEntryRequest): Promise<EntryReceipt> {
    throw new OnChainUnavailableError();
  }

  async settle(_request: RaceEntryRequest, _outcome: RaceOutcome): Promise<Settlement> {
    throw new OnChainUnavailableError();
  }
}
