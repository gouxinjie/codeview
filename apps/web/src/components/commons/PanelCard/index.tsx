import type { PropsWithChildren, ReactNode } from 'react';
import './index.scss';

/**
 * 组件说明：统一面板容器。
 * Props 类型：title、subtitle、extra 均为可选。
 * 含义：承载 Dashboard 和详情页中的信息卡片。
 * 是否必填：children 必填，其余选填。
 * 默认值：subtitle、extra 默认为空。
 */
interface PanelCardProps {
  title?: string;
  subtitle?: string;
  extra?: ReactNode;
}

export function PanelCard(props: PropsWithChildren<PanelCardProps>): JSX.Element {
  const { title, subtitle, extra, children } = props;

  return (
    <section className="panel-card">
      {(title || subtitle || extra) && (
        <header className="panel-card__header">
          <div>
            {title && <h3 className="panel-card__title">{title}</h3>}
            {subtitle && <p className="panel-card__subtitle">{subtitle}</p>}
          </div>
          {extra && <div className="panel-card__extra">{extra}</div>}
        </header>
      )}
      <div className="panel-card__body">{children}</div>
    </section>
  );
}

