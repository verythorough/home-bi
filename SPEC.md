# QIF Financial Analytics App — Spec

## Goal

A local-first Electron desktop app that imports QIF files (exported from Quicken), loads them into an embedded SQLite database, and provides a Mode-like SQL query interface with table and chart visualization — a personal BI tool for home finances.

## Architecture

- **Runtime**: Electron (cross-platform: Mac + Windows)
- **Frontend**: React + TypeScript, bundled with Vite
- **SQL Engine**: better-sqlite3 in the main process, exposed via IPC
- **Query Editor**: Monaco Editor (SQL syntax highlighting + schema-aware autocomplete)
- **Charts**: Apache ECharts (fully offline-capable)
- **Data Tables**: TanStack Table (lightweight, headless)
- **Persistence**: SQLite has two logical halves:
  - *Financial data tables* (`accounts`, `transactions`, `splits`, `categories`, `investments`) — fully replaced on each QIF import
  - *User data tables* (`saved_queries`, `reports`, `dashboard_panels`) — never touched by import

## Data Model

### Financial tables (replaced on QIF import)

- **accounts** — name, type (Bank, CCard, Invst, etc.)
- **transactions** — date, amount, payee, memo, category_id, check_num, cleared, account_id
- **splits** — transaction_id, category_id, memo, amount
- **categories** — name
- **investments** — date, action, security, price, quantity, amount, commission, memo, cleared, account_id

Investment transactions are imported into their own table — no complex join needed for basic checking/credit card analytics.

### User data tables (preserved across imports)

- **saved_queries** — name, sql, chart_config (JSON)
- **reports** — id, name, created_at
- **dashboard_panels** — id, report_id, query_name, position, view_mode ('auto'|'table'|'chart')

## Key Screens

1. **Import** — Drag-and-drop or file picker for QIF file. Shows import summary (accounts, transactions, splits, investments). Re-import replaces financial data only; user data is preserved. Confirmation dialog before replacing.

2. **Query Editor** — Monaco editor for SQL (lowercase keywords, schema-aware autocomplete). Run button (or Cmd/Ctrl+Enter). Results in a sortable TanStack Table. Toggle between Table and Chart views. Save queries with names. Left sidebar: saved queries list. Right sidebar: schema browser (tables → columns, play button to generate SELECT, double-click to insert at cursor).

3. **Chart Builder** — Available from Query screen after running a query. Chart types: bar, line, area, pie. Map query columns to X axis, Y axis, optional series. Chart config is saved with the query.

4. **Reports** — Named collections of panels. Multiple reports supported (create, rename, delete). Each panel shows a saved query as a table or chart. Per-panel view mode toggle (table ⊞ / chart 📈). Print button uses `window.print()` with `@media print` CSS that hides navigation and controls.

## QIF Import: Re-import Behavior

On re-import, the following tables are deleted and recreated from the new file (in FK-safe order):
1. investments
2. splits
3. transactions
4. categories
5. accounts

`saved_queries`, `reports`, and `dashboard_panels` are never touched.

## Acceptance Criteria

- App launches on Mac via `npm run dev`
- QIF file can be imported; summary shows account/transaction counts
- Re-importing a new QIF replaces financial data; saved queries and reports survive
- SQL queries run against imported data and display in a sortable table
- Charts render from query results (bar, line, area, pie)
- Queries and chart configs can be saved, loaded, and deleted
- Schema browser shows tables and columns; clicking inserts at cursor; play button runs SELECT for that table
- SQL autocomplete suggests keywords, table names, and column names while typing
- Multiple named reports can be created, renamed, and deleted
- Reports contain panels (saved queries shown as table or chart)
- Per-panel view mode (table/chart) persists across restarts
- Print button opens OS print dialog showing only panel content
- All user data persists across app restarts
- No internet connection required for any core feature

## Non-goals (v1)

- Windows installer packaging (electron-builder config is present but untested)
- Stock price lookup / internet features
- Advanced investment analytics / portfolio tracking
- Multi-file import or merge
- Data editing (read-only analytics)
- User authentication
- Export/sharing features

## Assumptions

- Single QIF file per import (full history exported from Quicken each time)
- SQLite database stored in Electron's `app.getPath('userData')` directory as `home-bi.db`
- Monaco editor bundled locally (no CDN)
- Investment transactions stored but not deeply analyzed in v1

## Verification

```bash
npm install       # dependencies install cleanly
npm test          # 28/28 QIF parser tests pass
npm run build     # all three processes build (main, preload, renderer)
npm run dev       # Electron window opens
```

Manual verification steps:
1. Import a QIF file → verify summary shows correct counts
2. Run `select * from transactions` → verify rows appear in table
3. Toggle to chart view → configure bar/line/pie/area chart
4. Save query → verify it appears in sidebar and persists after restart
5. Schema browser: click a table → columns appear; click column → inserts in editor; play button → generates and runs SELECT
6. Open Reports → create a report → add panels → toggle table/chart per panel
7. Click Print → OS print dialog shows only panel content
8. Re-import updated QIF → verify transaction data refreshes, reports intact
