import './index.scss';

/**
 * 组件说明：页面和卡片级加载状态。
 * Props 类型：text 为可选字符串。
 * 含义：统一展示加载反馈。
 * 是否必填：否。
 * 默认值：正在加载数据。
 */
interface LoadingBlockProps {
  text?: string;
}

export function LoadingBlock(props: LoadingBlockProps): JSX.Element {
  return (
    <div className="loading-block">
      <div className="loading-block__pulse" />
      <span>{props.text ?? '正在加载数据'}</span>
    </div>
  );
}

