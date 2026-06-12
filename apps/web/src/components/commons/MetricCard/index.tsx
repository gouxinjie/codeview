import './index.scss';

/**
 * 组件说明：展示单个 KPI 指标。
 * Props 类型：label、value、hint 均为字符串。
 * 含义：用于首页顶部经营指标展示。
 * 是否必填：全部必填。
 * 默认值：无。
 */
interface MetricCardProps {
  label: string;
  value: string;
  hint: string;
}

export function MetricCard(props: MetricCardProps): JSX.Element {
  const { label, value, hint } = props;

  return (
    <article className="metric-card">
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
      <span className="metric-card__hint">{hint}</span>
    </article>
  );
}

