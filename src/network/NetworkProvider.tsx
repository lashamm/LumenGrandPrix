import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { NetworkId } from '../game/types';
import { networkConfig, type NetworkConfig } from './network';

/**
 * Delivers the currently selected network to the UI.
 *
 * The value itself lives in the player profile (one persisted source of truth);
 * this context only saves the prop drilling. `select` refuses any network that
 * is not playable, so the guard and the selector can never disagree.
 */
export interface NetworkState {
  network: NetworkId;
  config: NetworkConfig;
  /** Returns false when the network is refused; the selection never changes. */
  select: (next: NetworkId) => boolean;
}

const NetworkContext = createContext<NetworkState | null>(null);

export function NetworkProvider({
  network,
  onChange,
  children,
}: {
  network: NetworkId;
  onChange: (next: NetworkId) => void;
  children: ReactNode;
}): ReactNode {
  const select = useCallback(
    (next: NetworkId) => {
      const config = networkConfig(next);
      if (!config.playable) return false;
      onChange(next);
      return true;
    },
    [onChange],
  );

  const value = useMemo<NetworkState>(
    () => ({ network, config: networkConfig(network), select }),
    [network, select],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkState {
  const value = useContext(NetworkContext);
  if (!value) throw new Error('useNetwork must be used inside <NetworkProvider>');
  return value;
}
