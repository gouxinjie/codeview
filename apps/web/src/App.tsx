import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, BarChart3, Boxes, CheckCircle2, FileText, FolderOpen, LayoutGrid, Settings2 } from 'lucide-react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { GlobalSyncOverlay } from '@/components/commons/GlobalSyncOverlay';
import { LoadingBlock } from '@/components/commons/LoadingBlock';
import { useAppStore } from '@/store/appStore';
import { fetchAdminSession, fetchConfig, fetchSyncStatus } from '@/utils/api';
import { useResponsiveViewport } from '@/utils/responsive';
import { Menu, X } from 'lucide-react';

const DashboardPage = lazy(() => import('./pages/Dashboard'));
const RepositoriesPage = lazy(() => import('./pages/Repositories'));
const RepositoryDetailPage = lazy(() => import('./pages/RepositoryDetail'));
const StackAnalysisPage = lazy(() => import('./pages/StackAnalysis'));
const InsightCenterPage = lazy(() => import('./pages/InsightCenter'));
const StatisticsPage = lazy(() => import('./pages/Statistics'));
const ConfigCenterPage = lazy(() => import('./pages/ConfigCenter'));

type SidebarIconName = 'dashboard' | 'repo' | 'detail' | 'stack' | 'insight' | 'stats' | 'config';

interface SidebarItem {
  label: string;
  subtitle: string;
  to?: string;
  icon: SidebarIconName;
  end?: boolean;
  match?: (pathname: string) => boolean;
  onClick?: () => void;
}

interface SidebarNavigationProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileVisible: boolean;
  onCloseMobile: () => void;
}

const SIDEBAR_ICON_MAP: Record<SidebarIconName, LucideIcon> = {
  dashboard: LayoutGrid,
  repo: FolderOpen,
  detail: FileText,
  stack: Boxes,
  insight: AlertCircle,
  stats: BarChart3,
  config: Settings2
};

/**
 * 组件说明：侧边栏图标。
 * Props 类型：name 为图标名称。
 * 含义：统一渲染导航使用的内联 SVG 图标。
 * 是否必填：必填。
 * 默认值：无。
 */
function SidebarIcon(props: { name: SidebarIconName }): ReactElement {
  const { name } = props;
  const Icon = SIDEBAR_ICON_MAP[name];

  return <Icon aria-hidden="true" strokeWidth={1.75} />;
}

function SidebarNavigation(props: SidebarNavigationProps): ReactElement {
  const { collapsed, onToggleCollapse, mobileVisible, onCloseMobile } = props;
  const location = useLocation();
  const { config, selectedRepoId, showToast } = useAppStore();
  const viewport = useResponsiveViewport();
  const isMobile = viewport === 'mobile';

  const repositoryDetailPath = selectedRepoId ? `/repos/${selectedRepoId}` : undefined;

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
      to: repositoryDetailPath,
      icon: 'detail',
      match: (pathname) => /^\/repos\/\d+$/.test(pathname),
      onClick: () => {
        showToast('请先从首页排行或项目列表中选择一个项目。', 'error');
      }
    },
    { label: '技术栈分析', subtitle: '标签与语言', to: '/stack-analysis', icon: 'stack', end: true },
    { label: '洞察中心', subtitle: '自动结论', to: '/insights', icon: 'insight', end: true },
    { label: '数据统计', subtitle: '经营指标', to: '/statistics', icon: 'stats', end: true },
    { label: '配置中心', subtitle: '数据源配置', to: '/config-center', icon: 'config', end: true }
  ];

  const handleLinkClick = (item: SidebarItem) => {
    if (isMobile) {
      onCloseMobile();
    }
    if (item.onClick) {
      item.onClick();
    }
  };

  const sidebarClass = [
    'app-shell__sidebar',
    collapsed && !isMobile ? 'app-shell__sidebar--collapsed' : '',
    isMobile && mobileVisible ? 'app-shell__sidebar--mobile-visible' : '',
    isMobile ? 'app-shell__sidebar--mobile' : ''
  ].filter(Boolean).join(' ');

  return (
    <>
      {isMobile && mobileVisible && (
        <div className="app-shell__sidebar-overlay" onClick={onCloseMobile} />
      )}
      <aside className={sidebarClass}>
        <div className="app-shell__sidebar-head">
          <div className="app-shell__brand">
            <img
              className="app-shell__brand-icon"
              src="/favicon.svg"
              alt="CodeView"
            />
            <div className="app-shell__brand-copy">
              <strong className="app-shell__brand-title">CODEVIEW</strong>
              <span className="app-shell__brand-subtitle">GitHub 项目数据看板</span>
            </div>
          </div>
          {!isMobile && (
            <button
              className={collapsed ? 'app-shell__collapse app-shell__collapse--collapsed' : 'app-shell__collapse'}
              type="button"
              aria-label={collapsed ? '展开导航' : '收起导航'}
              aria-expanded={!collapsed}
              onClick={onToggleCollapse}
            >
              <span />
            </button>
          )}
          {isMobile && (
            <button
              className="app-shell__mobile-close"
              type="button"
              aria-label="关闭导航"
              onClick={onCloseMobile}
            >
              <X size={20} />
            </button>
          )}
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
                  title={item.label}
                  onClick={() => handleLinkClick(item)}
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
              <button
                key={item.label}
                type="button"
                className="app-shell__nav-item app-shell__nav-item--ghost"
                title={item.label}
                onClick={() => handleLinkClick(item)}
              >
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
    </>
  );
}

function AppFrame(): ReactElement {
  const location = useLocation();
  const { userId, toast, clearToast, setAdminSession, setConfig, setConfigLoaded, setSyncStatus } = useAppStore();
  const [bootstrapError, setBootstrapError] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileSidebarVisible, setMobileSidebarVisible] = useState<boolean>(false);
  const viewport = useResponsiveViewport();
  const isMobile = viewport === 'mobile';
  
  const routeTransitionKey = `${location.pathname}${location.search}`;

  useEffect(() => {
    // 路由变化时，如果是移动端，自动关闭侧边栏
    if (isMobile) {
      setMobileSidebarVisible(false);
    }
  }, [location.pathname, isMobile]);

  useEffect(() => {
    let active = true;

    const loadConfig = async (): Promise<void> => {
      try {
        const [configResult, adminSessionResult, syncStatusResult] = await Promise.all([
          fetchConfig(),
          fetchAdminSession(),
          fetchSyncStatus()
        ]);

        if (active) {
          setAdminSession(adminSessionResult);
          setConfig(configResult);
          setSyncStatus(syncStatusResult);
          setConfigLoaded(true);
          setBootstrapError('');
        }
      } catch (error) {
        if (active) {
          setConfigLoaded(true);
          setBootstrapError(error instanceof Error ? error.message : '初始化配置失败');
        }
      }
    };

    void loadConfig();

    return () => {
      active = false;
    };
  }, [setAdminSession, setConfig, setConfigLoaded, setSyncStatus, userId]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      clearToast();
    }, 3200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [clearToast, toast]);

  const shellClass = [
    'app-shell',
    sidebarCollapsed && !isMobile ? 'app-shell--collapsed' : '',
    isMobile ? 'app-shell--mobile' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={shellClass}>
      {isMobile && (
        <header className="app-shell__mobile-header">
          <button
            className="app-shell__mobile-menu-btn"
            onClick={() => setMobileSidebarVisible(true)}
            aria-label="打开菜单"
          >
            <Menu size={24} />
          </button>
          <div className="app-shell__mobile-brand">
            <img src="/favicon.svg" alt="Logo" />
            <span>CODEVIEW</span>
          </div>
          <div className="app-shell__mobile-spacer" />
        </header>
      )}

      <SidebarNavigation
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
        mobileVisible={mobileSidebarVisible}
        onCloseMobile={() => setMobileSidebarVisible(false)}
      />

      <div className="app-shell__main">
        {bootstrapError && <div className="app-banner">{bootstrapError}</div>}

        <main className="app-shell__content">
          <div key={routeTransitionKey} className="app-shell__route-stage">
            <Suspense fallback={<LoadingBlock text="正在加载页面" />}>
              <Routes location={location}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/repos" element={<RepositoriesPage />} />
                <Route path="/repos/:repoId" element={<RepositoryDetailPage />} />
                <Route path="/stack-analysis" element={<StackAnalysisPage />} />
                <Route path="/insights" element={<InsightCenterPage />} />
                <Route path="/statistics" element={<StatisticsPage />} />
                <Route path="/config-center" element={<ConfigCenterPage />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>

      <GlobalSyncOverlay />
      {toast && (
        <div
          className={
            toast.tone === 'success'
              ? 'app-toast app-toast--success'
              : 'app-toast app-toast--error'
          }
          role="status"
          aria-live="polite"
        >
          <span className="app-toast__icon" aria-hidden="true">
            {toast.tone === 'success' ? <CheckCircle2 strokeWidth={1.8} /> : <AlertCircle strokeWidth={1.8} />}
          </span>
          <span className="app-toast__message">{toast.message}</span>
        </div>
      )}
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
