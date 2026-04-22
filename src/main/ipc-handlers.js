import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import { parseQIF } from './qif-parser';
import { importQIFData, runQuery, saveQuery, listSavedQueries, deleteSavedQuery, getDashboardPanels, addDashboardPanel, removeDashboardPanel, getDatabase } from './database';

function registerIpcHandlers() {
  ipcMain.handle('import-qif-file', async (event, droppedPath) => {
    let filePath;
    if (droppedPath) {
      filePath = droppedPath;
    } else {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import QIF File',
        filters: [
          { name: 'QIF Files', extensions: ['qif', 'QIF'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (canceled || filePaths.length === 0) {
        return { success: false, reason: 'cancelled' };
      }
      filePath = filePaths[0];
    }
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      return { success: false, reason: `Failed to read file: ${err.message}` };
    }

    let parsed;
    try {
      parsed = parseQIF(content);
    } catch (err) {
      return { success: false, reason: `Failed to parse QIF: ${err.message}` };
    }

    let stats;
    try {
      stats = importQIFData(parsed);
    } catch (err) {
      return { success: false, reason: `Failed to import data: ${err.message}` };
    }

    return { success: true, filePath, stats };
  });

  ipcMain.handle('run-sql-query', async (event, sql) => {
    if (!sql || typeof sql !== 'string') {
      return { success: false, reason: 'Invalid query' };
    }
    try {
      const rows = runQuery(sql);
      return { success: true, rows };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  ipcMain.handle('save-query', async (event, name, sql, chartConfig) => {
    if (!name || !sql) return { success: false, reason: 'Name and SQL required' };
    try {
      saveQuery(name, sql, chartConfig);
      return { success: true };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  ipcMain.handle('list-saved-queries', async () => {
    try {
      const queries = listSavedQueries();
      return { success: true, queries };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  ipcMain.handle('delete-query', async (event, name) => {
    try {
      deleteSavedQuery(name);
      return { success: true };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  ipcMain.handle('get-dashboard-panels', async () => {
    try {
      const panels = getDashboardPanels();
      return { success: true, panels };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  ipcMain.handle('add-dashboard-panel', async (event, queryName) => {
    if (!queryName) return { success: false, reason: 'Query name required' };
    try {
      const id = addDashboardPanel(queryName);
      return { success: true, id };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  ipcMain.handle('remove-dashboard-panel', async (event, id) => {
    try {
      removeDashboardPanel(id);
      return { success: true };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  ipcMain.handle('get-schema', async () => {
    try {
      const db = getDatabase();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      const schema = tables.map(({ name }) => ({
        name,
        columns: db.prepare(`PRAGMA table_info(${name})`).all().map((c) => ({ name: c.name, type: c.type })),
      }));
      return { success: true, schema };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });
}

export { registerIpcHandlers };
