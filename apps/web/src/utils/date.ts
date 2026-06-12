/* 常用日期格式化工具，保证界面显示统一。 */
export function formatDateTime(value: string | null): string {
  if (!value) {
    return '--';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function translateSyncStatus(value: string): string {
  if (value === 'success') {
    return '已完成';
  }

  if (value === 'running') {
    return '同步中';
  }

  if (value === 'failed') {
    return '失败';
  }

  return '待同步';
}

