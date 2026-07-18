import { useEffect, useState } from 'react';

export type ResponsiveViewport = 'mobile' | 'tablet' | 'desktop';

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

/**
 * 函数说明：根据当前窗口宽度返回统一的响应式视口类型。
 * 参数说明：`width` 为当前窗口宽度。
 * 返回说明：返回 `mobile`、`tablet` 或 `desktop`。
 */
function resolveViewport(width: number): ResponsiveViewport {
  if (width <= MOBILE_BREAKPOINT) {
    return 'mobile';
  }

  if (width <= TABLET_BREAKPOINT) {
    return 'tablet';
  }

  return 'desktop';
}

/**
 * Hook 说明：监听窗口宽度并返回当前响应式视口类型。
 * 返回说明：返回统一断点下的视口类型，供页面和图表共用。
 */
export function useResponsiveViewport(): ResponsiveViewport {
  const [viewport, setViewport] = useState<ResponsiveViewport>(() => {
    if (typeof window === 'undefined') {
      return 'desktop';
    }

    return resolveViewport(window.innerWidth);
  });

  useEffect(() => {
    const updateViewport = (): void => {
      setViewport(resolveViewport(window.innerWidth));
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  return viewport;
}

/**
 * 函数说明：根据统一断点返回图表高度。
 * 参数说明：`viewport` 为当前视口类型，`heights` 为桌面、平板、手机三档高度。
 * 返回说明：返回适合当前视口的像素高度。
 */
export function getResponsiveChartHeight(
  viewport: ResponsiveViewport,
  heights: {
    desktop: number;
    tablet?: number;
    mobile: number;
  }
): number {
  if (viewport === 'mobile') {
    return heights.mobile;
  }

  if (viewport === 'tablet') {
    return heights.tablet ?? Math.max(heights.mobile, Math.round((heights.desktop + heights.mobile) / 2));
  }

  return heights.desktop;
}
