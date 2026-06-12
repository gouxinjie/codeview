import './index.scss';

/**
 * 组件说明：空状态或错误占位。
 * Props 类型：title 必填，description 选填。
 * 含义：统一处理无数据场景。
 * 是否必填：title 必填。
 * 默认值：description 默认为空。
 */
interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState(props: EmptyStateProps): JSX.Element {
  return (
    <div className="empty-state">
      <strong className="empty-state__title">{props.title}</strong>
      {props.description && <p className="empty-state__description">{props.description}</p>}
    </div>
  );
}

