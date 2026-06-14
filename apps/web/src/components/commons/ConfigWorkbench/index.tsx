import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  GitBranch,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  User
} from 'lucide-react';
import { EmptyState } from '@/components/commons/EmptyState';
import { LoadingBlock } from '@/components/commons/LoadingBlock';
import { useAppStore } from '@/store/appStore';
import type { ConfigPayload, SyncStatus } from '@/types/api';
import { fetchConfig, fetchSyncStatus, saveConfig, triggerFullSync, triggerIncrementalSync } from '@/utils/api';
import { formatDateTime, translateSyncStatus } from '@/utils/date';
import './index.scss';

type HeaderIconName = 'user' | 'clock' | 'sync' | 'success';
type ConfigTabName = 'account' | 'sync' | 'data' | 'display' | 'notify' | 'about';
type SyncLogTone = 'success' | 'running' | 'warning';
type ConfigActionMode = 'save' | 'incremental' | 'full';

interface ConfigWorkbenchProps {
  variant?: 'page' | 'modal';
}

interface ConfigFormState extends ConfigPayload {
  githubToken: string;
  emailAliasesText: string;
}

interface TopInfoCellProps {
  icon: HeaderIconName;
  label: string;
  value: string;
  subValue: string;
}

interface ConfigTabItem {
  key: ConfigTabName;
  label: string;
  available: boolean;
}

interface SwitchRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

interface SyncLogEntry {
  id: string;
  title: string;
  summary: string;
  timeLabel: string;
  durationLabel: string;
  tone: SyncLogTone;
}

interface LocalSyncLogEntry {
  id: string;
  mode: Exclude<ConfigActionMode, 'save'>;
  status: string;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
}

interface DangerActionCardProps {
  title: string;
  description: string;
  buttonText: string;
  tone: 'danger' | 'warning';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
}

const HEADER_ICON_MAP: Record<HeaderIconName, LucideIcon> = {
  user: User,
  clock: Clock3,
  sync: RefreshCw,
  success: CheckCircle2
};

const CONFIG_TABS: ConfigTabItem[] = [
  { key: 'account', label: '账号配置', available: true },
  { key: 'sync', label: '同步设置', available: false },
  { key: 'data', label: '数据源设置', available: false },
  { key: 'display', label: '显示设置', available: false },
  { key: 'notify', label: '通知设置', available: false },
  { key: 'about', label: '关于系统', available: false }
];

const TIME_RANGE_OPTIONS: Array<{ value: ConfigPayload['defaultTimeRange']; label: string }> = [
  { value: '30d', label: '最近 30 天' },
  { value: '90d', label: '最近 90 天' },
  { value: '180d', label: '最近 180 天' },
  { value: '365d', label: '最近 365 天' }
];

const RECOMMENDED_TIMEZONES: string[] = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'UTC',
  'Europe/London',
  'America/Los_Angeles'
];

const INITIAL_FORM_STATE: ConfigFormState = {
  githubUsername: '',
  githubToken: '',
  emailAliases: [],
  emailAliasesText: '',
  includePrivateRepos: false,
  syncIntervalMinutes: 720,
  defaultTimeRange: '30d',
  timezone: 'Asia/Shanghai'
};

/**
 * 组件说明：配置工作台。
 * Props 类型：variant 控制页面态或弹窗态，非必填，默认 page。
 * 含义：统一承载配置中心与首页快捷配置的全部表单、同步和说明逻辑。
 * 是否必填：否。
 * 默认值：variant 默认为 page。
 */
export function ConfigWorkbench(props: ConfigWorkbenchProps): ReactElement {
  const { variant = 'page' } = props;
  const { config, configLoaded, setConfig } = useAppStore();
  const [formState, setFormState] = useState<ConfigFormState>(INITIAL_FORM_STATE);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [actionSuccess, setActionSuccess] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [showToken, setShowToken] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>(new Date().toISOString());
  const [localSyncLogs, setLocalSyncLogs] = useState<LocalSyncLogEntry[]>([]);

  useEffect(() => {
    if (actionSuccess.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setActionSuccess('');
    }, 4000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [actionSuccess]);

  useEffect(() => {
    if (!config) {
      return;
    }

    setFormState({
      githubUsername: config.githubUsername,
      githubToken: '',
      emailAliases: config.emailAliases,
      emailAliasesText: config.emailAliases.join('\n'),
      includePrivateRepos: config.includePrivateRepos,
      syncIntervalMinutes: config.syncIntervalMinutes,
      defaultTimeRange: normalizeDefaultTimeRange(config.defaultTimeRange),
      timezone: config.timezone
    });
  }, [config]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date().toISOString());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!configLoaded) {
      return;
    }

    let active = true;

    const loadWorkbenchData = async (): Promise<void> => {
      setLoading(true);

      try {
        const [configResult, syncResult] = await Promise.all([fetchConfig(), fetchSyncStatus()]);

        if (!active) {
          return;
        }

        setConfig(configResult);
        setSyncStatus(syncResult);
        setError('');
      } catch (requestError) {
        if (!active) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : '配置中心加载失败');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadWorkbenchData();

    const pollTimer = window.setInterval(() => {
      void (async () => {
        try {
          const [configResult, syncResult] = await Promise.all([fetchConfig(), fetchSyncStatus()]);

          if (!active) {
            return;
          }

          setConfig(configResult);
          setSyncStatus(syncResult);
        } catch {
          // 轮询失败时保留当前页面状态，避免打断用户输入。
        }
      })();
    }, 20000);

    return () => {
      active = false;
      window.clearInterval(pollTimer);
    };
  }, [configLoaded, setConfig]);

  const syncLogEntries = useMemo<SyncLogEntry[]>(
    () => buildSyncLogEntries(syncStatus, config?.lastSyncedAt ?? null, localSyncLogs),
    [config?.lastSyncedAt, localSyncLogs, syncStatus]
  );

  const timezoneSuggestions = useMemo<string[]>(() => {
    const candidateList = [...RECOMMENDED_TIMEZONES, formState.timezone];
    return candidateList.filter((item, index, array) => array.indexOf(item) === index && item.trim().length > 0);
  }, [formState.timezone]);

  const configReady = Boolean(config?.githubUsername && config?.hasToken);

  const saveConfigHandler = async (): Promise<void> => {
    const normalizedUsername = formState.githubUsername.trim();
    const normalizedTimezone = formState.timezone.trim();
    const normalizedInterval = Number(formState.syncIntervalMinutes);

    if (normalizedUsername.length === 0) {
      setActionSuccess('');
      setActionError('请先填写 GitHub 用户名。');
      return;
    }

    if (!Number.isInteger(normalizedInterval) || normalizedInterval < 15 || normalizedInterval > 1440) {
      setActionSuccess('');
      setActionError('同步周期必须是 15 到 1440 之间的整数分钟。');
      return;
    }

    if (normalizedTimezone.length === 0) {
      setActionSuccess('');
      setActionError('请填写有效的系统时区。');
      return;
    }

    setActionLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      const payload: ConfigPayload = {
        githubUsername: normalizedUsername,
        githubToken: formState.githubToken.trim() || undefined,
        emailAliases: parseEmailAliases(formState.emailAliasesText),
        includePrivateRepos: formState.includePrivateRepos,
        syncIntervalMinutes: normalizedInterval,
        defaultTimeRange: formState.defaultTimeRange,
        timezone: normalizedTimezone
      };

      const result = await saveConfig(payload);
      setConfig(result);
      setFormState((current) => ({
        ...current,
        githubToken: '',
        emailAliases: result.emailAliases,
        emailAliasesText: result.emailAliases.join('\n'),
        includePrivateRepos: result.includePrivateRepos,
        syncIntervalMinutes: result.syncIntervalMinutes,
        defaultTimeRange: normalizeDefaultTimeRange(result.defaultTimeRange),
        timezone: result.timezone
      }));
      setActionSuccess('配置已保存。');
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : '保存配置失败');
    } finally {
      setActionLoading(false);
    }
  };

  const runSyncHandler = async (mode: Exclude<ConfigActionMode, 'save'>): Promise<void> => {
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      const result = mode === 'full' ? await triggerFullSync() : await triggerIncrementalSync();
      const latestConfig = await fetchConfig();

      setConfig(latestConfig);
      setSyncStatus(result);
      setLocalSyncLogs((current) => [
        {
          id: `${mode}-${result.finishedAt ?? result.startedAt ?? new Date().toISOString()}`,
          mode,
          status: result.status,
          message: result.message,
          startedAt: result.startedAt,
          finishedAt: result.finishedAt
        },
        ...current
      ].slice(0, 4));
      setActionSuccess(mode === 'full' ? '全量同步已完成。' : '增量同步已完成。');
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : '同步失败');
    } finally {
      setActionLoading(false);
    }
  };

  if (!configLoaded || loading) {
    return <LoadingBlock text="正在加载配置中心" />;
  }

  if (!config) {
    return <EmptyState title="配置中心暂不可用" description={error || '请稍后重试。'} />;
  }

  return (
    <div className={variant === 'modal' ? 'config-center config-center--modal' : 'config-center'}>
      <section className="config-center__topbar">
        <TopInfoCell
          icon="user"
          label="用户名"
          value={config.githubUsername || 'your-username'}
          subValue={config.hasToken ? 'GitHub 已连接' : '等待接入 GitHub Token'}
        />
        <TopInfoCell
          icon="clock"
          label="当前时间"
          value={formatDateTime(currentTime)}
          subValue={`时区 ${formState.timezone || 'Asia/Shanghai'}`}
        />
        <TopInfoCell
          icon="success"
          label="同步状态"
          value={translateSyncStatus(syncStatus?.status ?? 'idle')}
          subValue={configReady ? '配置已满足同步前置条件' : '请先完成 GitHub 账号配置'}
        />
        <TopInfoCell
          icon="sync"
          label="最近同步时间"
          value={formatDateTime(config.lastSyncedAt)}
          subValue={formState.includePrivateRepos ? '公开仓库 + 私有仓库' : '仅同步公开仓库'}
        />

        <div className="config-center__topbar-actions">
          <div className="config-center__connect">
            <span
              className={
                configReady
                  ? 'config-center__connect-dot config-center__connect-dot--ready'
                  : 'config-center__connect-dot config-center__connect-dot--pending'
              }
              aria-hidden="true"
            />
            <GitBranch aria-hidden="true" strokeWidth={1.8} />
            <span>{configReady ? 'GitHub 连通' : '等待接入'}</span>
          </div>
          <button
            type="button"
            className="config-center__refresh-button"
            onClick={() => void runSyncHandler('incremental')}
            disabled={actionLoading || !configReady}
          >
            <RefreshCw aria-hidden="true" strokeWidth={1.8} />
          </button>
        </div>
      </section>

      <section className="config-center__hero">
        <div className="config-center__hero-copy">
          <h1>配置中心</h1>
          <p>管理您的账号、同步与系统配置</p>
        </div>
      </section>

      <section className="config-center__tabs" aria-label="配置中心导航">
        {CONFIG_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={
              item.available
                ? 'config-center__tab config-center__tab--active'
                : 'config-center__tab config-center__tab--disabled'
            }
            disabled={!item.available}
            title={item.available ? item.label : '当前版本尚未开放该配置区块'}
          >
            {item.label}
          </button>
        ))}
      </section>

      {error && (
        <section className="config-center__feedback-group">
          {error && <div className="config-center__feedback config-center__feedback--warning">{error}</div>}
        </section>
      )}

      <section className="config-center__columns">
        <div className="config-center__column">
          <article className="config-panel">
            <header className="config-panel__header">
              <div>
                <p className="config-panel__eyebrow">Account</p>
                <h2>GitHub 账号配置</h2>
              </div>
            </header>

            <label className="config-field">
              <span className="config-field__label">GitHub 用户名</span>
              <div className="config-field__input-wrap">
                <input
                  value={formState.githubUsername}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, githubUsername: event.target.value }))
                  }
                  placeholder="your-username"
                />
                <ShieldCheck aria-hidden="true" strokeWidth={1.8} />
              </div>
              <small className="config-field__hint">用于唯一标识您的 GitHub 账号。</small>
            </label>

            <label className="config-field">
              <span className="config-field__label">Personal Access Token</span>
              <div className="config-field__input-wrap config-field__input-wrap--with-button">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={formState.githubToken}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, githubToken: event.target.value }))
                  }
                  placeholder={config.hasToken ? '保持为空则沿用已有 Token' : '输入新 Token'}
                />
                <button
                  type="button"
                  className="config-field__icon-button"
                  aria-label={showToken ? '隐藏 Token' : '显示 Token'}
                  onClick={() => setShowToken((current) => !current)}
                >
                  {showToken ? <EyeOff aria-hidden="true" strokeWidth={1.8} /> : <Eye aria-hidden="true" strokeWidth={1.8} />}
                </button>
              </div>
              <small className="config-field__hint">
                用于访问 GitHub API，建议至少具备 `repo`、`read:user`、`user:email` 权限。
              </small>
              <span className={config.hasToken ? 'config-center__token-status config-center__token-status--valid' : 'config-center__token-status'}>
                {config.hasToken ? 'Token 有效' : '尚未配置 Token'}
              </span>
            </label>
          </article>

          <article className="config-panel">
            <header className="config-panel__header">
              <div>
                <p className="config-panel__eyebrow">Identity</p>
                <h2>作者身份配置</h2>
              </div>
            </header>

            <label className="config-field">
              <span className="config-field__label">主账号用户名</span>
              <input value={formState.githubUsername} disabled />
              <small className="config-field__hint">用于统一化提交作者身份。</small>
            </label>

            <label className="config-field">
              <span className="config-field__label">邮箱别名（支持换行或逗号分隔）</span>
              <textarea
                value={formState.emailAliasesText}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, emailAliasesText: event.target.value }))
                }
                placeholder={'your-email@example.com\n1234567+your-username@users.noreply.github.com'}
                rows={6}
              />
              <small className="config-field__hint">用于归并您所有邮箱身份，避免统计被拆分。</small>
            </label>
          </article>
        </div>

        <div className="config-center__column">
          <article className="config-panel">
            <header className="config-panel__header">
              <div>
                <p className="config-panel__eyebrow">Repositories</p>
                <h2>仓库同步配置</h2>
              </div>
            </header>

            <div className="config-panel__rows">
              <SwitchRow label="同步公开仓库" description="同步您的所有公开仓库信息。" checked disabled />
              <SwitchRow
                label="同步私有仓库"
                description="同步您有权限访问的私有仓库。"
                checked={formState.includePrivateRepos}
                onChange={(checked) =>
                  setFormState((current) => ({ ...current, includePrivateRepos: checked }))
                }
              />
              <SwitchRow
                label="包含 Fork 仓库"
                description="当前版本未开放该选项，后续可按仓库类型过滤。"
                checked={false}
                disabled
              />
              <SwitchRow
                label="包含存档仓库"
                description="当前版本未开放该选项，暂不支持归档仓库过滤。"
                checked={false}
                disabled
              />
            </div>
          </article>

          <article className="config-panel">
            <header className="config-panel__header">
              <div>
                <p className="config-panel__eyebrow">Logs</p>
                <h2>数据同步日志</h2>
              </div>
            </header>

            <div className="config-panel__log-list">
              {syncLogEntries.map((item) => (
                <article key={item.id} className="config-log-item">
                  <div className={`config-log-item__dot config-log-item__dot--${item.tone}`} aria-hidden="true" />
                  <div className="config-log-item__copy">
                    <strong>{item.title}</strong>
                    <p>{item.summary}</p>
                  </div>
                  <div className="config-log-item__meta">
                    <span>{item.timeLabel}</span>
                    <small>{item.durationLabel}</small>
                  </div>
                  <ChevronRight aria-hidden="true" strokeWidth={1.8} />
                </article>
              ))}
            </div>
            <button
              type="button"
              className="config-center__text-action"
              onClick={() => void runSyncHandler('incremental')}
              disabled={actionLoading || !configReady}
            >
              查看最新同步状态 →
            </button>
            <p className="config-panel__footnote">当前版本仅展示最近状态与本会话操作记录，不保留后端历史日志。</p>
          </article>
        </div>

        <div className="config-center__column">
          <article className="config-panel">
            <header className="config-panel__header">
              <div>
                <p className="config-panel__eyebrow">Strategy</p>
                <h2>同步策略配置</h2>
              </div>
            </header>

            <label className="config-field">
              <span className="config-field__label">同步周期（分钟）</span>
              <input
                type="number"
                min={15}
                max={1440}
                step={15}
                value={formState.syncIntervalMinutes}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    syncIntervalMinutes: Number(event.target.value)
                  }))
                }
              />
              <small className="config-field__hint">系统按该周期自动拉取最新同步数据。</small>
            </label>

            <label className="config-field">
              <span className="config-field__label">默认展示时间范围</span>
              <select
                value={formState.defaultTimeRange}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    defaultTimeRange: normalizeDefaultTimeRange(event.target.value)
                  }))
                }
              >
                {TIME_RANGE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <small className="config-field__hint">页面首次进入时默认使用该统计范围。</small>
            </label>

            <div className="config-readonly">
              <span className="config-readonly__label">API 请求策略</span>
              <strong>系统内置自动限流</strong>
              <p>当前实现已在服务端内置节流逻辑，暂不提供单独配置入口。</p>
            </div>
          </article>

          <article className="config-panel">
            <header className="config-panel__header">
              <div>
                <p className="config-panel__eyebrow">Timezone</p>
                <h2>时区与时间配置</h2>
              </div>
            </header>

            <label className="config-field">
              <span className="config-field__label">系统时区</span>
              <input
                list="config-center-timezones"
                value={formState.timezone}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, timezone: event.target.value }))
                }
                placeholder="Asia/Shanghai"
              />
              <datalist id="config-center-timezones">
                {timezoneSuggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              <small className="config-field__hint">所有时间统计将基于该时区进行展示与聚合。</small>
            </label>

            <div className="config-readonly">
              <span className="config-readonly__label">当前本地时间</span>
              <strong>{formatDateTime(currentTime)}</strong>
              <p>用于校验页面显示时间与后端同步结果是否一致。</p>
            </div>

            <div className="config-readonly">
              <span className="config-readonly__label">当前同步状态</span>
              <strong>{translateSyncStatus(syncStatus?.status ?? 'idle')}</strong>
              <p>{syncStatus?.message || '等待首次同步。'}</p>
            </div>
          </article>
        </div>
      </section>

      <section className="config-center__danger-grid">
        <DangerActionCard
          title="清空本地数据"
          description="删除所有本地同步数据、仓库画像与统计结果。当前版本未开放该操作。"
          buttonText="暂未开放"
          tone="danger"
          disabled
        />
        <DangerActionCard
          title="重新同步所有仓库"
          description="清刷新有数据并重新从 GitHub 拉取一次完整资产快照。"
          buttonText="重新同步"
          tone="warning"
          loading={actionLoading}
          onClick={() => {
            void runSyncHandler('full');
          }}
        />
        <DangerActionCard
          title="解除 GitHub 连接"
          description="删除当前 GitHub 连接信息和相关配置。当前版本未开放该操作。"
          buttonText="暂未开放"
          tone="danger"
          disabled
        />
      </section>

      <section className="config-center__status-zone">
        <aside className="config-center__status-card">
          <div className="config-center__status-head">
            <span className="config-center__status-label">配置状态</span>
            <span className={configReady ? 'config-center__status-pill config-center__status-pill--ready' : 'config-center__status-pill'}>
              {configReady ? '所有配置已就绪' : '等待完成关键配置'}
            </span>
          </div>
          <strong>{configReady ? 'GitHub 账号与同步策略可用' : '请先补全用户名与 Token'}</strong>
          <p>最近同步时间：{formatDateTime(config.lastSyncedAt)}</p>
          <div className="config-center__status-actions">
            <button type="button" className="config-center__primary-button" onClick={() => void saveConfigHandler()} disabled={actionLoading}>
              <Save aria-hidden="true" strokeWidth={1.8} />
              <span>保存所有配置</span>
            </button>
            <button type="button" className="config-center__secondary-button" onClick={() => void runSyncHandler('incremental')} disabled={actionLoading || !configReady}>
              <RefreshCw aria-hidden="true" strokeWidth={1.8} />
              <span>立即增量同步</span>
            </button>
          </div>
          {(actionError || actionSuccess) && (
            <div
              className={
                actionError
                  ? 'config-center__status-notice config-center__status-notice--danger'
                  : 'config-center__status-notice config-center__status-notice--success'
              }
              aria-live="polite"
            >
              {actionError || actionSuccess}
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function TopInfoCell(props: TopInfoCellProps): ReactElement {
  const { icon, label, value, subValue } = props;

  return (
    <div className="config-center__topbar-cell">
      <div className="config-center__topbar-icon">
        <HeaderIcon name={icon} />
      </div>
      <div className="config-center__topbar-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{subValue}</small>
      </div>
    </div>
  );
}

function SwitchRow(props: SwitchRowProps): ReactElement {
  const { label, description, checked, disabled = false, onChange } = props;

  return (
    <div className={disabled ? 'config-switch config-switch--disabled' : 'config-switch'}>
      <div className="config-switch__copy">
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <label className="config-switch__control" aria-label={label}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => {
            onChange?.(event.target.checked);
          }}
        />
        <span className="config-switch__track" aria-hidden="true">
          <i className="config-switch__thumb" />
        </span>
      </label>
    </div>
  );
}

function DangerActionCard(props: DangerActionCardProps): ReactElement {
  const { title, description, buttonText, tone, disabled = false, loading = false, onClick } = props;

  return (
    <article className="config-danger-card">
      <div className="config-danger-card__copy">
        <span className={`config-danger-card__icon config-danger-card__icon--${tone}`}>
          <ShieldAlert aria-hidden="true" strokeWidth={1.8} />
        </span>
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
      </div>
      <button
        type="button"
        className={
          tone === 'danger'
            ? 'config-danger-card__button config-danger-card__button--danger'
            : 'config-danger-card__button config-danger-card__button--warning'
        }
        disabled={disabled || loading}
        onClick={onClick}
      >
        {buttonText}
      </button>
    </article>
  );
}

function HeaderIcon(props: { name: HeaderIconName }): ReactElement {
  const { name } = props;
  const Icon = HEADER_ICON_MAP[name];

  return <Icon aria-hidden="true" strokeWidth={1.8} />;
}

function normalizeDefaultTimeRange(value: string): ConfigPayload['defaultTimeRange'] {
  if (value === '90d' || value === '180d' || value === '365d') {
    return value;
  }

  return '30d';
}

function parseEmailAliases(value: string): string[] {
  const items = value
    .split(/[\n,，;]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.filter((item, index, array) => array.indexOf(item) === index);
}

function buildSyncLogEntries(
  syncStatus: SyncStatus | null,
  lastSyncedAt: string | null,
  localSyncLogs: LocalSyncLogEntry[]
): SyncLogEntry[] {
  const entries: SyncLogEntry[] = [];

  if (syncStatus) {
    const fallbackTime = syncStatus.finishedAt ?? syncStatus.startedAt ?? lastSyncedAt;
    entries.push({
      id: `current-${fallbackTime ?? 'empty'}`,
      title: syncStatus.status === 'running' ? '同步执行中' : '最近一次同步',
      summary: syncStatus.message || '系统已同步最近一次状态。',
      timeLabel: formatDateTime(fallbackTime),
      durationLabel: formatSyncDuration(syncStatus.startedAt, syncStatus.finishedAt),
      tone: mapSyncTone(syncStatus.status)
    });
  } else if (lastSyncedAt) {
    entries.push({
      id: `fallback-${lastSyncedAt}`,
      title: '最近一次同步',
      summary: '系统已保留最近一次成功同步的时间记录。',
      timeLabel: formatDateTime(lastSyncedAt),
      durationLabel: '耗时待记录',
      tone: 'success'
    });
  }

  localSyncLogs.forEach((item) => {
    entries.push({
      id: item.id,
      title: item.mode === 'full' ? '全量同步' : '增量同步',
      summary: item.message || (item.mode === 'full' ? '重新拉取所有仓库数据。' : '同步最新增量数据。'),
      timeLabel: formatDateTime(item.finishedAt ?? item.startedAt),
      durationLabel: formatSyncDuration(item.startedAt, item.finishedAt),
      tone: mapSyncTone(item.status)
    });
  });

  if (entries.length === 0) {
    entries.push({
      id: 'empty-sync-log',
      title: '暂无同步记录',
      summary: '保存配置后可执行一次同步，系统会在这里展示最新状态。',
      timeLabel: '--',
      durationLabel: '等待首次同步',
      tone: 'warning'
    });
  }

  return entries.slice(0, 3);
}

function mapSyncTone(status: string): SyncLogTone {
  if (status === 'success') {
    return 'success';
  }

  if (status === 'running') {
    return 'running';
  }

  return 'warning';
}

function formatSyncDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) {
    return '耗时待记录';
  }

  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '耗时待记录';
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `耗时 ${seconds} 秒`;
  }

  return `耗时 ${minutes} 分 ${seconds} 秒`;
}
