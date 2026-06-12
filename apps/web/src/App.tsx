import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { LoadingBlock } from './components/commons/LoadingBlock';
import { useAppStore } from './store/appStore';
import { fetchConfig } from './utils/api';

const DashboardPage = lazy(() => import('./pages/Dashboard'));
const RepositoriesPage = lazy(() => import('./pages/Repositories'));
const RepositoryDetailPage = lazy(() => import('./pages/RepositoryDetail'));
const StatisticsPage = lazy(() => import('./pages/Statistics'));

type SidebarIconName = 'dashboard' | 'repo' | 'detail' | 'stack' | 'insight' | 'stats' | 'config' | 'brand';

interface SidebarItem {
  label: string;
  subtitle: string;
  to?: string;
  icon: SidebarIconName;
  end?: boolean;
  match?: (pathname: string) => boolean;
}

/**
 * 组件说明：侧边栏图标。
 * Props 类型：name 为图标名称。
 * 含义：统一渲染导航使用的内联 SVG 图标。
 * 是否必填：必填。
 * 默认值：无。
 */
function SidebarIcon(props: { name: SidebarIconName }): ReactElement {
  const { name } = props;

  if (name === 'brand') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 4 6.5v11L12 22l8-4.5v-11L12 2Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4 6.5 12 11l8-4.5M12 11v11" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  if (name === 'dashboard') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 5.5h6.5v5.8H4.5zm8.5 0h6.5V9H13zm0 6.8h6.5v6H13zm-8.5 1h6.5v5H4.5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  if (name === 'repo') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 4h9l3 3v13H6z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M15 4v4h4M9 12h6M9 16h6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  if (name === 'detail') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h14v16H5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  if (name === 'stack') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 18V9m5 9V5m5 13v-7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="7" cy="9" r="1.6" fill="currentColor" />
        <circle cx="12" cy="5" r="1.6" fill="currentColor" />
        <circle cx="17" cy="11" r="1.6" fill="currentColor" />
      </svg>
    );
  }

  if (name === 'insight') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M12 9v4M12 16h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === 'stats') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 17V9m6 8V5m6 12v-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M4 19h16" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  if (name === 'config') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4Zm8 3.7-2.1-.8a6.6 6.6 0 0 0-.5-1.2l1-2-2.2-2.2-2 .9a6.6 6.6 0 0 0-1.2-.5L12 4 10.9 6.2a6.6 6.6 0 0 0-1.2.5l-2-.9L5.5 8l1 2c-.2.4-.4.8-.5 1.2L4 12l2.1.8c.1.4.3.8.5 1.2l-1 2 2.2 2.2 2-.9c.4.2.8.4 1.2.5L12 20l1.1-2.2c.4-.1.8-.3 1.2-.5l2 .9 2.2-2.2-1-2c.2-.4.4-.8.5-1.2Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v14H4zM8 9h8M8 13h8" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function SidebarNavigation(): ReactElement {
  const location = useLocation();
  const { config } = useAppStore();

  const items: SidebarItem[] = [
    { label: '首页 Dashboard', subtitle: '总览看板', to: '/', icon: 'dashboard', end: true },
    {
      label: '项目列表',
      subtitle: '仓库索引',
      to: '/repos',
      icon: 'repo',
      end: true,
      match: (pathname) => pathname === '/repos'
    },
    {
      label: '项目详情',
      subtitle: '项目画像',
      to: '/repos',
      icon: 'detail',
      match: (pathname) => /^\/repos\/\d+$/.test(pathname)
    },
    { label: '技术栈分析', subtitle: '标签与语言', icon: 'stack' },
    { label: '洞察中心', subtitle: '自动结论', icon: 'insight' },
    { label: '数据统计', subtitle: '经营指标', to: '/statistics', icon: 'stats', end: true },
    { label: '配置中心', subtitle: '数据源配置', icon: 'config' }
  ];

  return (
    <aside className="app-shell__sidebar">
      <div className="app-shell__sidebar-head">
        <div className="app-shell__brand">
          <div className="app-shell__brand-mark">
            <SidebarIcon name="brand" />
          </div>
          <div className="app-shell__brand-copy">
            <strong className="app-shell__brand-title">CODEVIEW</strong>
            <span className="app-shell__brand-subtitle">GitHub 项目数据看板</span>
          </div>
        </div>
        <button className="app-shell__collapse" type="button" aria-label="折叠导航">
          <span />
        </button>
      </div>

      <nav className="app-shell__sidebar-nav">
        {items.map((item) => {
          const active = item.match
            ? item.match(location.pathname)
            : item.to === '/'
              ? location.pathname === '/'
              : item.to
                ? location.pathname.startsWith(item.to)
                : false;

          if (item.to) {
            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={() =>
                  active
                    ? 'app-shell__nav-item app-shell__nav-item--active'
                    : 'app-shell__nav-item'
                }
              >
                <span className="app-shell__nav-icon">
                  <SidebarIcon name={item.icon} />
                </span>
                <span className="app-shell__nav-copy">
                  <strong>{item.label}</strong>
                  <small>{item.subtitle}</small>
                </span>
              </NavLink>
            );
          }

          return (
            <button key={item.label} type="button" className="app-shell__nav-item app-shell__nav-item--ghost">
              <span className="app-shell__nav-icon">
                <SidebarIcon name={item.icon} />
              </span>
              <span className="app-shell__nav-copy">
                <strong>{item.label}</strong>
                <small>{item.subtitle}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="app-shell__sidebar-footer">
        <div className="app-shell__sidebar-card">
          <span className="app-shell__sidebar-card-title">数据范围</span>
          <span>{config?.includePrivateRepos ? '公开仓库 + 私有仓库' : '公开仓库'}</span>
          <span className="app-shell__sidebar-card-title">时区设置</span>
          <span>{config?.timezone || 'Asia/Shanghai'}</span>
        </div>
        <div className="app-shell__sidebar-meta">
          <span>© 2026 CodeView</span>
          <span>v1.0.0</span>
        </div>
      </div>
    </aside>
  );
}

function AppFrame(): ReactElement {
  const { userId, setConfig } = useAppStore();
  const [bootstrapError, setBootstrapError] = useState<string>('');

  useEffect(() => {
    let active = true;

    const loadConfig = async (): Promise<void> => {
      try {
        const result = await fetchConfig();

        if (active) {
          setConfig(result);
          setBootstrapError('');
        }
      } catch (error) {
        if (active) {
          setBootstrapError(error instanceof Error ? error.message : '初始化配置失败');
        }
      }
    };

    void loadConfig();

    return () => {
      active = false;
    };
  }, [setConfig, userId]);

  return (
    <div className="app-shell">
      <SidebarNavigation />

      <div className="app-shell__main">
        {bootstrapError && <div className="app-banner">{bootstrapError}</div>}

        <main className="app-shell__content">
          <Suspense fallback={<LoadingBlock text="正在加载页面" />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/repos" element={<RepositoriesPage />} />
              <Route path="/repos/:repoId" element={<RepositoryDetailPage />} />
              <Route path="/statistics" element={<StatisticsPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function App(): ReactElement {
  return (
    <BrowserRouter>
      <AppFrame />
    </BrowserRouter>
  );
}

export default App;
