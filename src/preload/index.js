'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  importQifFile: (filePath) => ipcRenderer.invoke('import-qif-file', filePath),
  runSqlQuery: (sql) => ipcRenderer.invoke('run-sql-query', sql),
  saveQuery: (name, sql, chartConfig) => ipcRenderer.invoke('save-query', name, sql, chartConfig),
  listSavedQueries: () => ipcRenderer.invoke('list-saved-queries'),
  deleteQuery: (name) => ipcRenderer.invoke('delete-query', name),
  getDashboardPanels: () => ipcRenderer.invoke('get-dashboard-panels'),
  addDashboardPanel: (queryName) => ipcRenderer.invoke('add-dashboard-panel', queryName),
  removeDashboardPanel: (id) => ipcRenderer.invoke('remove-dashboard-panel', id),
  getSchema: () => ipcRenderer.invoke('get-schema'),
});
