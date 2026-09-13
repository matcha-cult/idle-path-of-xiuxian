import { createContext, useContext } from 'react';
import type { RootStore } from './root-store.js';

const RootStoreContext = createContext<RootStore | null>(null);

export const RootStoreProvider = RootStoreContext.Provider;

export function useRootStore(): RootStore {
  const store = useContext(RootStoreContext);
  if (store === null) throw new Error('useRootStore 必须在 <RootStoreProvider> 内使用');
  return store;
}
