import {
  BaseWalletAdapter,
  WalletReadyState,
  type TransactionOrVersionedTransaction,
  type WalletError,
  type WalletName,
} from '@solana/wallet-adapter-base';
import { PublicKey } from '@solana/web3.js';
import { describeWalletError, getPhantomProvider, type PhantomProvider } from './phantom';

/**
 * Minimal Phantom adapter.
 *
 * The prototype deliberately implements this by hand rather than pulling in the
 * whole `@solana/wallet-adapter-wallets` package: that meta-package installs a
 * dozen chains' worth of adapters, which is a lot of surface area for an MVP that
 * only needs to read a public key and a Devnet balance.
 *
 * It connects, reports a public key, and nothing else. No signing, no private
 * keys, no seed phrases. Adding transactions later means implementing
 * `sendTransaction`, which is the only place signing would ever belong.
 */
export class PhantomWalletAdapter extends BaseWalletAdapter {
  readonly name: WalletName<'Phantom'> = 'Phantom' as WalletName<'Phantom'>;
  readonly url = 'https://phantom.app';
  readonly icon =
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iOCIgZmlsbD0iIiNlODZlZmYiLz48cGF0aCBkPSJNMyAxNi4wYzEtNiAwTDAgTjAuMGwxLjhsOCA0IDQgMCAwIDQtLjE2IDYtMS42IDYtNi4xLjYgMCAwIDAtNi4xNiAxLjggNC44IDR6IiBmaWxsPSIjZmZmIi8+PC9zdmc+';

  readonly supportedTransactionVersions = null;

  private provider: PhantomProvider | null = null;
  private _publicKey: PublicKey | null = null;
  private _connecting = false;
  private _readyState: WalletReadyState = WalletReadyState.NotDetected;

  private readonly onProviderConnect = (...args: unknown[]) => {
    const key = args[0] as { publicKey?: PublicKey } | undefined;
    if (key?.publicKey) this.setPublicKey(key.publicKey);
  };
  private readonly onProviderDisconnect = () => {
    this.setPublicKey(null);
  };
  private readonly onAccountChanged = (...args: unknown[]) => {
    const key = args[0] as PublicKey | null;
    this.setPublicKey(key);
  };
  private readonly onProviderError = (error: unknown) => {
    this.emit('error', toWalletError(error));
  };

  constructor() {
    super();
    this.provider = getPhantomProvider();
    this._readyState = this.provider ? WalletReadyState.Installed : WalletReadyState.NotDetected;
    this.attachProviderListeners();
  }

  get readyState(): WalletReadyState {
    return this._readyState;
  }

  get publicKey(): PublicKey | null {
    return this._publicKey;
  }

  get connecting(): boolean {
    return this._connecting;
  }

  async connect(): Promise<void> {
    if (this._connecting) return;
    if (!this.provider) {
      this.emit('error', toWalletError(new Error('Phantom not detected. Install the Phantom extension to continue.')));
      return;
    }
    this._connecting = true;
    try {
      const { publicKey } = await this.provider.connect();
      this.setPublicKey(publicKey);
    } catch (cause) {
      this.emit('error', toWalletError(cause));
      throw cause;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.provider) return;
    try {
      await this.provider.disconnect();
    } finally {
      this.setPublicKey(null);
    }
  }

  /**
   * Intentionally unimplemented: this prototype never asks a wallet to sign.
   *
   * `BaseWalletAdapter` requires the method, so it throws instead. If signing is
   * ever needed it belongs here and nowhere else.
   */
  async sendTransaction(_transaction: TransactionOrVersionedTransaction<null>): Promise<string> {
    throw new Error('LumenGP does not send transactions yet. This prototype is read-only on Solana.');
  }

  private setPublicKey(publicKey: PublicKey | null): void {
    const changed = (this._publicKey?.toBase58() ?? null) !== (publicKey?.toBase58() ?? null);
    this._publicKey = publicKey;
    if (!changed) return;
    if (publicKey) {
      this.emit('connect', publicKey);
    } else {
      this.emit('disconnect');
    }
  }

  private attachProviderListeners(): void {
    const provider = this.provider;
    if (!provider) return;
    provider.on('connect', this.onProviderConnect);
    provider.on('disconnect', this.onProviderDisconnect);
    provider.on('accountChanged', this.onAccountChanged);
    provider.on('error', this.onProviderError);
  }
}

function toWalletError(error: unknown): WalletError {
  const message = describeWalletError(error);
  return {
    name: 'WalletError',
    message,
    error: error instanceof Error ? error : new Error(message),
  };
}