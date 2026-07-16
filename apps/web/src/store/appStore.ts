import { create } from 'zustand';
import type { AdminSessionView, ConfigView, SyncStatus } from '@/types/api';

interface ToastState {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

interface AppState {
  userId: string;
  csrfToken: string;
  adminSession: AdminSessionView | null;
  config: ConfigView | null;
  configLoaded: boolean;
  selectedRepoId: number | null;
  syncStatus: SyncStatus | null;
  syncOverlayVisible: boolean;
  syncStarting: boolean;
  toast: ToastState | null;
  setAdminSession: (adminSession: AdminSessionView | null) => void;
  setConfig: (config: ConfigView) => void;
  setConfigLoaded: (loaded: boolean) => void;
  setCsrfToken: (csrfToken: string) => void;
  setSelectedRepoId: (repoId: number | null) => void;
  setSyncStatus: (syncStatus: SyncStatus | null) => void;
  setSyncOverlayVisible: (visible: boolean) => void;
  setSyncStarting: (starting: boolean) => void;
  showToast: (message: string, tone: 'success' | 'error') => void;
  clearToast: () => void;
}

/* 管理全局用户、配置、当前仓库以及同步遮罩状态。 */
export const useAppStore = create<AppState>((set) => ({
  userId: import.meta.env.VITE_DEFAULT_USER_ID ?? 'local-user',
  csrfToken: '',
  adminSession: null,
  config: null,
  configLoaded: false,
  selectedRepoId: null,
  syncStatus: null,
  syncOverlayVisible: false,
  syncStarting: false,
  toast: null,
  setAdminSession: (adminSession) => set({ adminSession }),
  setConfig: (config) =>
    set({
      config,
      csrfToken: config.canManage ? config.csrfToken : ''
    }),
  setConfigLoaded: (configLoaded) => set({ configLoaded }),
  setCsrfToken: (csrfToken) => set({ csrfToken }),
  setSelectedRepoId: (repoId) => set({ selectedRepoId: repoId }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setSyncOverlayVisible: (syncOverlayVisible) => set({ syncOverlayVisible }),
  setSyncStarting: (syncStarting) => set({ syncStarting }),
  showToast: (message, tone) =>
    set({
      toast: {
        id: Date.now(),
        message,
        tone
      }
    }),
  clearToast: () => set({ toast: null })
}));
