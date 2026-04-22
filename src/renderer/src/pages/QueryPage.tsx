import { useState, useEffect, useCallback, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import ChartPanel, { type ChartConfig } from '../components/ChartPanel'

interface SchemaColumn {
  name: string
  type: string
}

interface SchemaTable {
  name: string
  columns: SchemaColumn[]
}

interface SavedQuery {
  id: number
  name: string
  sql: string
  chartConfig: ChartConfig | null
}

const DEFAULT_CHART_CONFIG: ChartConfig = {
  chartType: 'bar',
  xColumn: '',
  yColumn: '',
  seriesColumn: ''
}

function QueryPage(): JSX.Element {
  const [sql, setSql] = useState('select * from transactions')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [execTime, setExecTime] = useState<number | null>(null)
  const [sorting, setSorting] = useState<SortingState>([])
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [savePromptOpen, setSavePromptOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [view, setView] = useState<'table' | 'chart'>('table')
  const [chartConfig, setChartConfig] = useState<ChartConfig>(DEFAULT_CHART_CONFIG)
  const sqlRef = useRef(sql)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const completionDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const [schema, setSchema] = useState<SchemaTable[]>([])
  const schemaRef = useRef<SchemaTable[]>([])
  const [selectedTable, setSelectedTable] = useState<string | null>(null)

  // Keep ref in sync so keyboard handler always has latest sql
  useEffect(() => {
    sqlRef.current = sql
  }, [sql])

  useEffect(() => {
    loadSavedQueries()
    loadSchema()
  }, [])

  async function loadSchema(): Promise<void> {
    const res = await window.api.getSchema()
    if (res.success && res.schema) {
      setSchema(res.schema)
      schemaRef.current = res.schema
    }
  }

  async function loadSavedQueries(): Promise<void> {
    const res = await window.api.listSavedQueries()
    if (res.success && res.queries) setSavedQueries(res.queries)
  }

  const executeQuery = useCallback(async (query: string): Promise<void> => {
    if (!query.trim()) return
    setRunning(true)
    setError(null)
    const start = performance.now()
    const res = await window.api.runSqlQuery(query)
    const elapsed = performance.now() - start
    setRunning(false)
    setExecTime(elapsed)
    if (!res.success) {
      setError(res.reason ?? 'Unknown error')
      setRows([])
      setColumns([])
    } else {
      const resultRows = res.rows ?? []
      const cols = resultRows.length > 0 ? Object.keys(resultRows[0]) : []
      setRows(resultRows)
      setColumns(cols)
      // Auto-pick columns when chart config is not yet set
      if (cols.length >= 2) {
        setChartConfig((prev) => ({
          ...prev,
          xColumn: prev.xColumn && cols.includes(prev.xColumn) ? prev.xColumn : cols[0],
          yColumn: prev.yColumn && cols.includes(prev.yColumn) ? prev.yColumn : cols[1]
        }))
      }
    }
  }, [])

  const runQuery = useCallback((): Promise<void> => {
    return executeQuery(sqlRef.current)
  }, [executeQuery])

  const SQL_KEYWORDS = [
    'select', 'from', 'where', 'and', 'or', 'not', 'group', 'by', 'order',
    'having', 'limit', 'offset', 'join', 'left', 'right', 'inner', 'outer',
    'on', 'as', 'distinct', 'count', 'sum', 'avg', 'min', 'max', 'null',
    'is', 'in', 'like', 'between', 'case', 'when', 'then', 'else', 'end',
    'with', 'union', 'all', 'insert', 'into', 'values', 'update', 'set',
    'delete', 'create', 'table', 'drop', 'alter', 'asc', 'desc',
  ]

  // Cmd/Ctrl+Enter shortcut via Monaco editor action
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runQuery())

    completionDisposableRef.current?.dispose()
    completionDisposableRef.current = monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        const keywordSuggestions = SQL_KEYWORDS.map((kw) => ({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
        }))

        const tableSuggestions = schemaRef.current.map((t) => ({
          label: t.name,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: t.name,
          detail: 'table',
          range,
        }))

        const columnSuggestions = schemaRef.current.flatMap((t) =>
          t.columns.map((col) => ({
            label: col.name,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: col.name,
            detail: `${t.name} · ${col.type}`,
            range,
          }))
        )

        return { suggestions: [...keywordSuggestions, ...tableSuggestions, ...columnSuggestions] }
      },
    })
  }

  function insertIntoEditor(text: string): void {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    editor.trigger('schema-browser', 'type', { text })
  }

  function generateAndRunSelectAll(table: SchemaTable): void {
    const colList = table.columns.map((c) => `  ${c.name}`).join(',\n')
    const generated = `select\n${colList}\nfrom ${table.name}`
    setSql(generated)
    sqlRef.current = generated
    editorRef.current?.setValue(generated)
    executeQuery(generated)
  }

  async function handleSave(): Promise<void> {
    const name = saveName.trim()
    if (!name) return
    const res = await window.api.saveQuery(name, sqlRef.current, chartConfig)
    if (res.success) {
      setSavePromptOpen(false)
      setSaveName('')
      loadSavedQueries()
    } else {
      alert(`Save failed: ${res.reason}`)
    }
  }

  function loadQuery(q: SavedQuery): void {
    setSql(q.sql)
    sqlRef.current = q.sql
    if (q.chartConfig) {
      setChartConfig(q.chartConfig)
    }
  }

  // Build TanStack Table
  const columnHelper = createColumnHelper<Record<string, unknown>>()
  const tableColumns = columns.map((col) =>
    columnHelper.accessor((row) => row[col], {
      id: col,
      header: col,
      cell: (info) => String(info.getValue() ?? ''),
    })
  )

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* Saved queries sidebar */}
      <div
        style={{
          width: 200,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          marginRight: 24,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            padding: '0 0 10px 0',
          }}
        >
          Saved Queries
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {savedQueries.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>None saved yet</div>
          )}
          {savedQueries.map((q) => (
            <button
              key={q.id}
              onClick={() => loadQuery(q)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                color: 'var(--text)',
                padding: '6px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13,
                marginBottom: 2,
              }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.background = 'var(--accent)')}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.background = 'none')}
            >
              {q.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main query area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <h1 className="page-title">SQL Query</h1>

        {/* Editor */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
            marginBottom: 12,
            height: 180,
          }}
        >
          <Editor
            height="180px"
            defaultLanguage="sql"
            value={sql}
            onChange={(val) => setSql(val ?? '')}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              renderLineHighlight: 'line',
            }}
          />
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          <button
            onClick={runQuery}
            disabled={running}
            style={{
              padding: '7px 20px',
              background: running ? '#444' : 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              cursor: running ? 'not-allowed' : 'pointer',
            }}
          >
            {running ? 'Running…' : '▶ Run'}
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>⌘↩ / Ctrl↩</span>
          <button
            onClick={() => setSavePromptOpen(true)}
            style={{
              padding: '7px 16px',
              background: 'none',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
              marginLeft: 'auto',
            }}
          >
            Save Query
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              color: '#ff6b6b',
              background: '#2a1010',
              border: '1px solid #5a2020',
              borderRadius: 6,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Exec time + row count */}
        {execTime !== null && !error && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
            {rows.length} row{rows.length !== 1 ? 's' : ''} — {execTime.toFixed(1)} ms
          </div>
        )}

        {/* View toggle */}
        {columns.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {(['table', 'chart'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '5px 16px',
                  background: view === v ? 'var(--accent)' : 'transparent',
                  color: view === v ? '#fff' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {v}
              </button>
            ))}
          </div>
        )}

        {/* Chart view */}
        {columns.length > 0 && view === 'chart' && (
          <ChartPanel
            rows={rows}
            columns={columns}
            config={chartConfig}
            onConfigChange={setChartConfig}
          />
        )}

        {/* Results table */}
        {columns.length > 0 && view === 'table' && (
          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        style={{
                          padding: '8px 12px',
                          background: 'var(--sidebar-bg)',
                          borderBottom: '1px solid var(--border)',
                          textAlign: 'left',
                          fontWeight: 600,
                          cursor: 'pointer',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && ' ▲'}
                        {header.column.getIsSorted() === 'desc' && ' ▼'}
                        {!header.column.getIsSorted() && (
                          <span style={{ opacity: 0.3 }}> ⇅</span>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{
                          padding: '7px 12px',
                          borderBottom: '1px solid #1e1e3a',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {execTime !== null && !error && rows.length === 0 && (
          <div style={{ color: 'var(--text-muted)' }}>Query returned no rows.</div>
        )}
      </div>

      {/* Schema browser sidebar */}
      <div
        style={{
          width: 200,
          flexShrink: 0,
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          marginLeft: 24,
        }}
      >
        {/* Tables panel */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            borderBottom: '1px solid var(--border)',
            paddingBottom: 8,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              padding: '0 0 10px 12px',
              flexShrink: 0,
            }}
          >
            Tables
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {schema.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '0 12px' }}>
                Import a QIF file first
              </div>
            )}
            {schema.map((table) => (
              <button
                key={table.name}
                onClick={() => setSelectedTable(table.name === selectedTable ? null : table.name)}
                onDoubleClick={() => insertIntoEditor(table.name)}
                title="Click to expand · Double-click to insert name"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: selectedTable === table.name ? 'var(--accent)' : 'none',
                  border: 'none',
                  color: selectedTable === table.name ? '#fff' : 'var(--text)',
                  padding: '6px 12px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 13,
                  marginBottom: 2,
                }}
                onMouseEnter={(e) => {
                  if (selectedTable !== table.name)
                    (e.currentTarget as HTMLElement).style.background = 'var(--accent)'
                }}
                onMouseLeave={(e) => {
                  if (selectedTable !== table.name)
                    (e.currentTarget as HTMLElement).style.background = 'none'
                }}
              >
                {table.name}
              </button>
            ))}
          </div>
        </div>

        {/* Columns panel */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            paddingTop: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 8px 10px 12px',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              {selectedTable ? selectedTable : 'Columns'}
            </span>
            {selectedTable && (() => {
              const tbl = schema.find((t) => t.name === selectedTable)
              return tbl ? (
                <button
                  onClick={() => generateAndRunSelectAll(tbl)}
                  title={`SELECT all columns from ${selectedTable} and run`}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 11,
                    lineHeight: 1,
                    padding: '3px 6px',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = '#fff'
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                  }}
                >
                  ▶
                </button>
              ) : null
            })()}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!selectedTable && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '0 12px' }}>
                Select a table
              </div>
            )}
            {selectedTable &&
              (schema.find((t) => t.name === selectedTable)?.columns ?? []).map((col) => (
                <button
                  key={col.name}
                  onClick={() => insertIntoEditor(col.name)}
                  onDoubleClick={() => insertIntoEditor(col.name)}
                  title={`Click or double-click to insert "${col.name}" at cursor`}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text)',
                    padding: '5px 12px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 13,
                    marginBottom: 1,
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = 'var(--accent)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = 'none')
                  }
                >
                  <span>{col.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {col.type}
                  </span>
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Save query modal */}
      {savePromptOpen && (
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
          onClick={() => setSavePromptOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--sidebar-bg)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 24,
              width: 340,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 14 }}>Save Query</div>
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') setSavePromptOpen(false)
              }}
              placeholder="Query name…"
              style={{
                width: '100%',
                background: '#0d1117',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 14,
                marginBottom: 14,
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSavePromptOpen(false)}
                style={{
                  padding: '7px 16px',
                  background: 'none',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                style={{
                  padding: '7px 16px',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: saveName.trim() ? 'pointer' : 'not-allowed',
                  opacity: saveName.trim() ? 1 : 0.5,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default QueryPage
