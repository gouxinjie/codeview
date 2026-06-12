import { translateSyncStatus } from '@/utils/date';
import './index.scss';

/**
 * 组件说明：展示同步或洞察状态。
 * Props 类型：status 为字符串。
 * 含义：根据状态切换不同视觉样式。
 * 是否必填：status 必填。
 * 默认值：无。
 */
interface StatusBadgeProps {
  status: string;
}

export function StatusBadge(props: StatusBadgeProps): JSX.Element {
  const { status } = props;

  return (
    <span className={`status-badge status-badge--${status}`}>
      <span className="status-badge__dot" />
      {translateSyncStatus(status)}
    </span>
  );
}
