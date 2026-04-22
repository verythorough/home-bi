// Type declarations for the IPC bridge exposed by the preload script

export interface ImportResult {
  success: boolean
  reason?: string
  filePath?: string
  stats?: {
    accounts: number
    transactions: number
    splits: number
    investments: number
  }
}

export interface QueryResult {
  success: boolean
  reason?: string
  rows?: Record<string, unknown>[]
}

export interface ChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'area'
  xColumn: string
  yColumn: string
  seriesColumn: string
}

export interface SavedQuery {
  id: number
  name: string
  sql: string
  chartConfig: ChartConfig | null
}

export interface SavedQueriesResult {
  success: boolean
  reason?: string
  queries?: SavedQuery[]
}

export interface DashboardPanel {
  id: number
  query_name: string
  position: number
}

export interface DashboardPanelsResult {
  success: boolean
  reason?: string
  panels?: DashboardPanel[]
}

export interface SchemaColumn {
  name: string
  type: string
}

export interface SchemaTable {
  name: string
  columns: SchemaColumn[]
}

export interface SchemaResult {
  success: boolean
  reason?: string
  schema?: SchemaTable[]
}

export interface Report {
  id: number
  name: string
  created_at: string
}

export interface ReportsResult {
  success: boolean
  reason?: string
  reports?: Report[]
}

export interface ReportPanel {
  id: number
  query_name: string
  position: number
  view_mode: 'auto' | 'table' | 'chart'
}

export interface ReportPanelsResult {
  success: boolean
  reason?: string
  panels?: ReportPanel[]
}

declare global {
  interface Window {
    api: {
      importQifFile: (filePath?: string) => Promise<ImportResult>
      runSqlQuery: (sql: string) => Promise<QueryResult>
      saveQuery: (name: string, sql: string, chartConfig?: ChartConfig) => Promise<{ success: boolean; reason?: string }>
      listSavedQueries: () => Promise<SavedQueriesResult>
      deleteQuery: (name: string) => Promise<{ success: boolean; reason?: string }>
      getDashboardPanels: () => Promise<DashboardPanelsResult>
      addDashboardPanel: (queryName: string) => Promise<{ success: boolean; reason?: string; id?: number }>
      removeDashboardPanel: (id: number) => Promise<{ success: boolean; reason?: string }>
      getSchema: () => Promise<SchemaResult>
      createReport: (name: string) => Promise<{ success: boolean; reason?: string; id?: number }>
      listReports: () => Promise<ReportsResult>
      renameReport: (id: number, name: string) => Promise<{ success: boolean; reason?: string }>
      deleteReport: (id: number) => Promise<{ success: boolean; reason?: string }>
      getReportPanels: (reportId: number) => Promise<ReportPanelsResult>
      addReportPanel: (reportId: number, queryName: string) => Promise<{ success: boolean; reason?: string; id?: number }>
      updatePanelViewMode: (id: number, viewMode: 'auto' | 'table' | 'chart') => Promise<{ success: boolean; reason?: string }>
    }
  }
}
