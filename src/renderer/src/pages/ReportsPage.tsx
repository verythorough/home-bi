import { useState, useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { ChartConfig } from '../components/ChartPanel'

interface Report {
  id: number
  name: string
  created_at: string
}

interface ReportPanel {
  id: number
  query_name: string
  position: number
  view_mode: 'auto' | 'table' | 'chart'
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
    trigger: chartType === 'pie' ? 'item' : 'axis',
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
            value: Number(r[yColumn]) || 0,
          })),
        },
      ],
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
        }),
      })),
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
        data: rows.map((r) => Number(r[yColumn]) || 0),
      },
    ],
  }
}

function PanelChart({
  rows,
  config,
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
  columns,
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

function ReportsPage(): JSX.Element {
  const [reports, setReports] = useState<Report[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [panels, setPanels] = useState<ReportPanel[]>([])
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [panelData, setPanelData] = useState<Map<number, PanelData>>(new Map())
  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll(): Promise<void> {
    const [rRes, qRes] = await Promise.all([
      window.api.listReports(),
      window.api.listSavedQueries(),
    ])
    const queries: SavedQuery[] = qRes.success && qRes.queries ? qRes.queries : []
    const loaded: Report[] = rRes.success && rRes.reports ? rRes.reports : []
    setSavedQueries(queries)
    setReports(loaded)
    if (loaded.length > 0) {
      const id = loaded[0].id
      setSelectedId(id)
      await fetchPanels(id, queries)
    }
  }

  async function selectReport(id: number): Promise<void> {
    setSelectedId(id)
    setPanels([])
    setPanelData(new Map())
    const [pRes, qRes] = await Promise.all([
      window.api.getReportPanels(id),
      window.api.listSavedQueries(),
    ])
    const queries: SavedQuery[] = qRes.success && qRes.queries ? qRes.queries : []
    setSavedQueries(queries)
    if (pRes.success && pRes.panels) {
      setPanels(pRes.panels)
      const qMap = new Map(queries.map((q) => [q.name, q]))
      await Promise.all(pRes.panels.map((p) => runPanelQuery(p.id, p.query_name, qMap)))
    }
  }

  async function fetchPanels(reportId: number, queries: SavedQuery[]): Promise<void> {
    const res = await window.api.getReportPanels(reportId)
    if (!res.success || !res.panels) return
    setPanels(res.panels)
    const qMap = new Map(queries.map((q) => [q.name, q]))
    await Promise.all(res.panels.map((p) => runPanelQuery(p.id, p.query_name, qMap)))
  }

  async function runPanelQuery(
    panelId: number,
    queryName: string,
    queryMap: Map<string, SavedQuery>
  ): Promise<void> {
    const query = queryMap.get(queryName)
    if (!query) {
      setPanelData((prev) =>
        new Map(prev).set(panelId, { rows: [], columns: [], loading: false, error: 'Query not found' })
      )
      return
    }
    setPanelData((prev) =>
      new Map(prev).set(panelId, { rows: [], columns: [], loading: true, error: null })
    )
    const res = await window.api.runSqlQuery(query.sql)
    if (res.success) {
      const rows = res.rows ?? []
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []
      setPanelData((prev) =>
        new Map(prev).set(panelId, { rows, columns, loading: false, error: null })
      )
    } else {
      setPanelData((prev) =>
        new Map(prev).set(panelId, {
          rows: [],
          columns: [],
          loading: false,
          error: res.reason ?? 'Query error',
        })
      )
    }
  }

  async function handleCreateReport(): Promise<void> {
    const name = newName.trim()
    if (!name) return
    const res = await window.api.createReport(name)
    if (res.success && res.id) {
      setCreating(false)
      setNewName('')
      const rRes = await window.api.listReports()
      if (rRes.success && rRes.reports) setReports(rRes.reports)
      setSelectedId(res.id)
      setPanels([])
      setPanelData(new Map())
    }
  }

  async function handleRenameReport(): Promise<void> {
    if (renamingId === null || !renameValue.trim()) return
    await window.api.renameReport(renamingId, renameValue.trim())
    setRenamingId(null)
    setRenameValue('')
    const rRes = await window.api.listReports()
    if (rRes.success && rRes.reports) setReports(rRes.reports)
  }

  async function handleDeleteReport(id: number): Promise<void> {
    await window.api.deleteReport(id)
    const updated = reports.filter((r) => r.id !== id)
    setReports(updated)
    if (selectedId === id) {
      if (updated.length > 0) {
        selectReport(updated[0].id)
      } else {
        setSelectedId(null)
        setPanels([])
        setPanelData(new Map())
      }
    }
  }

  async function handleAddPanel(queryName: string): Promise<void> {
    if (selectedId === null) return
    const res = await window.api.addReportPanel(selectedId, queryName)
    if (!res.success) return
    setAddPanelOpen(false)
    await selectReport(selectedId)
  }

  async function handleRemovePanel(panelId: number): Promise<void> {
    await window.api.removeDashboardPanel(panelId)
    setPanels((prev) => prev.filter((p) => p.id !== panelId))
    setPanelData((prev) => {
      const m = new Map(prev)
      m.delete(panelId)
      return m
    })
  }

  async function handleSetViewMode(
    panelId: number,
    viewMode: 'table' | 'chart'
  ): Promise<void> {
    await window.api.updatePanelViewMode(panelId, viewMode)
    setPanels((prev) => prev.map((p) => (p.id === panelId ? { ...p, view_mode: viewMode } : p)))
  }

  const selectedReport = reports.find((r) => r.id === selectedId) ?? null
  const queryMap = new Map(savedQueries.map((q) => [q.name, q]))
  const panelQueryNames = new Set(panels.map((p) => p.query_name))
  const availableToAdd = savedQueries.filter((q) => !panelQueryNames.has(q.name))

  const sidebarStyle: React.CSSProperties = {
    width: 200,
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    paddingRight: 0,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0, overflow: 'hidden', margin: -32 }}>
      {/* Reports list sidebar */}
      <div className="reports-sidebar" style={sidebarStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '32px 12px 12px 16px',
            flexShrink: 0,
          }}
        >
          <span style={labelStyle}>Reports</span>
          <button
            onClick={() => {
              setCreating(true)
              setNewName('')
            }}
            title="New report"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: '2px 7px',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.color = '#fff'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
            }}
          >
            +
          </button>
        </div>

        {/* New report input */}
        {creating && (
          <div style={{ padding: '0 8px 10px 8px', flexShrink: 0 }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateReport()
                if (e.key === 'Escape') setCreating(false)
              }}
              placeholder="Report name…"
              style={{
                width: '100%',
                background: '#0d1117',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '5px 8px',
                fontSize: 13,
              }}
            />
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {reports.length === 0 && !creating && (
            <div
              style={{ color: 'var(--text-muted)', fontSize: 12, padding: '0 16px' }}
            >
              No reports yet
            </div>
          )}
          {reports.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                background: selectedId === r.id ? 'var(--accent)' : 'none',
                borderRadius: 4,
                margin: '1px 4px',
              }}
              onMouseEnter={(e) => {
                if (selectedId !== r.id)
                  (e.currentTarget as HTMLElement).style.background = 'rgba(15,52,96,0.5)'
              }}
              onMouseLeave={(e) => {
                if (selectedId !== r.id)
                  (e.currentTarget as HTMLElement).style.background = 'none'
              }}
            >
              {renamingId === r.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameReport()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={handleRenameReport}
                  style={{
                    flex: 1,
                    background: '#0d1117',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '4px 6px',
                    fontSize: 13,
                    margin: '2px',
                  }}
                />
              ) : (
                <button
                  onClick={() => selectReport(r.id)}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: selectedId === r.id ? '#fff' : 'var(--text)',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.name}
                </button>
              )}
              <div
                className="report-item-actions"
                style={{
                  display: 'flex',
                  gap: 2,
                  paddingRight: 4,
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={() => {
                    setRenamingId(r.id)
                    setRenameValue(r.name)
                  }}
                  title="Rename"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: '2px 4px',
                    borderRadius: 3,
                    lineHeight: 1,
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = '#fff')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')
                  }
                >
                  ✎
                </button>
                <button
                  onClick={() => handleDeleteReport(r.id)}
                  title="Delete report"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: '2px 4px',
                    borderRadius: 3,
                    lineHeight: 1,
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = '#ff6b6b')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')
                  }
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Report content */}
      <div
        className="report-content"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 32 }}
      >
        {!selectedReport ? (
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
            <div style={{ fontSize: 40 }}>📋</div>
            <div style={{ fontSize: 15 }}>No reports yet</div>
            <div style={{ fontSize: 13 }}>Click + to create your first report.</div>
          </div>
        ) : (
          <>
            {/* Report header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 24,
                flexShrink: 0,
              }}
            >
              <h1 className="page-title" style={{ marginBottom: 0 }}>
                {selectedReport.name}
              </h1>
              <div
                className="report-header-actions"
                style={{ display: 'flex', gap: 8, alignItems: 'center' }}
              >
                <button
                  onClick={() => window.print()}
                  style={{
                    padding: '7px 16px',
                    background: 'none',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--text)'
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--text-muted)'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                  }}
                >
                  🖨 Print
                </button>
                <button
                  onClick={() => setAddPanelOpen(true)}
                  disabled={savedQueries.length === 0}
                  style={{
                    padding: '7px 18px',
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

            {/* Panel grid */}
            {panels.length > 0 && (
              <div
                className="report-panel-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 20,
                  overflowY: 'auto',
                  flex: 1,
                }}
              >
                {panels.map((panel) => {
                  const data = panelData.get(panel.id)
                  const savedQuery = queryMap.get(panel.query_name)
                  const hasChartConfig =
                    savedQuery?.chartConfig?.xColumn && savedQuery?.chartConfig?.yColumn

                  const effectiveView =
                    panel.view_mode === 'auto'
                      ? hasChartConfig
                        ? 'chart'
                        : 'table'
                      : panel.view_mode

                  const showChart =
                    effectiveView === 'chart' && hasChartConfig && data && !data.loading && !data.error

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
                        breakInside: 'avoid',
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
                        <div
                          className="panel-header-actions"
                          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          {/* View mode toggle */}
                          <div style={{ display: 'flex', gap: 2 }}>
                            {(['table', 'chart'] as const).map((mode) => (
                              <button
                                key={mode}
                                onClick={() => handleSetViewMode(panel.id, mode)}
                                title={`Show as ${mode}`}
                                style={{
                                  padding: '2px 7px',
                                  fontSize: 11,
                                  background: effectiveView === mode ? 'var(--accent)' : 'none',
                                  color:
                                    effectiveView === mode ? '#fff' : 'var(--text-muted)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                }}
                              >
                                {mode === 'table' ? '⊞' : '📈'}
                              </button>
                            ))}
                          </div>
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
                              ((e.currentTarget as HTMLButtonElement).style.color =
                                'var(--text-muted)')
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
          </>
        )}
      </div>

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
                All saved queries are already on this report.
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

export default ReportsPage
