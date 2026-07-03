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
import { useEffect, useMemo, useRef, useState } from 'react'
import { VChart } from '@visactor/react-vchart'
import { Coins } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useThemeRadiusPx } from '@/lib/theme-radius'
import { type TimeGranularity } from '@/lib/time'
import { VCHART_OPTION } from '@/lib/vchart'
import { useThemeCustomization } from '@/context/theme-customization-provider'
import { useTheme } from '@/context/theme-provider'
import {
  DEFAULT_TIME_GRANULARITY,
  TOKEN_CONSUMPTION_DIMENSION_OPTIONS,
} from '@/features/dashboard/constants'
import { processTokenConsumptionChartData } from '@/features/dashboard/lib'
import type {
  DashboardFilters,
  QuotaDataItem,
  TokenConsumptionChartTab,
  TokenConsumptionDimensionTab,
  TokenUsageDataItem,
} from '@/features/dashboard/types'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

type ChartSpecKey = 'spec_trend' | 'spec_pie' | 'spec_rank'

const CHART_SPEC_KEYS: Record<TokenConsumptionChartTab, ChartSpecKey> = {
  trend: 'spec_trend',
  proportion: 'spec_pie',
  top: 'spec_rank',
}

interface TokenConsumptionChartProps {
  modelData: QuotaDataItem[]
  tokenData: TokenUsageDataItem[]
  modelLoading?: boolean
  tokenLoading?: boolean
  filters?: DashboardFilters
  timeGranularity?: TimeGranularity
  defaultDimension?: TokenConsumptionDimensionTab
  defaultChartTab?: TokenConsumptionChartTab
}

export function TokenConsumptionChart(props: TokenConsumptionChartProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { customization } = useThemeCustomization()
  const chartRadius = useThemeRadiusPx(
    '--radius-md',
    `${customization.preset}:${customization.radius}`
  )
  const [dimension, setDimension] = useState<TokenConsumptionDimensionTab>(
    props.defaultDimension ?? 'token'
  )
  const [themeReady, setThemeReady] = useState(false)
  const themeManagerRef = useRef<
    (typeof import('@visactor/vchart'))['ThemeManager'] | null
  >(null)
  const timeGranularity = props.timeGranularity ?? DEFAULT_TIME_GRANULARITY
  const chartTab = props.defaultChartTab ?? 'trend'

  useEffect(() => {
    if (props.defaultDimension) setDimension(props.defaultDimension)
  }, [props.defaultDimension])

  useEffect(() => {
    const updateTheme = async () => {
      setThemeReady(false)

      if (!themeManagerPromise) {
        themeManagerPromise = import('@visactor/vchart').then(
          (m) => m.ThemeManager
        )
      }

      const ThemeManager = await themeManagerPromise
      themeManagerRef.current = ThemeManager
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setThemeReady(true)
    }

    updateTheme()
  }, [resolvedTheme])

  const isLoading =
    dimension === 'token'
      ? Boolean(props.tokenLoading)
      : Boolean(props.modelLoading)

  const chartData = useMemo(
    () =>
      processTokenConsumptionChartData(
        isLoading && dimension === 'model' ? [] : props.modelData,
        isLoading && dimension === 'token' ? [] : props.tokenData,
        dimension,
        timeGranularity,
        t,
        customization.preset,
        chartRadius
      ),
    [
      props.modelData,
      props.tokenData,
      dimension,
      isLoading,
      timeGranularity,
      t,
      customization.preset,
      chartRadius,
    ]
  )

  const spec = chartData[CHART_SPEC_KEYS[chartTab]]
  const specType = typeof spec?.type === 'string' ? spec.type : chartTab
  const chartKey = [
    dimension,
    chartTab,
    specType,
    isLoading ? 'loading' : 'ready',
    props.modelData.length,
    props.tokenData.length,
    resolvedTheme,
    customization.preset,
  ].join('-')

  return (
    <div className='overflow-hidden rounded-lg border'>
      <div className='flex w-full flex-col gap-1.5 border-b px-3 py-2 sm:gap-3 sm:px-5 sm:py-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex items-center gap-2'>
          <Coins className='text-muted-foreground/60 size-4' />
          <div className='text-sm font-semibold'>{t('Token Consumption')}</div>
          <span className='text-muted-foreground text-xs'>
            {t('Total:')} {chartData.totalTokensDisplay}
          </span>
        </div>

        <div className='bg-muted/60 inline-flex h-7 w-full overflow-x-auto rounded-lg border p-0.5 sm:h-8 sm:w-auto'>
          {TOKEN_CONSUMPTION_DIMENSION_OPTIONS.map((tab) => (
            <button
              key={tab.value}
              type='button'
              onClick={() => setDimension(tab.value)}
              className={`inline-flex shrink-0 items-center rounded-md px-3 text-xs font-medium transition-colors ${
                dimension === tab.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className='h-[300px] p-1.5 sm:h-96 sm:p-2'>
        {themeReady && spec && (
          <VChart
            key={chartKey}
            spec={{
              ...spec,
              theme: resolvedTheme === 'dark' ? 'dark' : 'light',
              background: 'transparent',
            }}
            option={VCHART_OPTION}
          />
        )}
      </div>
    </div>
  )
}
