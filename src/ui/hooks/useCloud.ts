import { useEffect, useState, useSyncExternalStore } from 'react';
import { cloudConfigured } from '@/data/cloud/config';
import type { CloudState } from '@/data/cloud/session';

type Session = typeof import('@/data/cloud/session');

const OFF: CloudState = { ready: true, session: null, sync: 'idle', error: null, recovery: false };
const noop = () => () => {};

/** Module compte/synchro chargé à la demande (null tant qu'il charge, ou si Supabase n'est pas configuré). */
export function useCloudModule(): Session | null {
  const [mod, setMod] = useState<Session | null>(null);
  useEffect(() => {
    if (cloudConfigured) void import('@/data/cloud/session').then(setMod);
  }, []);
  return mod;
}

export function useCloudState(mod: Session | null): CloudState {
  return useSyncExternalStore(mod?.cloudStore.subscribe ?? noop, mod?.cloudStore.get ?? (() => OFF));
}
