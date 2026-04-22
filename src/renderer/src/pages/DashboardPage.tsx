import { useState, useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { ChartConfig } from '../components/ChartPanel'

interface DashboardPanel {
  id: number
  query_name: string
  position: number
}

interface SavedQuery {
  id: number
  name: string
  sql: string
  chartConfig: ChartConfig | null
}

interface PanelData {
  rows: Record<string, unknown>[]
  columns: string[]
  loading: boolean
  error: string | null
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

function PanelChart({
  rows,
  config
}: {
  rows: Record<string, unknown>[]
  config: ChartConfig
}): JSX.Element {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

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

  useEffect(() => {
    if (!instanceRef.current) return
    const option = buildChartOption(rows, config)
    if (option) instanceRef.current.setOption(option, true)
    else instanceRef.current.clear()
  }, [rows, config])

  return (
    <div
      ref={chartRef}
      style={{ width: '100%', height: 260, borderRadius: 6, overflow: 'hidden' }}
    />
  )
}

function PanelTable({
  rows,
  columns
}: {
  rows: Record<string, unknown>[]
  columns: string[]
}): JSX.Element {
  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 260 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  padding: '6px 10px',
                  background: '#0d1117',
                  borderBottom: '1px solid var(--border)',
                  textAlign: 'left',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  color: 'var(--text)',
                  position: 'sticky',
                  top: 0,
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td
                  key={col}
                  style={{
                    padding: '5px 10px',
                    borderBottom: '1px solid #1e1e3a',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {String(row[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div
          style={{
            padding: '20px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 12,
          }}
        >
          No rows returned
        </div>
      )}
    </div>
  )
}

function DashboardPage(): JSX.Element {
  const [panels, setPanels] = useState<DashboardPanel[]>([])
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [panelData, setPanelData] = useState<Map<string, PanelData>>(new Map())
  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard(): Promise<void> {
    setPageLoading(true)
    const [panelsRes, queriesRes] = await Promise.all([
      window.api.getDashboardPanels(),
      window.api.listSavedQueries(),
    ])

    const loadedPanels: DashboardPanel[] = panelsRes.success ? (panelsRes.panels ?? []) : []
    const loadedQueries: SavedQuery[] = queriesRes.success ? (queriesRes.queries ?? []) : []

    setPanels(loadedPanels)
    setSavedQueries(loadedQueries)
    setPageLoading(false)

    const queryMap = new Map(loadedQueries.map((q) => [q.name, q]))
    const uniqueNames = [...new Set(loadedPanels.map((p) => p.query_name))]
    await Promise.all(uniqueNames.map((name) => runPanelQuery(name, queryMap)))
  }

  async function runPanelQuery(
    queryName: string,
    queryMap: Map<string, SavedQuery>
  ): Promise<void> {
    const query = queryMap.get(queryName)
    if (!query) {
      setPanelData((prev) =>
        new Map(prev).set(queryName, {
          rows: [],
          columns: [],
          loading: false,
          error: 'Saved query not found',
        })
      )
      return
    }
    setPanelData((prev) =>
      new Map(prev).set(queryName, { rows: [], columns: [], loading: true, error: null })
    )
    const res = await window.api.runSqlQuery(query.sql)
    if (res.success) {
      const rows = res.rows ?? []
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []
      setPanelData((prev) =>
        new Map(prev).set(queryName, { rows, columns, loading: false, error: null })
      )
    } else {
      setPanelData((prev) =>
        new Map(prev).set(queryName, {
          rows: [],
          columns: [],
          loading: false,
          error: res.reason ?? 'Query error',
        })
      )
    }
  }

  async function handleAddPanel(queryName: string): Promise<void> {
    const res = await window.api.addDashboardPanel(queryName)
    if (!res.success) return
    setAddPanelOpen(false)
    const panelsRes = await window.api.getDashboardPanels()
    if (panelsRes.success) {
      setPanels(panelsRes.panels ?? [])
      // Run query if not already loaded
      const existing = panelData.get(queryName)
      if (!existing || existing.error) {
        const queryMap = new Map(savedQueries.map((q) => [q.name, q]))
        runPanelQuery(queryName, queryMap)
      }
    }
  }

  async function handleRemovePanel(panelId: number): Promise<void> {
    await window.api.removeDashboardPanel(panelId)
    setPanels((prev) => prev.filter((p) => p.id !== panelId))
  }

  const queryMap = new Map(savedQueries.map((q) => [q.name, q]))

  // Queries not yet on dashboard
  const panelQueryNames = new Set(panels.map((p) => p.query_name))
  const availableToAdd = savedQueries.filter((q) => !panelQueryNames.has(q.name))

  if (pageLoading) {
    return (
      <div>
        <h1 className="page-title">Dashboard</h1>
        <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          Dashboard
        </h1>
        <button
          onClick={() => setAddPanelOpen(true)}
          disabled={savedQueries.length === 0}
          style={{
            padding: '8px 18px',
            background: savedQueries.length === 0 ? '#333' : 'var(--accent)',
            color: savedQueries.length === 0 ? 'var(--text-muted)' : '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            cursor: savedQueries.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          + Add Panel
        </button>
      </div>

      {/* Empty state */}
      {panels.length === 0 && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 40 }}>📊</div>
          <div style={{ fontSize: 15 }}>No panels yet</div>
          <div style={{ fontSize: 13 }}>
            {savedQueries.length === 0
              ? 'Save some queries first, then add them here.'
              : 'Click "Add Panel" to add a saved query.'}
          </div>
        </div>
      )}

      {/* 2-column grid */}
      {panels.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 20,
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {panels.map((panel) => {
            const data = panelData.get(panel.query_name)
            const savedQuery = queryMap.get(panel.query_name)
            const hasChartConfig =
              savedQuery?.chartConfig?.xColumn && savedQuery?.chartConfig?.yColumn
            const showChart = hasChartConfig && data && !data.loading && !data.error

            return (
              <div
                key={panel.id}
                style={{
                  background: 'var(--sidebar-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Panel header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--border)',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                    {panel.query_name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {hasChartConfig && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {savedQuery!.chartConfig!.chartType}
                      </span>
                    )}
                    <button
                      onClick={() => handleRemovePanel(panel.id)}
                      title="Remove panel"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: 16,
                        lineHeight: 1,
                        padding: '2px 4px',
                        borderRadius: 4,
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLButtonElement).style.color = '#ff6b6b')
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)')
                      }
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Panel content */}
                <div style={{ padding: 14, flex: 1, minHeight: 0 }}>
                  {!data || data.loading ? (
                    <div
                      style={{
                        height: 260,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)',
                        fontSize: 13,
                      }}
                    >
                      Loading…
                    </div>
                  ) : data.error ? (
                    <div
                      style={{
                        height: 260,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ff6b6b',
                        fontSize: 13,
                        textAlign: 'center',
                        padding: 16,
                      }}
                    >
                      {data.error}
                    </div>
                  ) : showChart ? (
                    <PanelChart rows={data.rows} config={savedQuery!.chartConfig!} />
                  ) : (
                    <PanelTable rows={data.rows} columns={data.columns} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Panel Modal */}
      {addPanelOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setAddPanelOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--sidebar-bg)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 24,
              width: 360,
              maxHeight: 480,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>Add Panel</div>
            {availableToAdd.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                All saved queries are already on the dashboard.
              </div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {availableToAdd.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => handleAddPanel(q.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text)',
                      padding: '10px 14px',
                      cursor: 'pointer',
                      fontSize: 13,
                      marginBottom: 8,
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLButtonElement).style.background = 'none')
                    }
                  >
                    <span>{q.name}</span>
                    {q.chartConfig?.xColumn && q.chartConfig?.yColumn && (
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          background: '#1a1a2e',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        {q.chartConfig.chartType}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setAddPanelOpen(false)}
              style={{
                marginTop: 16,
                padding: '7px 16px',
                background: 'none',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer',
                alignSelf: 'flex-end',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DashboardPage
