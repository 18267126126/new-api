/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { dataScheme as vchartDefaultDataScheme } from '@visactor/vchart/esm/theme/color-scheme/builtin/default'
import { formatChartTime, type TimeGranularity } from '@/lib/time'
import { MAX_CHART_TREND_POINTS } from '@/features/dashboard/constants'
import type {
  ProcessedTokenConsumptionChartData,
  QuotaDataItem,
  TokenUsageDataItem,
} from '@/features/dashboard/types'

type TFunction = (key: string) => string

const THEME_CHART_COLOR_VARIABLES = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
] as const

function getThemeChartColors(themeKey?: string): string[] {
  if (typeof document === 'undefined') return []
  void themeKey

  const bodyStyle = window.getComputedStyle(document.body)
  const rootStyle = window.getComputedStyle(document.documentElement)

  return THEME_CHART_COLOR_VARIABLES.map((name) => {
    return (
      bodyStyle.getPropertyValue(name) || rootStyle.getPropertyValue(name)
    ).trim()
  }).filter(Boolean)
}

function getVChartDefaultColors(domainLength: number, themeKey?: string) {
  const themeColors = getThemeChartColors(themeKey)
  if (themeColors.length > 0) {
    return Array.from(
      { length: Math.max(domainLength, themeColors.length) },
      (_, index) => themeColors[index % themeColors.length]
    )
  }

  const scheme =
    vchartDefaultDataScheme.find(
      (item) => !item.maxDomainLength || domainLength <= item.maxDomainLength
    ) ?? vchartDefaultDataScheme[vchartDefaultDataScheme.length - 1]

  return scheme.scheme
}

function normalizeTokenSeriesData(
  modelData: QuotaDataItem[],
  tokenData: TokenUsageDataItem[],
  dimension: 'token' | 'model'
): Array<{ series: string; created_at: number; token_used: number }> {
  if (dimension === 'model') {
    return modelData.map((item) => ({
      series: item.model_name || 'Unknown',
      created_at: Number(item.created_at) || 0,
      token_used: Number(item.token_used) || 0,
    }))
  }
  return tokenData.map((item) => ({
    series: item.token_name || 'Unknown',
    created_at: Number(item.created_at) || 0,
    token_used: Number(item.token_used) || 0,
  }))
}

export function processTokenConsumptionChartData(
  modelData: QuotaDataItem[],
  tokenData: TokenUsageDataItem[],
  dimension: 'token' | 'model',
  timeGranularity: TimeGranularity = 'day',
  t?: TFunction,
  themeKey?: string,
  chartCornerRadius?: number
): ProcessedTokenConsumptionChartData {
  const tt: TFunction = t ?? ((x) => x)
  const otherLabel = tt('Other')
  const formatInt = (value: number) =>
    Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)

  const rows = normalizeTokenSeriesData(modelData, tokenData, dimension)

  if (rows.length === 0) {
    return {
      spec_trend: {
        type: 'area',
        data: [{ id: 'tokenTrendData', values: [] }],
        xField: 'Time',
        yField: 'Tokens',
        seriesField: 'Series',
        title: {
          visible: true,
          text: tt('Token Consumption Trend'),
          subtext: tt('No data available'),
        },
      },
      spec_pie: {
        type: 'pie',
        data: [{ id: 'tokenPieData', values: [] }],
        outerRadius: 0.8,
        innerRadius: 0.5,
        valueField: 'value',
        categoryField: 'type',
        title: {
          visible: true,
          text: tt('Token Consumption Distribution'),
          subtext: tt('No data available'),
        },
      },
      spec_rank: {
        type: 'bar',
        data: [{ id: 'tokenRankData', values: [] }],
        xField: 'Series',
        yField: 'Tokens',
        seriesField: 'Series',
        title: {
          visible: true,
          text: tt('Token Consumption Ranking'),
          subtext: tt('No data available'),
        },
      },
      totalTokensDisplay: formatInt(0),
    }
  }

  const timeSeriesMap = new Map<
    string,
    Map<string, { tokens: number; timeSum: number }>
  >()
  const seriesTotalsMap = new Map<string, number>()

  rows.forEach((row) => {
    const timeKey = formatChartTime(row.created_at, timeGranularity)
    const series = row.series
    const tokens = Number(row.token_used) || 0

    if (!timeSeriesMap.has(timeKey)) {
      timeSeriesMap.set(timeKey, new Map())
    }
    const bucket = timeSeriesMap.get(timeKey)!
    bucket.set(series, (bucket.get(series) || 0) + tokens)
    seriesTotalsMap.set(series, (seriesTotalsMap.get(series) || 0) + tokens)
  })

  const allSeries = Array.from(seriesTotalsMap.keys()).sort()
  const sortedTimes = Array.from(timeSeriesMap.keys()).sort()
  const seriesColorDomain = Array.from(new Set([...allSeries, otherLabel]))
  const seriesColorRange = getVChartDefaultColors(
    seriesColorDomain.length,
    themeKey
  )
  const seriesColor = {
    type: 'ordinal',
    domain: seriesColorDomain,
    range: seriesColorRange,
  }

  const MAX_TREND_POINTS = MAX_CHART_TREND_POINTS
  const fillTimePoints = (times: string[]) => {
    if (times.length >= MAX_TREND_POINTS) return times
    const lastTime = Math.max(...rows.map((row) => row.created_at || 0))
    const intervalSec =
      timeGranularity === 'week'
        ? 604800
        : timeGranularity === 'day'
          ? 86400
          : 3600
    return Array.from({ length: MAX_TREND_POINTS }, (_, i) =>
      formatChartTime(
        lastTime - (MAX_TREND_POINTS - 1 - i) * intervalSec,
        timeGranularity
      )
    )
  }
  const chartTimes = fillTimePoints(sortedTimes)

  const MAX_TREND_SERIES = 20
  const rankedSeries = Array.from(seriesTotalsMap.entries())
    .map(([series, tokens]) => ({ Series: series, Tokens: tokens }))
    .sort((a, b) => b.Tokens - a.Tokens)
  const topTrendSeries = rankedSeries
    .slice(0, MAX_TREND_SERIES)
    .map((item) => item.Series)
  const otherTrendSeries = rankedSeries
    .slice(MAX_TREND_SERIES)
    .map((item) => item.Series)

  const trendValues: Array<{
    Time: string
    Series: string
    Tokens: number
    TimeSum: number
  }> = []

  chartTimes.forEach((time) => {
    const timeData = topTrendSeries.map((series) => ({
      Time: time,
      Series: series,
      Tokens: timeSeriesMap.get(time)?.get(series) || 0,
      TimeSum: 0,
    }))

    if (otherTrendSeries.length > 0) {
      const otherTokens = otherTrendSeries.reduce(
        (sum, series) => sum + (timeSeriesMap.get(time)?.get(series) || 0),
        0
      )
      timeData.push({
        Time: time,
        Series: otherLabel,
        Tokens: otherTokens,
        TimeSum: 0,
      })
    }

    const timeSum = timeData.reduce((sum, item) => sum + item.Tokens, 0)
    trendValues.push(...timeData.map((item) => ({ ...item, TimeSum: timeSum })))
  })
  trendValues.sort((a, b) => a.Time.localeCompare(b.Time))

  const pieValues = rankedSeries.map((item) => ({
    type: item.Series,
    value: item.Tokens,
  }))

  const MAX_RANK_SERIES = 20
  let rankValues = rankedSeries
  if (rankValues.length > MAX_RANK_SERIES) {
    const top = rankValues.slice(0, MAX_RANK_SERIES)
    const otherTokens = rankValues
      .slice(MAX_RANK_SERIES)
      .reduce((sum, item) => sum + item.Tokens, 0)
    rankValues = [...top, { Series: otherLabel, Tokens: otherTokens }]
  }

  const totalTokens = rankedSeries.reduce((sum, item) => sum + item.Tokens, 0)

  const isOtherKey = (key: string) => key === 'Other' || key === otherLabel

  return {
    spec_trend: {
      type: 'area',
      data: [{ id: 'tokenTrendData', values: trendValues }],
      xField: 'Time',
      yField: 'Tokens',
      seriesField: 'Series',
      stack: false,
      legends: { visible: true, selectMode: 'single' },
      color: seriesColor,
      title: {
        visible: true,
        text: tt('Token Consumption Trend'),
      },
      tooltip: {
        mark: {
          content: [
            {
              key: (datum: Record<string, unknown>) => datum?.Series,
              value: (datum: Record<string, unknown>) =>
                formatInt(Number(datum?.Tokens) || 0),
            },
          ],
        },
        dimension: {
          content: [
            {
              key: (datum: Record<string, unknown>) => datum?.Series,
              value: (datum: Record<string, unknown>) =>
                Number(datum?.Tokens) || 0,
            },
          ],
          updateContent: (
            array: Array<{ key: string; value: string | number }>
          ) => {
            const items = array.filter((item) => !isOtherKey(item.key))
            const otherItems = array.filter((item) => isOtherKey(item.key))
            items.sort(
              (a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)
            )
            array = [...items, ...otherItems]
            let sum = 0
            for (let i = 0; i < array.length; i++) {
              const v = Number(array[i].value) || 0
              sum += v
              array[i].value = formatInt(v)
            }
            array.unshift({ key: tt('Total:'), value: formatInt(sum) })
            return array
          },
        },
      },
      area: {
        style: {
          fillOpacity: 0.08,
          curveType: 'monotone',
        },
      },
      line: {
        style: {
          lineWidth: 2,
          curveType: 'monotone',
        },
      },
      point: { visible: false },
      background: { fill: 'transparent' },
      animation: true,
    },
    spec_pie: {
      type: 'pie',
      data: [{ id: 'tokenPieData', values: pieValues }],
      outerRadius: 0.8,
      innerRadius: 0.5,
      padAngle: 0.6,
      valueField: 'value',
      categoryField: 'type',
      pie: {
        style:
          chartCornerRadius == null ? {} : { cornerRadius: chartCornerRadius },
      },
      title: {
        visible: true,
        text: tt('Token Consumption Distribution'),
      },
      legends: { visible: true, orient: 'left' },
      label: { visible: true },
      color: seriesColor,
      tooltip: {
        mark: {
          content: [
            {
              key: (datum: Record<string, unknown>) => datum?.type,
              value: (datum: Record<string, unknown>) =>
                formatInt(Number(datum?.value) || 0),
            },
          ],
        },
      },
      background: { fill: 'transparent' },
      animation: true,
    },
    spec_rank: {
      type: 'bar',
      data: [{ id: 'tokenRankData', values: rankValues }],
      xField: 'Series',
      yField: 'Tokens',
      seriesField: 'Series',
      legends: { visible: true, selectMode: 'single' },
      color: seriesColor,
      title: {
        visible: true,
        text: tt('Token Consumption Ranking'),
      },
      bar: {
        state: {
          hover: { stroke: '#000', lineWidth: 1 },
        },
      },
      tooltip: {
        mark: {
          content: [
            {
              key: (datum: Record<string, unknown>) => datum?.Series,
              value: (datum: Record<string, unknown>) =>
                formatInt(Number(datum?.Tokens) || 0),
            },
          ],
        },
      },
      background: { fill: 'transparent' },
      animation: true,
    },
    totalTokensDisplay: formatInt(totalTokens),
  }
}
