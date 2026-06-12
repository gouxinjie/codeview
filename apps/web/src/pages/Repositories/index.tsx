import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/commons/EmptyState';
import { LoadingBlock } from '../../components/commons/LoadingBlock';
import type { RepoListItem } from '../../types/api';
import { fetchRepositories } from '../../utils/api';
import { formatNumber } from '../../utils/date';
import './index.scss';

type RepositorySortMode = 'score' | 'activity' | 'updated' | 'stars';
type RepositoryActivityFilter = 'all' | 'high' | 'medium' | 'low';
type RepositoryViewMode = 'grid' | 'list';
type RepositoryPageSize = 12 | 24 | 48;

const PAGE_SIZE_OPTIONS: RepositoryPageSize[] = [12, 24, 48];

/**
 * 页面说明：项目列表页。
 * Props 类型：无。
 * 含义：按设计图重构项目列表展示、筛选和分页布局。
 * 是否必填：无。
 * 默认值：无。
 */
function RepositoriesPage(): JSX.Element {
  const [allRepositories, setAllRepositories] = useState<RepoListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [sortMode, setSortMode] = useState<RepositorySortMode>('score');
  const [activityFilter, setActivityFilter] = useState<RepositoryActivityFilter>('all');
  const [stackTag, setStackTag] = useState<string>('');
  const [language, setLanguage] = useState<string>('');
  const [viewMode, setViewMode] = useState<RepositoryViewMode>('grid');
  const [pageSize, setPageSize] = useState<RepositoryPageSize>(12);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    let active = true;

    const loadRepositories = async (): Promise<void> => {
      setLoading(true);

      try {
        const result = await fetchRepositories({});

        if (active) {
          setAllRepositories(result);
          setError('');
        }
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : '仓库列表加载失败');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadRepositories();

    return () => {
      active = false;
    };
  }, []);

  const languages = useMemo(
    () =>
      [...new Set(allRepositories.map((item) => item.mainLanguage).filter((item) => item.trim().length > 0))].sort((left, right) =>
        left.localeCompare(right)
      ),
    [allRepositories]
  );

  const stackTags = useMemo(
    () => [...new Set(allRepositories.flatMap((item) => item.stackTags))].sort((left, right) => left.localeCompare(right)),
    [allRepositories]
  );

  const filteredRepositories = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return allRepositories.filter((item) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        item.name.toLowerCase().includes(normalizedSearch) ||
        item.fullName.toLowerCase().includes(normalizedSearch) ||
        item.description.toLowerCase().includes(normalizedSearch);

      const matchesLanguage = language.length === 0 || item.mainLanguage === language;
      const matchesStackTag = stackTag.length === 0 || item.stackTags.includes(stackTag);
      const matchesActivity = matchesActivityLevel(item, activityFilter);

      return matchesSearch && matchesLanguage && matchesStackTag && matchesActivity;
    });
  }, [activityFilter, allRepositories, language, search, stackTag]);

  const sortedRepositories = useMemo(() => {
    const copiedRepositories = [...filteredRepositories];

    copiedRepositories.sort((left, right) => {
      if (sortMode === 'updated') {
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }

      if (sortMode === 'activity') {
        if (right.activeDays30d === left.activeDays30d) {
          return right.commitCount30d - left.commitCount30d;
        }

        return right.activeDays30d - left.activeDays30d;
      }

      if (sortMode === 'stars') {
        return right.starsCount - left.starsCount;
      }

      return right.score - left.score;
    });

    return copiedRepositories;
  }, [filteredRepositories, sortMode]);

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(sortedRepositories.length / pageSize)),
    [pageSize, sortedRepositories.length]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activityFilter, language, pageSize, search, sortMode, stackTag, viewMode]);

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [currentPage, pageCount]);

  const pagedRepositories = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRepositories.slice(start, start + pageSize);
  }, [currentPage, pageSize, sortedRepositories]);

  const pageNumbers = useMemo(() => buildPageNumbers(currentPage, pageCount), [currentPage, pageCount]);

  const resetFilters = (): void => {
    setSearch('');
    setSortMode('score');
    setActivityFilter('all');
    setStackTag('');
    setLanguage('');
    setCurrentPage(1);
  };

  if (loading) {
    return <LoadingBlock text="正在加载项目列表" />;
  }

  if (error) {
    return <EmptyState title="项目列表暂不可用" description={error} />;
  }

  return (
    <div className="repositories-page">
      <section className="repositories-page__hero">
        <div className="repositories-page__title-wrap">
          <h1 className="repositories-page__title">项目列表</h1>
          <p className="repositories-page__count">共 {formatNumber(sortedRepositories.length)} 个项目</p>
        </div>

        <div className="repositories-page__toolbar">
          <label className="repositories-page__search">
            <span className="repositories-page__search-icon">
              <SearchIcon />
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索项目名称、描述或语言..."
            />
          </label>

          <label className="repositories-page__select">
            <span className="repositories-page__select-label">排序方式</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as RepositorySortMode)}>
              <option value="score">综合评分</option>
              <option value="activity">活跃度</option>
              <option value="updated">最近更新</option>
              <option value="stars">星标数</option>
            </select>
          </label>

          <label className="repositories-page__select">
            <span className="repositories-page__select-label">活跃度</span>
            <select
              value={activityFilter}
              onChange={(event) => setActivityFilter(event.target.value as RepositoryActivityFilter)}
            >
              <option value="all">全部</option>
              <option value="high">高活跃</option>
              <option value="medium">中活跃</option>
              <option value="low">低活跃</option>
            </select>
          </label>

          <label className="repositories-page__select">
            <span className="repositories-page__select-label">技术栈</span>
            <select value={stackTag} onChange={(event) => setStackTag(event.target.value)}>
              <option value="">全部</option>
              {stackTags.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="repositories-page__select">
            <span className="repositories-page__select-label">语言</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="">全部</option>
              {languages.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="repositories-page__reset" onClick={resetFilters}>
            <ResetIcon />
            <span>重置筛选</span>
          </button>
        </div>

        <div className="repositories-page__toolbar-bottom">
          <div className="repositories-page__view-switch" aria-label="视图切换">
            <button
              type="button"
              className={
                viewMode === 'grid'
                  ? 'repositories-page__view-button repositories-page__view-button--active'
                  : 'repositories-page__view-button'
              }
              onClick={() => setViewMode('grid')}
            >
              <GridIcon />
            </button>
            <button
              type="button"
              className={
                viewMode === 'list'
                  ? 'repositories-page__view-button repositories-page__view-button--active'
                  : 'repositories-page__view-button'
              }
              onClick={() => setViewMode('list')}
            >
              <ListIcon />
            </button>
          </div>
        </div>
      </section>

      {sortedRepositories.length === 0 ? (
        <EmptyState title="没有匹配的项目" description="调整筛选条件或先完成一次同步。" />
      ) : (
        <>
          <section
            className={
              viewMode === 'grid'
                ? 'repositories-page__grid repositories-page__grid--cards'
                : 'repositories-page__grid repositories-page__grid--list'
            }
          >
            {pagedRepositories.map((item, index) => (
              <Link key={item.id} to={`/repos/${item.id}`} className="repository-card">
                <div className="repository-card__header">
                  <span className="repository-card__index">{(currentPage - 1) * pageSize + index + 1}</span>
                  <div className="repository-card__identity">
                    <div className="repository-card__icon">
                      <RepoIcon />
                    </div>
                    <div className="repository-card__title-wrap">
                      <strong className="repository-card__title">{item.name}</strong>
                      <p className="repository-card__subtitle">{item.description || item.fullName}</p>
                    </div>
                  </div>
                  <RepoScoreBadge score={item.score} />
                </div>

                <div className="repository-card__tags">
                  {(item.stackTags.length > 0 ? item.stackTags : [item.mainLanguage || '未识别']).slice(0, 4).map((tag) => (
                    <span key={`${item.id}-${tag}`} className="repository-card__tag">
                      <i />
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="repository-card__summary">
                  <div>
                    <span>近 30 天提交</span>
                    <strong>{formatNumber(item.commitCount30d)}</strong>
                  </div>
                  <div>
                    <span>活跃天数</span>
                    <strong>{formatNumber(item.activeDays30d)}</strong>
                  </div>
                  <div>
                    <span>最近更新</span>
                    <strong>{formatRepositoryDate(item.updatedAt)}</strong>
                  </div>
                </div>

                <div className="repository-card__footer">
                  <span className="repository-card__meta-item">
                    <StarIcon />
                    {formatNumber(item.starsCount)}
                  </span>
                  <span className="repository-card__meta-item">
                    <PulseIcon />
                    {item.mainLanguage || '--'}
                  </span>
                  <span className="repository-card__meta-item">
                    <ScoreIcon />
                    {item.score.toFixed(1)}
                  </span>
                </div>
              </Link>
            ))}
          </section>

          <footer className="repositories-page__pagination">
            <span className="repositories-page__pagination-count">共 {formatNumber(sortedRepositories.length)} 条</span>

            <div className="repositories-page__pagination-main">
              <button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                <ArrowLeftIcon />
              </button>

              {pageNumbers.map((item, index) =>
                item === 'ellipsis' ? (
                  <span key={`${currentPage}-ellipsis-${index}`} className="repositories-page__page-ellipsis">
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={
                      item === currentPage
                        ? 'repositories-page__page-button repositories-page__page-button--active'
                        : 'repositories-page__page-button'
                    }
                    onClick={() => setCurrentPage(item)}
                  >
                    {item}
                  </button>
                )
              )}

              <button
                type="button"
                disabled={currentPage === pageCount}
                onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
              >
                <ArrowRightIcon />
              </button>
            </div>

            <label className="repositories-page__page-size">
              <span>每页显示</span>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value) as RepositoryPageSize)}
              >
                {PAGE_SIZE_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item} 条
                  </option>
                ))}
              </select>
            </label>
          </footer>
        </>
      )}
    </div>
  );
}

function RepoScoreBadge(props: { score: number }): JSX.Element {
  const { score } = props;
  const normalizedScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;

  return (
    <span
      className="repository-card__score"
      style={{
        background: `conic-gradient(#b8ff3b 0deg ${normalizedScore * 3.6}deg, rgba(255,255,255,0.08) ${normalizedScore * 3.6}deg 360deg)`
      }}
    >
      <span>{normalizedScore.toFixed(1)}</span>
    </span>
  );
}

function RepoIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.4 4.5 7.5v9L12 20.6l7.5-4.1v-9L12 3.4Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 7.5 12 11l7.5-3.5M12 11v9.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function SearchIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m15.5 15.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ResetIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.4 7.5H11V4M8 7A6.7 6.7 0 1 1 6 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GridIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ListIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7h12M7 12h12M7 17h12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="4" cy="7" r="1.1" fill="currentColor" />
      <circle cx="4" cy="12" r="1.1" fill="currentColor" />
      <circle cx="4" cy="17" r="1.1" fill="currentColor" />
    </svg>
  );
}

function StarIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 4.8 2 4 4.4.6-3.2 3.1.8 4.4L12 14.8 8 16.9l.8-4.4-3.2-3.1 4.4-.6 2-4Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function PulseIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 12h3.5l2-4.4 3.1 9 2.2-5h4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScoreIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8.3v3.9l2.7 1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowLeftIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.5 6.5-5 5 5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9.5 6.5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatRepositoryDate(value: string): string {
  return value.slice(0, 10);
}

function matchesActivityLevel(item: RepoListItem, filter: RepositoryActivityFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'high') {
    return item.activeDays30d >= 12;
  }

  if (filter === 'medium') {
    return item.activeDays30d >= 5 && item.activeDays30d < 12;
  }

  return item.activeDays30d < 5;
}

function buildPageNumbers(currentPage: number, pageCount: number): Array<number | 'ellipsis'> {
  if (pageCount <= 6) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, 'ellipsis', pageCount];
  }

  if (currentPage >= pageCount - 2) {
    return [1, 'ellipsis', pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  }

  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', pageCount];
}

export default RepositoriesPage;
