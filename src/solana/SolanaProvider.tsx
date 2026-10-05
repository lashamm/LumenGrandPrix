import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { PhantomWalletAdapter } from './PhantomWalletAdapter';
import { describeWalletError } from './phantom';

/**
 * Solana plumbing for the prototype.
 *
 * This replaces `@solana/wallet-adapter-react` on purpose. That package imports
 * `@solana-mobile/wallet-adapter-mobile` at module scope, which drags in
 * `react-native` and pulls a second copy of `@types/react` into the type graph —
 * which then breaks every JSX element in the app. For a browser-only prototype
 * that only needs connect/disconnect, a ~40 line local binding is the honest fix.
 *
 * The adapter itself is still a real `BaseWalletAdapter` from
 * `@solana/wallet-adapter-base`; only the React glue is ours.
 */

/** Solana Devnet RPC endpoint. This prototype never touches mainnet. */
export const DEVNET_RPC = 'https://api.devnet.solana.com';
export const CLUSTER = 'devnet';

const phantomAdapter = new PhantomWalletAdapter();

/** Exposed so UI can read adapter state (e.g. `readyState`) without extra plumbing. */
export { phantomAdapter };

/** One connection for the whole app; it is stateless and safe to share. */
const connection = new Connection(DEVNET_RPC, 'confirmed');

export function useConnection(): Connection {
  return connection;
}

export interface WalletState {
  adapter: PhantomWalletAdapter;
  publicKey: PublicKey | null;
  address: string | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

export function SolanaProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(() => phantomAdapter.publicKey);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onConnect = (key: PublicKey) => setPublicKey(key);
    const onDisconnect = () => setPublicKey(null);
    const onError = (cause: unknown) => setError(describeWalletError(cause));

    phantomAdapter.on('connect', onConnect);
    phantomAdapter.on('disconnect', onDisconnect);
    phantomAdapter.on('error', onError);
    return () => {
      phantomAdapter.off('connect', onConnect);
      phantomAdapter.off('disconnect', onDisconnect);
      phantomAdapter.off('error', onError);
    };
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      await phantomAdapter.connect();
      setPublicKey(phantomAdapter.publicKey);
    } catch (cause) {
      setError(describeWalletError(cause));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      await phantomAdapter.disconnect();
    } catch (cause) {
      setError(describeWalletError(cause));
    }
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      adapter: phantomAdapter,
      publicKey,
      address: publicKey?.toBase58() ?? null,
      connected: publicKey !== null,
      connecting,
      error,
      connect,
      disconnect,
    }),
    [publicKey, connecting, error, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/**
 * Wallet state for the UI.
 *
 * Throws outside `SolanaProvider` rather than returning a half-populated object,
 * so a missing provider shows up immediately instead of as a silent null.
 */
export function useWallet(): WalletState {
  const value = useContext(WalletContext);
  if (!value) throw new Error('useWallet must be used inside <SolanaProvider>');
  return value;
}

export type BalanceStatus = 'disconnected' | 'loading' | 'ready' | 'error';

export interface DevnetBalance {
  address: string | null;
  sol: number | null;
  status: BalanceStatus;
  error: string | null;
  refresh: () => void;
}

const POLL_INTERVAL_MS = 20_000;

/**
 * Read the connected wallet's Devnet SOL balance.
 *
 * Polls gently rather than per frame, and re-reads whenever the public key
 * changes. This is public chain data only: no transaction is ever built or signed.
 */
export function useDevnetBalance(): DevnetBalance {
  const { address } = useWallet();

  const [sol, setSol] = useState<number | null>(null);
  const [status, setStatus] = useState<BalanceStatus>(() => (address ? 'loading' : 'disconnected'));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!address) {
      setSol(null);
      setError(null);
      setStatus('disconnected');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    const read = async () => {
      try {
        const lamports = await connection.getBalance(new PublicKey(address));
        if (cancelled) return;
        setSol(lamports / LAMPORTS_PER_SOL);
        setStatus('ready');
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setSol(null);
        setStatus('error');
        setError(cause instanceof Error ? cause.message : 'Could not read Devnet balance.');
      }
    };

    void read();
    const timer = window.setInterval(() => void read(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [address, nonce]);

  return { address, sol, status, error, refresh };
}
