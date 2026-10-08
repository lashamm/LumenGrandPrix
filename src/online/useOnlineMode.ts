import { useCallback, useEffect, useState } from 'react';
import { onlineModeService, type OnlineKind, type OnlineSession } from './OnlineModeService';

export interface OnlineMode extends OnlineSession {
  connect: (kind: OnlineKind) => void;
  setReady: (ready: boolean) => void;
  leave: () => void;
}

/** Subscribes the component to the shared lobby session. */
export function useOnlineMode(): OnlineMode {
  const [session, setSession] = useState<OnlineSession>(() => onlineModeService.snapshot());

  useEffect(() => onlineModeService.subscribe(setSession), []);

  const connect = useCallback((kind: OnlineKind) => onlineModeService.connect(kind), []);
  const setReady = useCallback((ready: boolean) => onlineModeService.setReady(ready), []);
  const leave = useCallback(() => onlineModeService.leave(), []);

  return { ...session, connect, setReady, leave };
}
