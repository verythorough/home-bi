import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export type ChartType = 'bar' | 'line' | 'pie' | 'area'

export interface ChartConfig {
  chartType: ChartType
  xColumn: string
  yColumn: string
  seriesColumn: string
}

interface ChartPanelProps {
  rows: Record<string, unknown>[]
  columns: string[]
  config: ChartConfig
  onConfigChange: (config: ChartConfig) => void
}

function buildChartOption(
  rows: Record<string, unknown>[],
  config: ChartConfig
): echarts.EChartsOption | null {
  const { chartType, xColumn, yColumn, seriesColumn } = config
  if (!xColumn || !yColumn || rows.length === 0) return null

  const tooltip: echarts.TooltipComponentOption = {
    trigger: chartType === 'pie' ? 'item' : 'axis'
  }

  if (chartType === 'pie') {
    return {
      tooltip,
      legend: { show: true },
      series: [
        {
          type: 'pie',
          radius: '60%',
          data: rows.map((r) => ({
            name: String(r[xColumn] ?? ''),
            value: Number(r[yColumn]) || 0
          }))
        }
      ]
    }
  }

  const ecType = chartType === 'area' ? 'line' : chartType
  const areaStyle = chartType === 'area' ? {} : undefined

  if (seriesColumn) {
    const seriesNames = [...new Set(rows.map((r) => String(r[seriesColumn] ?? '')))]
    const xValues = [...new Set(rows.map((r) => String(r[xColumn] ?? '')))]
    return {
      tooltip,
      legend: { show: true },
      xAxis: { type: 'category', data: xValues },
      yAxis: { type: 'value' },
      series: seriesNames.map((sName) => ({
        name: sName,
        type: ecType as 'bar' | 'line',
        areaStyle,
        data: xValues.map((xVal) => {
          const row = rows.find(
            (r) => String(r[xColumn]) === xVal && String(r[seriesColumn]) === sName
          )
          return row ? Number(row[yColumn]) || 0 : 0
        })
      }))
    }
  }

  return {
    tooltip,
    xAxis: { type: 'category', data: rows.map((r) => String(r[xColumn] ?? '')) },
    yAxis: { type: 'value' },
    series: [
      {
        type: ecType as 'bar' | 'line',
        areaStyle,
        data: rows.map((r) => Number(r[yColumn]) || 0)
      }
    ]
  }
}

const selectStyle: React.CSSProperties = {
  background: '#0d1117',
  color: '#e0e0e0',
  border: '1px solid #2a2a4a',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 13,
  cursor: 'pointer'
}

export default function ChartPanel({
  rows,
  columns,
  config,
  onConfigChange
}: ChartPanelProps): JSX.Element {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  // Initialize ECharts instance
  useEffect(() => {
    if (!chartRef.current) return
    instanceRef.current = echarts.init(chartRef.current, 'dark')
    const handleResize = (): void => instanceRef.current?.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      instanceRef.current?.dispose()
      instanceRef.current = null
    }
  }, [])

  // Update chart when data or config changes
  useEffect(() => {
    if (!instanceRef.current) return
    const option = buildChartOption(rows, config)
    if (option) {
      instanceRef.current.setOption(option, true)
    } else {
      instanceRef.current.clear()
    }
  }, [rows, config])

  function update(partial: Partial<ChartConfig>): void {
    onConfigChange({ ...config, ...partial })
  }

  const hasData = rows.length > 0 && columns.length > 0
  const canRender = config.xColumn && config.yColumn

  return (
    <div>
      {/* Chart config controls */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 16,
          padding: '12px 16px',
          background: '#16213e',
          borderRadius: 8,
          border: '1px solid #2a2a4a'
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ color: '#8888a0' }}>Chart type</span>
          <select
            value={config.chartType}
            onChange={(e) => update({ chartType: e.target.value as ChartType })}
            style={selectStyle}
          >
            <option value="bar">Bar</option>
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="pie">Pie</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ color: '#8888a0' }}>
            {config.chartType === 'pie' ? 'Label' : 'X axis'}
          </span>
          <select
            value={config.xColumn}
            onChange={(e) => update({ xColumn: e.target.value })}
            style={selectStyle}
            disabled={!hasData}
          >
            <option value="">— select —</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ color: '#8888a0' }}>
            {config.chartType === 'pie' ? 'Value' : 'Y axis'}
          </span>
          <select
            value={config.yColumn}
            onChange={(e) => update({ yColumn: e.target.value })}
            style={selectStyle}
            disabled={!hasData}
          >
            <option value="">— select —</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        {config.chartType !== 'pie' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span style={{ color: '#8888a0' }}>Series</span>
            <select
              value={config.seriesColumn}
              onChange={(e) => update({ seriesColumn: e.target.value })}
              style={selectStyle}
              disabled={!hasData}
            >
              <option value="">— none —</option>
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Chart area */}
      <div style={{ position: 'relative' }}>
        <div
          ref={chartRef}
          style={{ width: '100%', height: 400, borderRadius: 8, overflow: 'hidden' }}
        />
        {!canRender && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8888a0',
              fontSize: 14,
              background: '#16213e',
              borderRadius: 8,
              border: '1px solid #2a2a4a'
            }}
          >
            {!hasData
              ? 'Run a query to see chart options'
              : 'Select X and Y columns to render chart'}
          </div>
        )}
      </div>
    </div>
  )
}
