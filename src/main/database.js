'use strict';

const path = require('path');
const Database = require('better-sqlite3');

let db = null;

function getDbPath(app) {
  if (app) {
    return path.join(app.getPath('userData'), 'home-bi.db');
  }
  // Fallback for testing
  return path.join(__dirname, '..', 'home-bi.db');
}

function openDatabase(app) {
  const dbPath = getDbPath(app);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema();
  runMigrations();
  return db;
}

function runMigrations() {
  try {
    db.exec('ALTER TABLE saved_queries ADD COLUMN chart_config TEXT');
  } catch (_) {}

  try {
    db.exec('ALTER TABLE dashboard_panels ADD COLUMN report_id INTEGER REFERENCES reports(id)');
  } catch (_) {}

  try {
    db.exec("ALTER TABLE dashboard_panels ADD COLUMN view_mode TEXT NOT NULL DEFAULT 'auto'");
  } catch (_) {}

  // Ensure a default "Main" report exists, then assign orphaned panels to it
  const existing = db.prepare("SELECT id FROM reports WHERE name = 'Main'").get();
  let defaultId;
  if (!existing) {
    defaultId = db.prepare("INSERT INTO reports (name) VALUES ('Main')").run().lastInsertRowid;
  } else {
    defaultId = existing.id;
  }
  db.prepare('UPDATE dashboard_panels SET report_id = ? WHERE report_id IS NULL').run(defaultId);
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      date TEXT,
      amount REAL NOT NULL DEFAULT 0,
      payee TEXT,
      memo TEXT,
      category_id INTEGER REFERENCES categories(id),
      check_num TEXT,
      cleared TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id),
      category_id INTEGER REFERENCES categories(id),
      memo TEXT,
      amount REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS saved_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sql TEXT NOT NULL,
      chart_config TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      date TEXT,
      action TEXT,
      security TEXT,
      price REAL DEFAULT 0,
      quantity REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      commission REAL DEFAULT 0,
      memo TEXT,
      cleared TEXT,
      transfer_account TEXT,
      transfer_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dashboard_panels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function getOrCreateCategory(name) {
  if (!name) return null;
  // Strip transfer markers (e.g. [Account])
  const cleanName = name.replace(/^\[|\]$/g, '').trim();
  if (!cleanName) return null;

  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(cleanName);
  if (existing) return existing.id;

  const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(cleanName);
  return result.lastInsertRowid;
}

function importQIFData(parsed) {
  const insertAccount = db.prepare('INSERT INTO accounts (name, type) VALUES (?, ?)');
  const insertTx = db.prepare(`
    INSERT INTO transactions (account_id, date, amount, payee, memo, category_id, check_num, cleared)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSplit = db.prepare(`
    INSERT INTO splits (transaction_id, category_id, memo, amount)
    VALUES (?, ?, ?, ?)
  `);
  const insertInvestment = db.prepare(`
    INSERT INTO investments (account_id, date, action, security, price, quantity, amount, commission, memo, cleared, transfer_account, transfer_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const importAll = db.transaction(() => {
    db.prepare('DELETE FROM investments').run();
    db.prepare('DELETE FROM splits').run();
    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM categories').run();
    db.prepare('DELETE FROM accounts').run();

    const stats = { accounts: 0, transactions: 0, splits: 0, investments: 0 };

    for (const account of parsed.accounts) {
      const accResult = insertAccount.run(account.name, account.type);
      const accountId = accResult.lastInsertRowid;
      stats.accounts++;

      if (account.type === 'Invst') {
        for (const tx of account.transactions) {
          insertInvestment.run(
            accountId,
            tx.date,
            tx.action,
            tx.security,
            tx.price,
            tx.quantity,
            tx.amount,
            tx.commission,
            tx.memo,
            tx.cleared,
            tx.transferAccount,
            tx.transferAmount,
          );
          stats.investments++;
        }
      } else {
        for (const tx of account.transactions) {
          const catId = getOrCreateCategory(tx.category);
          const txResult = insertTx.run(
            accountId,
            tx.date,
            tx.amount,
            tx.payee,
            tx.memo,
            catId,
            tx.checkNum,
            tx.cleared,
          );
          const txId = txResult.lastInsertRowid;
          stats.transactions++;

          for (const split of tx.splits) {
            const splitCatId = getOrCreateCategory(split.category);
            insertSplit.run(txId, splitCatId, split.memo, split.amount);
            stats.splits++;
          }
        }
      }
    }

    return stats;
  });

  return importAll();
}

function runQuery(sql) {
  // Only allow SELECT statements
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
    throw new Error('Only SELECT queries are allowed');
  }
  const stmt = db.prepare(sql);
  return stmt.all();
}

function getDatabase() {
  return db;
}

function saveQuery(name, sql, chartConfig) {
  const configJson = chartConfig ? JSON.stringify(chartConfig) : null;
  db.prepare(`
    INSERT INTO saved_queries (name, sql, chart_config) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET sql = excluded.sql, chart_config = excluded.chart_config
  `).run(name, sql, configJson);
}

function listSavedQueries() {
  return db.prepare('SELECT id, name, sql, chart_config FROM saved_queries ORDER BY name ASC').all().map((row) => ({
    ...row,
    chartConfig: row.chart_config ? JSON.parse(row.chart_config) : null,
  }));
}

function deleteSavedQuery(name) {
  db.prepare('DELETE FROM saved_queries WHERE name = ?').run(name);
}

function getDashboardPanels() {
  return db.prepare('SELECT id, query_name, position FROM dashboard_panels ORDER BY position ASC, id ASC').all();
}

function addDashboardPanel(queryName) {
  const row = db.prepare('SELECT MAX(position) as maxPos FROM dashboard_panels').get();
  const nextPos = (row?.maxPos ?? -1) + 1;
  const result = db.prepare('INSERT INTO dashboard_panels (query_name, position) VALUES (?, ?)').run(queryName, nextPos);
  return result.lastInsertRowid;
}

function removeDashboardPanel(id) {
  db.prepare('DELETE FROM dashboard_panels WHERE id = ?').run(id);
}

function createReport(name) {
  const result = db.prepare('INSERT INTO reports (name) VALUES (?)').run(name);
  return result.lastInsertRowid;
}

function listReports() {
  return db.prepare('SELECT id, name, created_at FROM reports ORDER BY created_at ASC').all();
}

function renameReport(id, name) {
  db.prepare('UPDATE reports SET name = ? WHERE id = ?').run(name, id);
}

function deleteReport(id) {
  db.transaction(() => {
    db.prepare('DELETE FROM dashboard_panels WHERE report_id = ?').run(id);
    db.prepare('DELETE FROM reports WHERE id = ?').run(id);
  })();
}

function getReportPanels(reportId) {
  return db.prepare(
    'SELECT id, query_name, position, view_mode FROM dashboard_panels WHERE report_id = ? ORDER BY position ASC, id ASC'
  ).all(reportId);
}

function addReportPanel(reportId, queryName) {
  const row = db.prepare('SELECT MAX(position) as maxPos FROM dashboard_panels WHERE report_id = ?').get(reportId);
  const nextPos = (row?.maxPos ?? -1) + 1;
  const result = db.prepare('INSERT INTO dashboard_panels (report_id, query_name, position) VALUES (?, ?, ?)').run(reportId, queryName, nextPos);
  return result.lastInsertRowid;
}

function updatePanelViewMode(id, viewMode) {
  db.prepare('UPDATE dashboard_panels SET view_mode = ? WHERE id = ?').run(viewMode, id);
}

module.exports = { openDatabase, importQIFData, runQuery, getDatabase, createSchema, saveQuery, listSavedQueries, deleteSavedQuery, getDashboardPanels, addDashboardPanel, removeDashboardPanel, createReport, listReports, renameReport, deleteReport, getReportPanels, addReportPanel, updatePanelViewMode };
