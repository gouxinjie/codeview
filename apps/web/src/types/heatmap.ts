/* 文件说明：热力图矩阵渲染相关类型定义。 */

export interface HeatmapMatrixMonth {
  label: string;
  column: number;
}

export interface HeatmapMatrixCell {
  key: string;
  date: string;
  count: number;
  column: number;
  row: number;
}

export interface HeatmapMatrixModel {
  months: HeatmapMatrixMonth[];
  cells: HeatmapMatrixCell[];
  maxValue: number;
}
