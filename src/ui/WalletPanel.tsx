import type { ReactNode } from 'react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { CLUSTER, useDevnetBalance, useWallet } from '../solana/SolanaProvider';
import { shortenAddress } from '../solana/phantom';

/**
 * Wallet / balance panel.
 *
 * Read-only by design: connects to Phantom, shows a shortened address and the
 * Devnet SOL balance, and can disconnect. It never asks for a private key or
 * seed phrase, and there is no place to send a transaction.
 */
export function WalletPanel({ compact = false }: { compact?: boolean }): ReactNode {
  const { adapter, connect, disconnect, connecting, connected, error } = useWallet();
  const balance = useDevnetBalance();

  const installed = adapter.readyState === WalletReadyState.Installed;

  return (
    <section className={`wallet${compact ? ' wallet--compact' : ''}`}>
      <header className="wallet__head">
        <h3 className="panel__title">WALLET</h3>
        <span className="badge badge--devnet" title="This prototype only uses Solana Devnet">
          {CLUSTER.toUpperCase()}
        </span>
      </header>

      <div className="wallet__env">
        <span className="dot dot--warn" aria-hidden="true" />
        <p>
          Devnet sandbox. No real SOL, no transactions, no signing. Wallet connection only.
        </p>
      </div>

      {connected && balance.address ? (
        <dl className="wallet__stats">
          <div>
            <dt>ADDRESS</dt>
            <dd className="mono">{shortenAddress(balance.address, 6, 6)}</dd>
          </div>
          <div>
            <dt>DEVNET SOL</dt>
            <dd className="mono">
              {balance.status === 'loading' && balance.sol === null
                ? 'loading…'
                : balance.sol !== null
                  ? balance.sol.toFixed(4)
                  : '—'}
            </dd>
          </div>
          <div>
            <dt>CLUSTER</dt>
            <dd className="mono">{CLUSTER}</dd>
          </div>
        </dl>
      ) : (
        <p className="wallet__empty">No wallet connected. Connect Phantom to link your racer identity.</p>
      )}

      {balance.error && <p className="wallet__error">{balance.error}</p>}
      {error && <p className="wallet__error">{error}</p>}

      <div className="wallet__actions">
        {connected ? (
          <>
            <button type="button" className="btn btn--ghost" onClick={() => void disconnect()}>
              DISCONNECT
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={balance.refresh}
              disabled={balance.status === 'loading'}
            >
              REFRESH
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void connect()}
            disabled={connecting}
          >
            {connecting ? 'CONNECTING…' : 'CONNECT PHANTOM'}
          </button>
        )}
      </div>

      {!installed && !connected && (
        <p className="wallet__hint">
          Phantom not detected. Install the extension, then reload this page.
        </p>
      )}

      <p className="wallet__legal">
        LumenGP never asks for your private key or seed phrase, and never stores wallet secrets.
      </p>
    </section>
  );
}

/** Compact wallet strip used on the main menu. */
export function WalletBadge({ onOpen }: { onOpen: () => void }): ReactNode {
  const { connected, publicKey } = useWallet();

  return (
    <button type="button" className="wallet-badge" onClick={onOpen}>
      <span className={`dot ${connected ? 'dot--ok' : 'dot--idle'}`} aria-hidden="true" />
      <span className="wallet-badge__label">WALLET</span>
      <span className="wallet-badge__value mono">
        {connected && publicKey ? shortenAddress(publicKey.toBase58(), 4, 4) : 'NOT CONNECTED'}
      </span>
    </button>
  );
}