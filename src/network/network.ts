import type { NetworkId } from '../game/types';

/**
 * Solana network configuration.
 *
 * Exactly one place decides which cluster the app is pointed at. Devnet is the
 * default and the only playable network: mainnet is declared here so the UI can
 * name it honestly, but `playable` stays false until a reviewed escrow program
 * exists. Nothing in the app may build a transaction without going through the
 * guard in `networkGuard`.
 */
export interface NetworkConfig {
  id: NetworkId;
  /** Shown next to every balance and every confirmation dialog. */
  label: string;
  /** Short badge text. */
  badge: string;
  rpcUrl: string;
  /** Cluster name accepted by `@solana/web3.js`. */
  cluster: 'devnet' | 'mainnet-beta';
  /** Unit shown beside balances. */
  currency: 'DEVNET SOL' | 'SOL';
  /** True only for networks the app is allowed to transact on. */
  playable: boolean;
  /** Safety copy displayed in the switch dialog. */
  notice: string;
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  devnet: {
    id: 'devnet',
    label: 'SOLANA DEVNET',
    badge: 'DEVNET PRACTICE',
    rpcUrl: 'https://api.devnet.solana.com',
    cluster: 'devnet',
    currency: 'DEVNET SOL',
    playable: true,
    notice: 'Test SOL only. Every balance and settlement shown here is a Devnet or local-practice figure.',
  },
  mainnet: {
    id: 'mainnet',
    label: 'SOLANA MAINNET',
    badge: 'MAINNET PLAYABLE',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    cluster: 'mainnet-beta',
    currency: 'SOL',
    playable: false,
    notice:
      'COMING SOON — mainnet is disabled until an audited escrow program is deployed. No transaction can be built or sent while this network is selected.',
  },
};

export const DEFAULT_NETWORK: NetworkId = 'devnet';

/** Networks the player is allowed to select today. */
export const PLAYABLE_NETWORKS: readonly NetworkId[] = ['devnet'];

export function networkConfig(id: NetworkId): NetworkConfig {
  return NETWORKS[id] ?? NETWORKS[DEFAULT_NETWORK];
}

export function isNetworkPlayable(id: NetworkId): boolean {
  return networkConfig(id).playable;
}

/** Guarded by every entry/settlement path. Fails closed, never opens silently. */
export function assertPlayableNetwork(id: NetworkId): NetworkConfig {
  const config = networkConfig(id);
  if (!config.playable) {
    throw new Error(`${config.label} is not playable yet. Switch to ${NETWORKS[DEFAULT_NETWORK].label}.`);
  }
  return config;
}
