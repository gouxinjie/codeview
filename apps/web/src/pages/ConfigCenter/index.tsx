import type { ReactElement } from 'react';
import { ConfigWorkbench } from '@/components/commons/ConfigWorkbench';

/**
 * 页面说明：配置中心页面入口。
 * Props 类型：无。
 * 含义：承载统一的配置工作台，实现与首页快捷配置完全同源。
 * 是否必填：无。
 * 默认值：无。
 */
function ConfigCenterPage(): ReactElement {
  return <ConfigWorkbench variant="page" />;
}

export default ConfigCenterPage;
