import { create } from 'zustand';
import type { ConfigView } from '../types/api';

interface AppState {
  userId: string;
  csrfToken: string;
  config: ConfigView | null;
  selectedRepoId: number | null;
  setConfig: (config: ConfigView) => void;
  setCsrfToken: (csrfToken: string) => void;
  setSelectedRepoId: (repoId: number | null) => void;
}

/* 管理全局用户、CSRF 和当前选中仓库状态。 */
export const useAppStore = create<AppState>((set) => ({
  userId: import.meta.env.VITE_DEFAULT_USER_ID ?? 'local-user',
  csrfToken: '',
  config: null,
  selectedRepoId: null,
  setConfig: (config) =>
    set({
      config,
      csrfToken: config.csrfToken
    }),
  setCsrfToken: (csrfToken) => set({ csrfToken }),
  setSelectedRepoId: (repoId) => set({ selectedRepoId: repoId })
}));

