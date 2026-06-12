import type { CSSProperties } from 'react';
import './index.scss';

type ScoreRingVariant = 'dashboard' | 'detail';

/**
 * 函数说明：将评分限制在 0 到 100 之间，避免圆环渲染异常。
 * 参数说明：`score` 为原始评分值。
 * 返回说明：返回经过归一化后的评分值。
 * author: gouxinjie
 */
function normalizeScore(score: number): number {
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
}

/**
 * 函数说明：按不同页面的视觉规则构建评分环背景。
 * 参数说明：`score` 为归一化后的评分值，`variant` 为组件样式变体。
 * 返回说明：返回用于内联样式的背景对象。
 * author: gouxinjie
 */
function buildScoreRingStyle(score: number, variant: ScoreRingVariant): CSSProperties {
  if (variant === 'dashboard') {
    return {
      background: `conic-gradient(from 212deg, rgba(255,255,255,0.08) 0deg ${360 - score * 3.6}deg, #b5ff35 ${360 - score * 3.6}deg 360deg)`
    };
  }

  return {
    background: `conic-gradient(#b8ff3b 0deg ${score * 3.6}deg, rgba(255,255,255,0.08) ${score * 3.6}deg 360deg)`
  };
}

/**
 * 组件说明：通用评分环组件。
 * Props 类型：`variant` 与 `score` 必填，`suffix` 选填。
 * 含义：复用首页与项目详情页的评分圆环结构和数值格式化逻辑。
 * 是否必填：`variant`、`score` 必填，`suffix` 选填。
 * 默认值：`suffix` 默认为空。
 * author: gouxinjie
 */
interface ScoreRingProps {
  variant: ScoreRingVariant;
  score: number;
  suffix?: string;
}

export function ScoreRing(props: ScoreRingProps): JSX.Element {
  const { score, suffix, variant } = props;
  const normalizedScore = normalizeScore(score);

  return (
    <div className={`score-ring score-ring--${variant}`} style={buildScoreRingStyle(normalizedScore, variant)}>
      <div className="score-ring__inner">
        <div>
          <strong className="score-ring__value">{normalizedScore.toFixed(1)}</strong>
          {suffix ? <span className="score-ring__suffix">{suffix}</span> : null}
        </div>
      </div>
    </div>
  );
}
