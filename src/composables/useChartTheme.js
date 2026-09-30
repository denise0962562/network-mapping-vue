import { computed } from 'vue'
import { useTheme } from './useTheme.js'

// Keep each chart's data, callbacks and interaction settings while sharing its
// surface colors. Reactive options update the existing ApexCharts instance.
export function useChartTheme(buildOptions) {
  const { resolvedTheme } = useTheme()
  return computed(() => {
    const options = buildOptions()
    const mode = resolvedTheme.value
    const rootStyle = getComputedStyle(document.documentElement)
    const foreground = rootStyle.getPropertyValue('--color-base-content').trim()
      || (mode === 'dark' ? '#e5e7eb' : '#1f2937')
    const border = rootStyle.getPropertyValue('--color-base-300').trim()
      || (mode === 'dark' ? '#374151' : '#e5e7eb')
    return {
      ...options,
      theme: { ...options.theme, mode },
      chart: { ...options.chart, background: 'transparent', foreColor: foreground },
      ...(options.plotOptions?.bar?.dataLabels?.total ? {
        plotOptions: {
          ...options.plotOptions,
          bar: {
            ...options.plotOptions.bar,
            dataLabels: {
              ...options.plotOptions.bar.dataLabels,
              total: {
                ...options.plotOptions.bar.dataLabels.total,
                style: { ...options.plotOptions.bar.dataLabels.total.style, color: foreground }
              }
            }
          }
        }
      } : {}),
      grid: { ...options.grid, borderColor: border },
      tooltip: { ...options.tooltip, theme: mode },
      legend: { ...options.legend, labels: { ...options.legend?.labels, colors: foreground } },
      noData: { ...options.noData, style: { ...options.noData?.style, color: foreground } }
    }
  })
}
