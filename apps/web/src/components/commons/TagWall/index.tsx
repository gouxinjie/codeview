import './index.scss';

/**
 * 组件说明：展示技术栈或标签集合。
 * Props 类型：items 为字符串数组。
 * 含义：统一渲染标签墙。
 * 是否必填：items 必填。
 * 默认值：无。
 */
interface TagWallProps {
  items: string[];
}

export function TagWall(props: TagWallProps): JSX.Element {
  const { items } = props;

  return (
    <div className="tag-wall">
      {items.map((item) => (
        <span key={item} className="tag-wall__item">
          {item}
        </span>
      ))}
    </div>
  );
}

