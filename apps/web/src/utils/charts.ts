import type { EChartsOption } from 'echarts';
import type { HeatmapCell, RepoActivityPoint, RepoTrafficPoint } from '@/types/api';

const themeText = '#F3EBDD';
const themeSubText = '#9A9488';
const themeBorder = '#2A2E34';
const accentLime = '#B8FF3B';
const accentOrange = '#D96C3F';
const baseCard = '#181B1F';

function buildTooltip(): EChartsOption['tooltip'] {
  return {
    backgroundColor: baseCard,
    borderColor: themeBorder,
    confine: true,
    textStyle: {
      color: themeText
    }
  };
}

/* 生成折线图配置，用于趋势展示。 */
export function buildTrendOption(data: RepoActivityPoint[], seriesName: string): EChartsOption {
  return {
    tooltip: buildTooltip(),
    grid: {
      top: 24,
      right: 18,
      bottom: 28,
      left: 28
    },
    xAxis: {
      type: 'category',
      data: data.map((item) => item.label),
      axisLabel: {
        color: themeSubText
      },
      axisLine: {
        lineStyle: {
          color: themeBorder
        }
      }
    },
    yAxis: {
      type: 'value',
      splitLine: {
        lineStyle: {
          color: themeBorder,
          opacity: 0.5
        }
      },
      axisLabel: {
        color: themeSubText
      }
    },
    series: [
      {
        name: seriesName,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: {
          width: 2,
          color: accentLime
        },
        itemStyle: {
          color: accentOrange
        },
        areaStyle: {
          color: 'rgba(184, 255, 59, 0.08)'
        },
        data: data.map((item) => item.count)
      }
    ]
  };
}

/* 生成语言占比图配置。 */
export function buildLanguageOption(data: Array<{ name: string; value: number }>): EChartsOption {
  return {
    tooltip: buildTooltip(),
    legend: {
      type: 'scroll',
      bottom: 0,
      textStyle: {
        color: themeSubText
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['42%', '74%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderColor: baseCard,
          borderWidth: 2
        },
        label: {
          color: themeText,
          formatter: '{b}\n{d}%'
        },
        data
      }
    ]
  };
}

/* 生成热力图配置，展示全年提交节奏。 */
export function buildHeatmapOption(data: HeatmapCell[], title: string): EChartsOption {
  const counts = data.map((item) => item.count);
  const maxValue = counts.length > 0 ? Math.max(...counts) : 1;
  const currentYear = new Date().getFullYear();
  const range =
    data.length > 0
      ? [data[0].date, data[data.length - 1].date]
      : [`${currentYear}-01-01`, `${currentYear}-12-31`];

  return {
    tooltip: {
      ...buildTooltip(),
      formatter: (params) => {
        const current = Array.isArray(params) ? params[0] : params;
        const rawValue = Array.isArray(current.value) ? current.value : [String(current.value ?? ''), 0];

        return `${String(rawValue[0])}<br/>Commits ${String(rawValue[1])}`;
      }
    },
    visualMap: {
      min: 0,
      max: maxValue,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      textStyle: {
        color: themeSubText
      },
      inRange: {
        color: ['#202428', '#3f5230', accentLime]
      }
    },
    calendar: {
      top: 52,
      left: 20,
      right: 20,
      cellSize: ['auto', 16],
      range,
      yearLabel: {
        color: themeText
      },
      monthLabel: {
        color: themeSubText
      },
      dayLabel: {
        color: themeSubText,
        firstDay: 1
      },
      itemStyle: {
        borderColor: themeBorder,
        color: '#121518'
      }
    },
    title: {
      text: title,
      left: 20,
      top: 12,
      textStyle: {
        color: themeText,
        fontSize: 14,
        fontWeight: 600
      }
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: data.map((item) => [item.date, item.count])
      }
    ]
  };
}

/* 生成流量趋势图配置。 */
export function buildTrafficOption(data: RepoTrafficPoint[]): EChartsOption {
  return {
    tooltip: buildTooltip(),
    legend: {
      type: 'scroll',
      top: 0,
      textStyle: {
        color: themeSubText
      }
    },
    grid: {
      top: 36,
      left: 28,
      right: 20,
      bottom: 24
    },
    xAxis: {
      type: 'category',
      data: data.map((item) => item.date),
      axisLabel: {
        color: themeSubText
      },
      axisLine: {
        lineStyle: {
          color: themeBorder
        }
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: themeSubText
      },
      splitLine: {
        lineStyle: {
          color: themeBorder,
          opacity: 0.5
        }
      }
    },
    series: [
      {
        name: 'Views',
        type: 'bar',
        itemStyle: {
          color: '#5f675b'
        },
        emphasis: {
          itemStyle: {
            color: accentLime
          }
        },
        data: data.map((item) => item.views)
      },
      {
        name: 'Visitors',
        type: 'line',
        smooth: true,
        lineStyle: {
          color: accentOrange
        },
        itemStyle: {
          color: accentOrange
        },
        data: data.map((item) => item.visitors)
      },
      {
        name: 'Clones',
        type: 'line',
        smooth: true,
        lineStyle: {
          color: accentLime
        },
        itemStyle: {
          color: accentLime
        },
        data: data.map((item) => item.clones)
      }
    ]
  };
}
