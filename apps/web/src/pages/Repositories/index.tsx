import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderGit2,
  LayoutGrid,
  List,
  RotateCcw,
  Search,
  Sparkles,
  Star
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/commons/EmptyState';
import { LoadingBlock } from '@/components/commons/LoadingBlock';
import { useAppStore } from '@/store/appStore';
import type { RepoListItem } from '@/types/api';
import { fetchRepositories } from '@/utils/api';
import { formatNumber } from '@/utils/date';
import './index.scss';

type RepositorySortMode = 'score' | 'activity' | 'updated' | 'stars';
type RepositoryActivityFilter = 'all' | 'high' | 'medium' | 'low';
type RepositoryViewMode = 'grid' | 'list';
type RepositoryPageSize = 12 | 24 | 48;

const PAGE_SIZE_OPTIONS: RepositoryPageSize[] = [12, 24, 48];

interface FilterSelectProps {
  label: string;
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

interface FilterSelectOption {
  value: string;
  label: string;
}

/**
 * 页面说明：项目列表页。
 * Props 类型：无。
 * 含义：按设计图重构项目列表展示、筛选和分页布局。
 * 是否必填：无。
 * 默认值：无。
 */
function RepositoriesPage(): JSX.Element {
  const { setSelectedRepoId } = useAppStore();
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
  const sortOptions = useMemo<FilterSelectOption[]>(
    () => [
      { value: 'score', label: '综合评分' },
      { value: 'activity', label: '活跃度' },
      { value: 'updated', label: '最近更新' },
      { value: 'stars', label: '星标数' }
    ],
    []
  );
  const activityOptions = useMemo<FilterSelectOption[]>(
    () => [
      { value: 'all', label: '全部' },
      { value: 'high', label: '高活跃' },
      { value: 'medium', label: '中活跃' },
      { value: 'low', label: '低活跃' }
    ],
    []
  );
  const stackTagOptions = useMemo<FilterSelectOption[]>(
    () => [{ value: '', label: '全部' }, ...stackTags.map((item) => ({ value: item, label: item }))],
    [stackTags]
  );
  const languageOptions = useMemo<FilterSelectOption[]>(
    () => [{ value: '', label: '全部' }, ...languages.map((item) => ({ value: item, label: item }))],
    [languages]
  );
  const pageSizeOptions = useMemo<FilterSelectOption[]>(
    () => PAGE_SIZE_OPTIONS.map((item) => ({ value: String(item), label: `${item} 条` })),
    []
  );

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
        <div className="repositories-page__hero-head">
          <div className="repositories-page__title-wrap">
            <h1 className="repositories-page__title">项目列表</h1>
            <p className="repositories-page__count">共 {formatNumber(sortedRepositories.length)} 个项目</p>
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
                <LayoutGrid aria-hidden="true" strokeWidth={1.7} />
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
                <List aria-hidden="true" strokeWidth={1.7} />
              </button>
            </div>
          </div>
        </div>

        <div className="repositories-page__toolbar">
          <label className="repositories-page__search">
            <span className="repositories-page__search-icon">
              <Search aria-hidden="true" strokeWidth={1.7} />
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索项目名称、描述或语言..."
            />
          </label>

          <FilterSelect
            label="排序方式"
            value={sortMode}
            options={sortOptions}
            onChange={(value) => setSortMode(value as RepositorySortMode)}
          />

          <FilterSelect
            label="活跃度"
            value={activityFilter}
            options={activityOptions}
            onChange={(value) => setActivityFilter(value as RepositoryActivityFilter)}
          />

          <FilterSelect label="技术栈" value={stackTag} options={stackTagOptions} onChange={setStackTag} />

          <FilterSelect label="语言" value={language} options={languageOptions} onChange={setLanguage} />

          <button type="button" className="repositories-page__reset" onClick={resetFilters}>
            <RotateCcw aria-hidden="true" strokeWidth={1.7} />
            <span>重置筛选</span>
          </button>
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
              <Link
                key={item.id}
                to={`/repos/${item.id}`}
                className="repository-card"
                onClick={() => setSelectedRepoId(item.id)}
              >
                <div className="repository-card__header">
                  <span className="repository-card__index">{(currentPage - 1) * pageSize + index + 1}</span>
                  <div className="repository-card__identity">
                    <div className="repository-card__icon">
                      <FolderGit2 aria-hidden="true" strokeWidth={1.7} />
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
                    <Star aria-hidden="true" strokeWidth={1.7} />
                    {formatNumber(item.starsCount)}
                  </span>
                  <span className="repository-card__meta-item">
                    <Activity aria-hidden="true" strokeWidth={1.7} />
                    {item.mainLanguage || '--'}
                  </span>
                  <span className="repository-card__meta-item">
                    <Sparkles aria-hidden="true" strokeWidth={1.7} />
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
                <ChevronLeft aria-hidden="true" strokeWidth={1.8} />
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
                <ChevronRight aria-hidden="true" strokeWidth={1.8} />
              </button>
            </div>

            <FilterSelect
              className="repositories-page__page-size"
              label="每页显示"
              value={String(pageSize)}
              options={pageSizeOptions}
              onChange={(value) => setPageSize(Number(value) as RepositoryPageSize)}
            />
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

function FilterSelect(props: FilterSelectProps): JSX.Element {
  const { className, label, onChange, options, value } = props;
  const [open, setOpen] = useState<boolean>(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listboxId = useId();
  const currentOption = options.find((item) => item.value === value) ?? options[0];
  const selectedIndex = Math.max(
    0,
    options.findIndex((item) => item.value === value)
  );
  const [activeIndex, setActiveIndex] = useState<number>(selectedIndex);

  const openMenu = (nextIndex: number): void => {
    setActiveIndex(nextIndex);
    setOpen(true);
  };

  const closeMenu = (): void => {
    setOpen(false);
    setActiveIndex(selectedIndex);
  };

  const selectOption = (nextValue: string): void => {
    onChange(nextValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!rootRef.current?.contains(event.target)) {
        closeMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeMenu();
        triggerRef.current?.focus();
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveIndex(selectedIndex);
    menuRef.current?.focus();
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const activeOption = optionRefs.current[activeIndex];
    activeOption?.scrollIntoView({
      block: 'nearest'
    });
  }, [activeIndex, open]);

  const moveActiveIndex = (direction: -1 | 1): void => {
    setActiveIndex((current) => {
      const nextIndex = current + direction;

      if (nextIndex < 0) {
        return options.length - 1;
      }

      if (nextIndex >= options.length) {
        return 0;
      }

      return nextIndex;
    });
  };

  return (
    <div ref={rootRef} className={className ? `repositories-page__select ${className}` : 'repositories-page__select'}>
      <span className="repositories-page__select-label">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className={open ? 'repositories-page__select-trigger repositories-page__select-trigger--open' : 'repositories-page__select-trigger'}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openMenu(event.key === 'ArrowDown' ? selectedIndex : Math.max(0, selectedIndex));
          }

          if ((event.key === 'Enter' || event.key === ' ') && !open) {
            event.preventDefault();
            openMenu(selectedIndex);
          }
        }}
      >
        <span className="repositories-page__select-value">{currentOption?.label ?? ''}</span>
        <span className="repositories-page__select-arrow" aria-hidden="true">
          <ChevronDown strokeWidth={1.7} />
        </span>
      </button>
      {open ? (
        <div
          id={listboxId}
          ref={menuRef}
          className="repositories-page__select-menu"
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${listboxId}-option-${activeIndex}`}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              moveActiveIndex(1);
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              moveActiveIndex(-1);
            }

            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              selectOption(options[activeIndex]?.value ?? currentOption?.value ?? value);
            }

            if (event.key === 'Tab') {
              closeMenu();
            }
          }}
        >
          {options.map((item, index) => (
            <div
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              id={`${listboxId}-option-${index}`}
              key={`${label}-${item.value || 'empty'}`}
              role="option"
              aria-selected={item.value === value}
              className={
                index === activeIndex
                  ? item.value === value
                    ? 'repositories-page__select-option repositories-page__select-option--active repositories-page__select-option--focused'
                    : 'repositories-page__select-option repositories-page__select-option--focused'
                  : item.value === value
                    ? 'repositories-page__select-option repositories-page__select-option--active'
                    : 'repositories-page__select-option'
              }
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                selectOption(item.value);
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
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
