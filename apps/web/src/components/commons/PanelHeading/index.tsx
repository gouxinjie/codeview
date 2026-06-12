import type { ReactNode } from 'react';
import './index.scss';

type PanelHeadingVariant = 'dashboard' | 'detail' | 'statistics';

/**
 * 组件说明：统一首页和项目详情页的区块标题头。
 * Props 类型：`variant` 必填，`title` 必填，`eyebrow`、`accessory`、`corner` 选填。
 * 含义：负责渲染标题层级、右侧操作区和详情页角标图标。
 * 是否必填：`variant`、`title` 必填，其余选填。
 * 默认值：`eyebrow`、`accessory`、`corner` 默认为空。
 * author: gouxinjie
 */
interface PanelHeadingProps {
  variant: PanelHeadingVariant;
  title: string;
  eyebrow?: string;
  accessory?: ReactNode;
  corner?: ReactNode;
}

export function PanelHeading(props: PanelHeadingProps): JSX.Element {
  const { accessory, corner, eyebrow, title, variant } = props;

  return (
    <header className={`panel-heading panel-heading--${variant}`}>
      <div className="panel-heading__main">
        {eyebrow ? <p className="panel-heading__eyebrow">{eyebrow}</p> : null}
        <h2 className="panel-heading__title">{title}</h2>
      </div>

      {accessory || corner ? (
        <div className="panel-heading__side">
          {accessory}
          {corner ? (
            <span className="panel-heading__corner" aria-hidden="true">
              {corner}
            </span>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
