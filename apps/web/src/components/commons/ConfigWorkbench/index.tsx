import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  EyeOff,
  ExternalLink,
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
import type { ConfigPayload, ConfigView } from '@/types/api';
import {
  fetchAdminSession,
  fetchConfig,
  fetchSyncStatus,
  loginAdmin,
  logoutAdmin,
  saveConfig,
  triggerFullSync,
  triggerIncrementalSync
} from '@/utils/api';
import { formatDateTime, translateSyncStatus } from '@/utils/date';
import './index.scss';

type HeaderIconName = 'user' | 'clock' | 'sync' | 'success';
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

interface SwitchRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

interface StrategyOption<TValue extends string | number> {
  value: TValue;
  label: string;
  hint: string;
}

interface CompactSelectProps<TValue extends string | number> {
  ariaLabel: string;
  value: TValue;
  options: Array<StrategyOption<TValue>>;
  onChange: (value: TValue) => void;
}

const HEADER_ICON_MAP: Record<HeaderIconName, LucideIcon> = {
  user: User,
  clock: Clock3,
  sync: RefreshCw,
  success: CheckCircle2
};

const TIME_RANGE_OPTIONS: Array<StrategyOption<ConfigPayload['defaultTimeRange']>> = [
  { value: '30d', label: '最近 30 天', hint: '适合观察最近的活跃波动' },
  { value: '90d', label: '最近 90 天', hint: '兼顾趋势和短期变化' },
  { value: '180d', label: '最近 180 天', hint: '适合做半年的阶段复盘' },
  { value: '365d', label: '最近 365 天', hint: '便于查看全年周期变化' }
];

const SYNC_INTERVAL_OPTIONS: Array<StrategyOption<number>> = [
  { value: 30, label: '30 分钟', hint: '适合高频开发阶段快速刷新' },
  { value: 120, label: '2 小时', hint: '白天使用更均衡，更新也足够及时' },
  { value: 360, label: '6 小时', hint: '兼顾数据刷新与接口额度' },
  { value: 720, label: '12 小时', hint: '适合个人项目，推荐使用' },
  { value: 1440, label: '24 小时', hint: '每天同步一次，更节省额度' }
];

const GITHUB_TOKEN_SETTINGS_URL = 'https://github.com/settings/tokens';

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
  const {
    adminSession,
    config,
    configLoaded,
    showToast,
    setAdminSession,
    setConfig,
    syncStatus,
    setSyncStatus,
    setSyncOverlayVisible,
    setSyncStarting
  } = useAppStore();
  const [formState, setFormState] = useState<ConfigFormState>(INITIAL_FORM_STATE);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [actionSuccess, setActionSuccess] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [accessLoading, setAccessLoading] = useState<boolean>(false);
  const [accessUsername, setAccessUsername] = useState<string>('');
  const [accessPassword, setAccessPassword] = useState<string>('');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>(new Date().toISOString());
  const hasHydratedFormRef = useRef<boolean>(false);
  const lastTriggeredModeRef = useRef<Exclude<ConfigActionMode, 'save'> | null>(null);
  const lastCompletedSyncKeyRef = useRef<string>('');

  const configFormState = useMemo<ConfigFormState | null>(() => {
    if (!config) {
      return null;
    }

    return createFormStateFromConfig(config);
  }, [config]);

  const hasPendingFormChanges = useMemo<boolean>(() => {
    if (!configFormState) {
      return false;
    }

    return (
      formState.githubUsername !== configFormState.githubUsername ||
      formState.githubToken.trim().length > 0 ||
      formState.emailAliasesText !== configFormState.emailAliasesText ||
      formState.includePrivateRepos !== configFormState.includePrivateRepos ||
      formState.syncIntervalMinutes !== configFormState.syncIntervalMinutes ||
      formState.defaultTimeRange !== configFormState.defaultTimeRange ||
      formState.timezone !== configFormState.timezone
    );
  }, [configFormState, formState]);

  const syncIntervalOptions = useMemo<Array<StrategyOption<number>>>(() => {
    if (SYNC_INTERVAL_OPTIONS.some((item) => item.value === formState.syncIntervalMinutes)) {
      return SYNC_INTERVAL_OPTIONS;
    }

    return [
      {
        value: formState.syncIntervalMinutes,
        label: `${formState.syncIntervalMinutes} 分钟`,
        hint: '当前自定义同步周期'
      },
      ...SYNC_INTERVAL_OPTIONS
    ].sort((left, right) => left.value - right.value);
  }, [formState.syncIntervalMinutes]);

  const selectedSyncIntervalOption = useMemo<StrategyOption<number> | null>(() => {
    return syncIntervalOptions.find((item) => item.value === formState.syncIntervalMinutes) ?? null;
  }, [formState.syncIntervalMinutes, syncIntervalOptions]);

  const selectedTimeRangeOption = useMemo<StrategyOption<ConfigPayload['defaultTimeRange']> | null>(() => {
    return TIME_RANGE_OPTIONS.find((item) => item.value === formState.defaultTimeRange) ?? null;
  }, [formState.defaultTimeRange]);

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
    if (!configFormState) {
      return;
    }

    if (hasHydratedFormRef.current && hasPendingFormChanges) {
      return;
    }

    setFormState(configFormState);
    hasHydratedFormRef.current = true;
  }, [configFormState, hasPendingFormChanges]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date().toISOString());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!syncStatus || !lastTriggeredModeRef.current || syncStatus.status === 'running') {
      return;
    }

    const syncMode = lastTriggeredModeRef.current;
    const completionKey = `${syncStatus.status}:${syncStatus.finishedAt ?? syncStatus.startedAt ?? ''}:${syncStatus.message}`;

    if (lastCompletedSyncKeyRef.current === completionKey) {
      return;
    }

    lastCompletedSyncKeyRef.current = completionKey;

    if (syncStatus.status === 'success') {
      setActionError('');
      setActionSuccess(syncMode === 'full' ? '全量同步已完成' : '增量同步已完成');
    } else if (syncStatus.status === 'failed') {
      setActionSuccess('');
      setActionError(syncStatus.message || '同步失败');
    }

    lastTriggeredModeRef.current = null;
  }, [syncStatus]);

  useEffect(() => {
    if (!configLoaded) {
      return;
    }

    let active = true;

    const loadWorkbenchData = async (): Promise<void> => {
      setLoading(true);

      try {
        const [configResult, syncResult, adminSessionResult] = await Promise.all([
          fetchConfig(),
          fetchSyncStatus(),
          fetchAdminSession()
        ]);

        if (!active) {
          return;
        }

        setAdminSession(adminSessionResult);
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
          const [configResult, syncResult, adminSessionResult] = await Promise.all([
            fetchConfig(),
            fetchSyncStatus(),
            fetchAdminSession()
          ]);

          if (!active) {
            return;
          }

          setAdminSession(adminSessionResult);
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
  }, [configLoaded, setAdminSession, setConfig, setSyncStatus]);

  const configReady = Boolean(config?.githubUsername && config?.hasToken);
  const canManage = Boolean(config?.canManage);
  const adminConfigured = adminSession?.adminConfigured ?? config?.adminConfigured ?? false;
  const adminUsername = adminSession?.adminUsername ?? 'xinjie';
  const accessModeTitle = canManage ? '管理员模式' : '公开访客模式';
  const accessModeDescription = canManage
    ? '您可以保存 GitHub 配置、触发同步，并让访客继续浏览公开看板。'
    : adminConfigured
      ? `访客只能查看公开数据与同步状态。输入管理员账号 ${adminUsername} 和密码后，可进入受保护的配置与同步模式。`
      : '当前尚未配置管理员密码，因此配置中心仅提供公开只读访问。';

  useEffect(() => {
    if (accessUsername.trim().length > 0) {
      return;
    }

    setAccessUsername(adminUsername);
  }, [accessUsername, adminUsername]);

  const loginHandler = async (): Promise<void> => {
    if (!adminConfigured) {
      setActionSuccess('');
      setActionError('当前未配置管理员密码，请先在服务端设置 ADMIN_PASSWORD。');
      return;
    }

    if (accessUsername.trim().length === 0) {
      setActionSuccess('');
      setActionError('请输入管理员用户名。');
      return;
    }

    if (accessPassword.trim().length === 0) {
      setActionSuccess('');
      setActionError('请输入管理员密码。');
      return;
    }

    setAccessLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      const sessionResult = await loginAdmin(accessUsername.trim(), accessPassword.trim());
      const [configResult, syncResult] = await Promise.all([fetchConfig(), fetchSyncStatus()]);
      setAdminSession(sessionResult);
      setConfig(configResult);
      setSyncStatus(syncResult);
      setAccessUsername(sessionResult.adminUsername);
      setAccessPassword('');
      setActionSuccess('已进入管理员模式。');
      showToast('管理员登录成功', 'success');
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '管理员登录失败';
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setAccessLoading(false);
    }
  };

  const logoutHandler = async (): Promise<void> => {
    setAccessLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      const sessionResult = await logoutAdmin();
      const [configResult, syncResult] = await Promise.all([fetchConfig(), fetchSyncStatus()]);
      setAdminSession(sessionResult);
      setConfig(configResult);
      setSyncStatus(syncResult);
      setAccessUsername(sessionResult.adminUsername);
      setAccessPassword('');
      setShowToken(false);
      setActionSuccess('已退出管理员模式。');
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : '退出管理员模式失败');
    } finally {
      setAccessLoading(false);
    }
  };

  const saveConfigHandler = async (): Promise<void> => {
    if (!canManage) {
      setActionSuccess('');
      setActionError('当前为公开访客模式，请先登录管理员账号后再保存配置。');
      return;
    }

    const normalizedUsername = formState.githubUsername.trim();
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
        timezone: formState.timezone.trim() || 'Asia/Shanghai'
      };

      const result = await saveConfig(payload);
      setConfig(result);
      setFormState(createFormStateFromConfig(result));
      setActionSuccess('配置已保存。');
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : '保存配置失败');
    } finally {
      setActionLoading(false);
    }
  };

  const runSyncHandler = async (mode: Exclude<ConfigActionMode, 'save'>): Promise<void> => {
    if (!canManage) {
      setActionSuccess('');
      setActionError('当前为公开访客模式，请先登录管理员账号后再执行同步。');
      return;
    }

    if (!config) {
      setActionError('配置尚未加载完成');
      return;
    }

    setActionLoading(true);
    setActionError('');
    setActionSuccess('');
    lastTriggeredModeRef.current = mode;
    setSyncOverlayVisible(true);
    setSyncStarting(true);
    setSyncStatus({
      userId: config.userId,
      status: 'running',
      message: mode === 'full' ? '正在启动全量同步' : '正在启动增量同步',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      scope: mode,
      progressTotal: 0,
      progressCompleted: 0,
      currentRepository: null,
      updatedAt: new Date().toISOString()
    });

    try {
      const result = mode === 'full' ? await triggerFullSync() : await triggerIncrementalSync();
      setSyncStatus(result);
      setSyncStarting(false);
      setActionSuccess(mode === 'full' ? '已开始全量同步' : '已开始增量同步');
    } catch (requestError) {
      lastTriggeredModeRef.current = null;
      setSyncStarting(false);
      setSyncOverlayVisible(false);
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
          value={config.githubUsername || '未填写'}
          subValue={config.hasToken ? '管理员数据源已连接' : '等待接入 GitHub Token'}
        />
        <TopInfoCell icon="clock" label="当前时间" value={formatDateTime(currentTime)} subValue="页面当前时间" />
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
                canManage
                  ? 'config-center__connect-dot config-center__connect-dot--ready'
                  : configReady
                    ? 'config-center__connect-dot config-center__connect-dot--public'
                    : 'config-center__connect-dot config-center__connect-dot--pending'
              }
              aria-hidden="true"
            />
            <GitBranch aria-hidden="true" strokeWidth={1.8} />
            <span>{canManage ? '管理员模式' : '公开访客模式'}</span>
          </div>
          <button
            type="button"
            className="config-center__refresh-button"
            onClick={() => void runSyncHandler('incremental')}
            disabled={actionLoading || !configReady || !canManage}
          >
            <RefreshCw aria-hidden="true" strokeWidth={1.8} />
          </button>
        </div>
      </section>

      <section className="config-center__hero">
        <div className="config-center__hero-copy">
          <h1>配置中心</h1>
          <div className="config-center__hero-meta">
            <span className="config-center__hero-badge">
              <span
                className={
                  canManage
                    ? 'config-center__connect-dot config-center__connect-dot--ready'
                    : configReady
                      ? 'config-center__connect-dot config-center__connect-dot--public'
                      : 'config-center__connect-dot config-center__connect-dot--pending'
                }
                aria-hidden="true"
              />
              {accessModeTitle}
            </span>
          </div>
          <p>{accessModeDescription}</p>
        </div>

        {canManage ? (
          <button
            type="button"
            className="config-center__access-button config-center__access-button--ghost"
            onClick={() => void logoutHandler()}
            disabled={accessLoading}
          >
            <ShieldAlert aria-hidden="true" strokeWidth={1.8} />
            <span>{accessLoading ? '正在退出' : '退出管理员模式'}</span>
          </button>
        ) : (
          <div className="config-center__access-form">
            <input
              value={accessUsername}
              onChange={(event) => setAccessUsername(event.target.value)}
              placeholder={`管理员用户名，默认 ${adminUsername}`}
              disabled={accessLoading || !adminConfigured}
            />
            <input
              type="password"
              value={accessPassword}
              onChange={(event) => setAccessPassword(event.target.value)}
              placeholder={adminConfigured ? `输入 ${adminUsername} 的管理员密码后解锁配置权限` : '服务端尚未配置管理员密码'}
              disabled={accessLoading || !adminConfigured}
            />
            <button
              type="button"
              className="config-center__access-button"
              onClick={() => void loginHandler()}
              disabled={accessLoading || !adminConfigured}
            >
              <ShieldCheck aria-hidden="true" strokeWidth={1.8} />
              <span>{accessLoading ? '正在验证' : '管理员登录'}</span>
            </button>
          </div>
        )}
      </section>

      {error && (
        <section className="config-center__feedback-group">
          {error && <div className="config-center__feedback config-center__feedback--warning">{error}</div>}
        </section>
      )}

      <fieldset
        className={
          canManage
            ? 'config-center__fieldset'
            : 'config-center__fieldset config-center__fieldset--readonly'
        }
        disabled={!canManage}
      >
        <section className="config-center__columns">
          <div className="config-center__column">
            <article className="config-panel">
              <header className="config-panel__header">
                <div>
                  <p className="config-panel__eyebrow">账户</p>
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
                <span className="config-field__label">访问令牌（PAT）</span>
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
                <div className="config-field__quick-actions">
                  <a
                    className="config-field__quick-link"
                    href={GITHUB_TOKEN_SETTINGS_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>前往 GitHub 创建 Token</span>
                    <ExternalLink aria-hidden="true" strokeWidth={1.8} />
                  </a>
                </div>
              </label>

              <label className="config-field">
                <span className="config-field__label">邮箱别名（支持换行或逗号分隔）</span>
                <textarea
                  value={formState.emailAliasesText}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, emailAliasesText: event.target.value }))
                  }
                  placeholder={'your-email@example.com\n1234567+your-username@users.noreply.github.com'}
                  rows={4}
                />
                <small className="config-field__hint">用于归并您所有邮箱身份，避免提交统计被拆分。</small>
              </label>
            </article>
          </div>

          <div className="config-center__column">
            <article className="config-panel">
              <header className="config-panel__header">
                <div>
                  <p className="config-panel__eyebrow">同步</p>
                  <h2>同步与展示设置</h2>
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
              </div>

              <div className="config-field">
                <span className="config-field__label">同步周期</span>
                <CompactSelect
                  ariaLabel="同步周期"
                  value={formState.syncIntervalMinutes}
                  options={syncIntervalOptions}
                  onChange={(value) =>
                    setFormState((current) => ({
                      ...current,
                      syncIntervalMinutes: value
                    }))
                  }
                />
                <small className="config-select-meta">
                  {selectedSyncIntervalOption?.label ?? `${formState.syncIntervalMinutes} 分钟`} · {selectedSyncIntervalOption?.hint ?? '系统会按该节奏自动执行同步。'}
                </small>
                <small className="config-field__hint">保存后，系统会按照这里设定的周期自动同步。</small>
              </div>

              <div className="config-field">
                <span className="config-field__label">默认时间范围</span>
                <CompactSelect
                  ariaLabel="默认时间范围"
                  value={formState.defaultTimeRange}
                  options={TIME_RANGE_OPTIONS}
                  onChange={(value) =>
                    setFormState((current) => ({
                      ...current,
                      defaultTimeRange: value
                    }))
                  }
                />
                <small className="config-select-meta">
                  {selectedTimeRangeOption?.label ?? '最近 30 天'} · {selectedTimeRangeOption?.hint ?? '页面首次进入时会默认使用这个范围。'}
                </small>
                <small className="config-field__hint">各数据页面首次打开时，会默认带入这里设定的时间范围。</small>
              </div>

              <div className="config-readonly">
                <span className="config-readonly__label">当前同步状态</span>
                <strong>{translateSyncStatus(syncStatus?.status ?? 'idle')}</strong>
                <p>{syncStatus?.message || '等待首次同步。'}</p>
              </div>
            </article>
          </div>
        </section>

        <section className="config-center__status-zone">
          <aside className="config-center__status-card">
            <div className="config-center__status-head">
              <span className="config-center__status-label">配置状态</span>
              <span className={configReady ? 'config-center__status-pill config-center__status-pill--ready' : 'config-center__status-pill'}>
                {configReady ? '所有配置已就绪' : '等待完成关键配置'}
              </span>
            </div>
            <strong>{canManage ? (configReady ? 'GitHub 账号与同步策略可用' : '请先补全用户名与 Token') : '当前为公开只读模式'}</strong>
            <p>最近同步时间：{formatDateTime(config.lastSyncedAt)}</p>
            <div className="config-center__status-actions">
              <button type="button" className="config-center__primary-button" onClick={() => void saveConfigHandler()} disabled={actionLoading}>
                <Save aria-hidden="true" strokeWidth={1.8} />
                <span>保存配置</span>
              </button>
              <button type="button" className="config-center__secondary-button" onClick={() => void runSyncHandler('incremental')} disabled={actionLoading || !configReady}>
                <RefreshCw aria-hidden="true" strokeWidth={1.8} />
                <span>立即增量同步</span>
              </button>
              <button type="button" className="config-center__secondary-button" onClick={() => void runSyncHandler('full')} disabled={actionLoading || !configReady}>
                <RefreshCw aria-hidden="true" strokeWidth={1.8} />
                <span>全量同步</span>
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
      </fieldset>
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

function HeaderIcon(props: { name: HeaderIconName }): ReactElement {
  const { name } = props;
  const Icon = HEADER_ICON_MAP[name];

  return <Icon aria-hidden="true" strokeWidth={1.8} />;
}

function CompactSelect<TValue extends string | number>(props: CompactSelectProps<TValue>): ReactElement {
  const { ariaLabel, value, options, onChange } = props;
  const [open, setOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [openDirection, setOpenDirection] = useState<'up' | 'down'>('down');
  const [menuMaxHeight, setMenuMaxHeight] = useState<number>(320);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  const selectedOption = useMemo<StrategyOption<TValue> | null>(() => {
    return options.find((item) => item.value === value) ?? null;
  }, [options, value]);

  const selectedIndex = useMemo<number>(() => {
    const index = options.findIndex((item) => item.value === value);
    return index >= 0 ? index : 0;
  }, [options, value]);

  const closeMenu = (shouldFocusTrigger: boolean): void => {
    setOpen(false);

    if (shouldFocusTrigger) {
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const updateMenuLayout = (): void => {
      const rootElement = rootRef.current;

      if (!rootElement) {
        return;
      }

      const rect = rootElement.getBoundingClientRect();
      const viewportPadding = 16;
      const menuGap = 8;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const shouldOpenUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
      const availableHeight = shouldOpenUpward ? spaceAbove - menuGap : spaceBelow - menuGap;

      setOpenDirection(shouldOpenUpward ? 'up' : 'down');
      setMenuMaxHeight(Math.max(144, Math.min(320, availableHeight)));
    };

    updateMenuLayout();

    const handlePointerDown = (event: MouseEvent): void => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeMenu(true);
      }
    };

    window.addEventListener('resize', updateMenuLayout);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', updateMenuLayout);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) {
      return;
    }

    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  const openMenu = (nextIndex: number): void => {
    setActiveIndex(nextIndex);
    setOpen(true);
  };

  const selectOption = (index: number): void => {
    const option = options[index];

    if (!option) {
      return;
    }

    onChange(option.value);
    closeMenu(true);
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openMenu(selectedIndex);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu(selectedIndex);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu(selectedIndex);
    }
  };

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index + 1) % options.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index - 1 + options.length) % options.length);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectOption(index);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    }
  };

  return (
    <div
      ref={rootRef}
      className={
        open
          ? `config-select-shell config-select-shell--open config-select-shell--${openDirection}`
          : 'config-select-shell'
      }
      onBlur={(event) => {
        if (!open) {
          return;
        }

        if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) {
          return;
        }

        setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="config-select-shell__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => {
          if (open) {
            closeMenu(false);
            return;
          }

          openMenu(selectedIndex);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="config-select-shell__value">{selectedOption?.label ?? String(value)}</span>
        <ChevronDown aria-hidden="true" strokeWidth={1.8} />
      </button>

      {open && (
        <div
          id={listboxId}
          className="config-select-shell__menu"
          role="listbox"
          aria-label={ariaLabel}
          style={{ maxHeight: `${menuMaxHeight}px` }}
        >
          {options.map((item, index) => {
            const isActive = item.value === value;
            const isFocused = index === activeIndex;

            return (
              <button
                key={String(item.value)}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={isActive}
                tabIndex={isFocused ? 0 : -1}
                className={
                  isActive
                    ? 'config-select-shell__option config-select-shell__option--active'
                    : 'config-select-shell__option'
                }
                onClick={() => selectOption(index)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="config-select-shell__option-label">{item.label}</span>
                <small className="config-select-shell__option-hint">{item.hint}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function normalizeDefaultTimeRange(value: string): ConfigPayload['defaultTimeRange'] {
  if (value === '90d' || value === '180d' || value === '365d') {
    return value;
  }

  return '30d';
}

/**
 * 函数说明：将服务端配置转换为本地表单状态，统一首次回填与保存后的表单值。
 * 参数说明：config 为当前用户配置，必填。
 * 返回说明：返回配置页本地表单状态。
 */
function createFormStateFromConfig(config: ConfigView): ConfigFormState {
  return {
    githubUsername: config.githubUsername,
    githubToken: '',
    emailAliases: config.emailAliases,
    emailAliasesText: config.emailAliases.join('\n'),
    includePrivateRepos: config.includePrivateRepos,
    syncIntervalMinutes: config.syncIntervalMinutes,
    defaultTimeRange: normalizeDefaultTimeRange(config.defaultTimeRange),
    timezone: config.timezone
  };
}

function parseEmailAliases(value: string): string[] {
  const items = value
    .split(/[\n,，;]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.filter((item, index, array) => array.indexOf(item) === index);
}
