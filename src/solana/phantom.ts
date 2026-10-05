import type { PublicKey } from '@solana/web3.js';
import type { WalletError } from '@solana/wallet-adapter-base';

/** The slice of Phantom's injected provider that the prototype actually uses. */
export interface PhantomProvider {
  isPhantom?: boolean;
  connect(): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    /** Legacy injection point, still populated by current Phantom builds. */
    solana?: PhantomProvider;
  }
}

/**
 * Resolve the injected Phantom provider.
 *
 * We only ever ask Phantom to `connect()` so it can hand back a public key and
 * sign nothing. No private key or seed phrase is ever requested, read, or stored.
 */
export function getPhantomProvider(): PhantomProvider | null {
  if (typeof window === 'undefined') return null;
  const candidate = window.phantom?.solana ?? window.solana;
  return candidate ?? null;
}

export function shortenAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export function describeWalletError(error: unknown): string {
  const walletError = error as Partial<WalletError> | undefined;
  if (walletError && typeof walletError.message === 'string') return walletError.message;
  if (error instanceof Error) return error.message;
  return 'Wallet connection failed.';
}