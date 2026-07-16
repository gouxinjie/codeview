import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useAppStore } from '@/store/appStore';
import type { SyncStatus } from '@/types/api';
import { fetchConfig, fetchSyncStatus } from '@/utils/api';
import { formatDateTime, translateSyncStatus } from '@/utils/date';
import './index.scss';

const POLL_INTERVAL_MS = 1500;
const HIDE_DELAY_MS = 1200;

/* 页面级同步遮罩，统一展示同步时间、仓库进度和当前状态。 */
export function GlobalSyncOverlay(): ReactElement | null {
  const {
    userId,
    syncStatus,
    syncOverlayVisible,
    syncStarting,
    setConfig,
    setSyncOverlayVisible,
    setSyncStarting,
    setSyncStatus
  } = useAppStore();
  const [currentTime, setCurrentTime] = useState<string>(new Date().toISOString());
  const completionKeyRef = useRef<string>('');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date().toISOString());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const shouldPoll = syncStarting || syncOverlayVisible || syncStatus?.status === 'running';

    if (!shouldPoll) {
      return;
    }

    let active = true;
    let hideTimer = 0;

    const refreshStatus = async (): Promise<void> => {
      try {
        const latestStatus = await fetchSyncStatus();

        if (!active) {
          return;
        }

        setSyncStatus(latestStatus);

        if (syncStarting) {
          setSyncStarting(false);
        }

        if (latestStatus.status === 'success') {
          const completionKey = `${latestStatus.finishedAt ?? ''}:${latestStatus.message}`;

          if (completionKeyRef.current !== completionKey) {
            completionKeyRef.current = completionKey;

            try {
              const latestConfig = await fetchConfig();

              if (active) {
                setConfig(latestConfig);
              }
            } catch {
              // 配置刷新失败时保留当前遮罩状态，不打断同步结果展示。
            }
          }
        }

        if (latestStatus.status !== 'running') {
          hideTimer = window.setTimeout(() => {
            if (!active) {
              return;
            }

            setSyncStarting(false);
            setSyncOverlayVisible(false);
          }, HIDE_DELAY_MS);
        }
      } catch {
        if (active) {
          setSyncStarting(false);
        }
      }
    };

    void refreshStatus();

    const interval = window.setInterval(() => {
      void refreshStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(interval);

      if (hideTimer) {
        window.clearTimeout(hideTimer);
      }
    };
  }, [
    setConfig,
    setSyncOverlayVisible,
    setSyncStarting,
    setSyncStatus,
    syncOverlayVisible,
    syncStarting,
    syncStatus?.status
  ]);

  const displayStatus = useMemo<SyncStatus>(() => {
    if (syncStatus) {
      return syncStatus;
    }

    return {
      userId,
      status: syncStarting ? 'running' : 'idle',
      message: syncStarting ? '正在启动同步任务' : '尚未开始同步',
      startedAt: syncStarting ? new Date().toISOString() : null,
      finishedAt: null,
      scope: null,
      progressTotal: 0,
      progressCompleted: 0,
      currentRepository: null,
      updatedAt: currentTime
    };
  }, [currentTime, syncStarting, syncStatus, userId]);

  const visible = syncOverlayVisible || syncStarting || displayStatus.status === 'running';
  const shouldBlockPageClose = syncStarting || displayStatus.status === 'running';

  const progressPercent = useMemo<number>(() => {
    if (displayStatus.status === 'success') {
      return 100;
    }

    if (displayStatus.progressTotal <= 0) {
      return displayStatus.status === 'running' ? 8 : 0;
    }

    return Math.min(
      100,
      Math.max(8, Math.round((displayStatus.progressCompleted / displayStatus.progressTotal) * 100))
    );
  }, [displayStatus]);

  const statusToneClassName =
    displayStatus.status === 'failed'
      ? 'global-sync-overlay__panel global-sync-overlay__panel--failed'
      : displayStatus.status === 'success'
        ? 'global-sync-overlay__panel global-sync-overlay__panel--success'
        : 'global-sync-overlay__panel';

  useEffect(() => {
    if (!shouldBlockPageClose) {
      return;
    }

    /* 同步执行中阻止用户直接刷新或关闭页面，避免误以为任务已中断。 */
    const handleBeforeUnload = (event: BeforeUnloadEvent): string => {
      event.preventDefault();
      event.returnValue = '同步仍在进行中，请等待成功或失败后再关闭页面。';
      return event.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [shouldBlockPageClose]);

  if (!visible) {
    return null;
  }

  return (
    <div className="global-sync-overlay" role="status" aria-live="polite" aria-busy={displayStatus.status === 'running'}>
      <div className={statusToneClassName}>
        <div className="global-sync-overlay__header">
          <div className="global-sync-overlay__title">
            {displayStatus.status === 'failed' ? (
              <AlertTriangle aria-hidden="true" strokeWidth={1.8} />
            ) : displayStatus.status === 'success' ? (
              <CheckCircle2 aria-hidden="true" strokeWidth={1.8} />
            ) : (
              <RefreshCw aria-hidden="true" strokeWidth={1.8} />
            )}
            <div>
              <strong>{translateSyncStatus(displayStatus.status)}</strong>
              <span>{displayStatus.message}</span>
            </div>
          </div>
          <div className="global-sync-overlay__clock">
            <Clock3 aria-hidden="true" strokeWidth={1.8} />
            <span>{formatDateTime(currentTime)}</span>
          </div>
        </div>

        <div className="global-sync-overlay__progress">
          <div className="global-sync-overlay__progress-track">
            <i style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="global-sync-overlay__progress-meta">
            <span>
              {displayStatus.progressTotal > 0
                ? `已完成 ${displayStatus.progressCompleted} / ${displayStatus.progressTotal}`
                : syncStarting
                  ? '正在建立同步连接'
                  : '等待服务端返回同步进度'}
            </span>
            <span>{progressPercent}%</span>
          </div>
        </div>

        <div className="global-sync-overlay__info-grid">
          <div className="global-sync-overlay__info-card">
            <span>同步范围</span>
            <strong>{translateScopeLabel(displayStatus.scope)}</strong>
          </div>
          <div className="global-sync-overlay__info-card">
            <span>开始时间</span>
            <strong>{formatDateTime(displayStatus.startedAt)}</strong>
          </div>
          <div className="global-sync-overlay__info-card">
            <span>最近更新时间</span>
            <strong>{formatDateTime(displayStatus.updatedAt)}</strong>
          </div>
        </div>

        <div className="global-sync-overlay__repo">
          <span>当前仓库</span>
          <strong>{displayStatus.currentRepository ?? '等待分配同步仓库'}</strong>
        </div>

        {shouldBlockPageClose && (
          <div className="global-sync-overlay__repo">
            <span>页面提示</span>
            <strong>同步执行中，请勿关闭或刷新当前页面。</strong>
          </div>
        )}
      </div>
    </div>
  );
}

function translateScopeLabel(scope: string | null): string {
  if (scope === 'full') {
    return '全量同步';
  }

  if (scope === 'incremental') {
    return '增量同步';
  }

  if (scope?.startsWith('repo:')) {
    return '单仓库同步';
  }

  return '未开始';
}
