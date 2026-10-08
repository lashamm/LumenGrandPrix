import type { ReactNode } from 'react';
import { NETWORKS, networkConfig } from '../network/network';
import type { NetworkId } from '../game/types';

/**
 * Network badge shown on every screen.
 *
 * The label always comes from `networkConfig`, so there is no second copy of the
 * cluster name that could drift out of sync with what the app actually uses.
 */
export function NetworkBadge({ network, onSwitch }: { network: NetworkId; onSwitch?: () => void }): ReactNode {
  const config = networkConfig(network);
  return (
    <button
      type="button"
      className={`network-badge${config.playable ? '' : ' network-badge--locked'}`}
      onClick={onSwitch}
      disabled={!onSwitch}
      title={onSwitch ? `${config.label} — tap to change network` : `${config.label} · fixed for this race`}
    >
      <span className={`dot ${config.playable ? 'dot--ok' : 'dot--warn'}`} aria-hidden="true" />
      <span>{config.badge}</span>
      <span className="network-badge__chevron" aria-hidden="true">
        ▾
      </span>
    </button>
  );
}

/** Full network picker. Mainnet stays selectable only to explain why it is off. */
export function NetworkDialog({
  current,
  onSelect,
  onClose,
}: {
  current: NetworkId;
  onSelect: (next: NetworkId) => void;
  onClose: () => void;
}): ReactNode {
  return (
    <div className="dialog-overlay" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Select network"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dialog__head">
          <h3>NETWORK</h3>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            ✕
          </button>
        </header>

        <p className="dialog__note">
          The active cluster is shown next to every balance and every settlement. The app never
          switches you off Devnet on its own.
        </p>

        <ul className="network-list">
          {(Object.keys(NETWORKS) as NetworkId[]).map((id) => {
            const config = NETWORKS[id];
            const selected = id === current;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`network-option${selected ? ' is-active' : ''}${config.playable ? '' : ' is-locked'}`}
                  disabled={!config.playable}
                  onClick={() => {
                    onSelect(id);
                    onClose();
                  }}
                >
                  <span className="network-option__label">
                    {config.label}
                    {selected ? <span className="network-option__you"> · ACTIVE</span> : null}
                  </span>
                  <span className={`badge${config.playable ? ' badge--devnet' : ' badge--soon'}`}>
                    {config.playable ? 'PLAYABLE' : 'COMING SOON'}
                  </span>
                  <span className="network-option__notice">{config.notice}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="dialog__note dialog__note--muted">
          Mainnet stays disabled until an audited escrow program exists. Switching networks is always
          a manual, visible action — nothing here changes clusters behind your back.
        </p>
      </div>
    </div>
  );
}
