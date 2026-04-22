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
    }
  }
}
