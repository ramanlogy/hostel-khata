// Hostel Khata for Windows: Electron main process.
// Data lives in %APPDATA%\Hostel Khata\data.json, with one dated copy per day in backups\.
// Optional second copy in a folder the owner picks (see mirrorSave).
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
const dataDir = () => app.getPath('userData');
const dataFile = () => path.join(dataDir(), 'data.json');
const backupDir = () => path.join(dataDir(), 'backups');
const today = () => new Date().toISOString().slice(0, 10);
const KEEP_DAYS = 30;

function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

function isValid(text) {
  try { const d = JSON.parse(text); return d && Array.isArray(d.S) && d.cfg; } catch { return false; }
}

// Before the first save of each day, keep yesterday's file as a dated copy.
function dailyCopy() {
  try {
    if (!fs.existsSync(dataFile())) return;
    fs.mkdirSync(backupDir(), { recursive: true });
    const dest = path.join(backupDir(), `data-${today()}.json`);
    if (!fs.existsSync(dest)) fs.copyFileSync(dataFile(), dest);
    const old = fs.readdirSync(backupDir()).filter(f => /^data-\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
    old.slice(0, Math.max(0, old.length - KEEP_DAYS)).forEach(f => fs.unlinkSync(path.join(backupDir(), f)));
  } catch (e) { console.error('daily copy failed', e); }
}

function load() {
  try {
    if (fs.existsSync(dataFile())) {
      const text = fs.readFileSync(dataFile(), 'utf8');
      if (isValid(text)) return text;
      // Damaged file: keep it aside, then fall back to the newest good daily copy.
      fs.renameSync(dataFile(), path.join(dataDir(), `data.damaged-${Date.now()}.json`));
    }
    if (fs.existsSync(backupDir())) {
      const files = fs.readdirSync(backupDir()).filter(f => f.endsWith('.json')).sort().reverse();
      for (const f of files) {
        const text = fs.readFileSync(path.join(backupDir(), f), 'utf8');
        if (isValid(text)) return text;
      }
    }
  } catch (e) { console.error('load failed', e); }
  return null;
}

// Second copy (2026-11-26): the owner can pick a folder on a USB drive or a Google Drive / OneDrive
// folder. Every save also writes the data there, plus one dated copy per day, so a dead or stolen
// laptop does not lose everything. If the folder is missing (USB unplugged), the normal save still works.
const prefsFile = () => path.join(dataDir(), 'prefs.json');
function readPrefs() { try { return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) || {}; } catch { return {}; } }
function writePrefs(p) { fs.mkdirSync(dataDir(), { recursive: true }); writeAtomic(prefsFile(), JSON.stringify(p)); }
let mirrorState = { ok: null, at: null, error: null };
function mirrorSave(text) {
  const dir = readPrefs().mirror;
  if (!dir) { mirrorState = { ok: null, at: null, error: null }; return; }
  try {
    if (!fs.existsSync(dir)) throw new Error('Folder not found: ' + dir);
    writeAtomic(path.join(dir, 'Hostel Khata data.json'), text);
    const daily = path.join(dir, 'Hostel Khata daily copies');
    fs.mkdirSync(daily, { recursive: true });
    const dest = path.join(daily, `data-${today()}.json`);
    writeAtomic(dest, text);
    const old = fs.readdirSync(daily).filter(f => /^data-\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
    old.slice(0, Math.max(0, old.length - KEEP_DAYS)).forEach(f => fs.unlinkSync(path.join(daily, f)));
    mirrorState = { ok: true, at: new Date().toISOString(), error: null };
  } catch (err) { mirrorState = { ok: false, at: mirrorState.at, error: String(err && err.message || err) }; }
}
ipcMain.on('hk:mirror', e => { e.returnValue = { dir: readPrefs().mirror || null, ...mirrorState }; });
ipcMain.handle('hk:mirror-pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose a folder for the second copy (USB drive or Google Drive)', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = readPrefs(); p.mirror = r.filePaths[0]; writePrefs(p);
  if (fs.existsSync(dataFile())) mirrorSave(fs.readFileSync(dataFile(), 'utf8'));
  return { dir: p.mirror, ...mirrorState };
});
ipcMain.on('hk:mirror-clear', e => { const p = readPrefs(); delete p.mirror; writePrefs(p); mirrorState = { ok: null, at: null, error: null }; e.returnValue = true; });

let copiedToday = null;
ipcMain.on('hk:load', e => { e.returnValue = load(); });
ipcMain.on('hk:save', (e, text) => {
  try {
    if (!isValid(text)) throw new Error('refusing to save invalid data');
    fs.mkdirSync(dataDir(), { recursive: true });
    if (copiedToday !== today()) { dailyCopy(); copiedToday = today(); }
    writeAtomic(dataFile(), text);
    mirrorSave(text);
    e.returnValue = { ok: true, mirror: mirrorState };
  } catch (err) { e.returnValue = { ok: false, error: String(err && err.message || err) }; }
});
ipcMain.on('hk:dir', e => { e.returnValue = dataDir(); });
ipcMain.on('hk:keep', (e, tag) => {
  try {
    fs.mkdirSync(backupDir(), { recursive: true });
    if (fs.existsSync(dataFile())) fs.copyFileSync(dataFile(), path.join(backupDir(), `${tag}-${Date.now()}.json`));
  } catch (err) { console.error(err); }
  e.returnValue = true;
});
ipcMain.handle('hk:export', async (e, name, text) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Save backup', defaultPath: path.join(app.getPath('documents'), name),
    filters: [{ name: 'Hostel Khata backup', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return false;
  writeAtomic(r.filePath, text);
  return true;
});
ipcMain.handle('hk:import', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Restore backup', properties: ['openFile'],
    filters: [{ name: 'Hostel Khata backup', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return fs.readFileSync(r.filePaths[0], 'utf8');
});
ipcMain.handle('hk:folder', () => shell.openPath(dataDir()));

function openOutside(url) {
  if (/^https:\/\//i.test(url)) shell.openExternal(url);
}

function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 420, minHeight: 500, show: false,
    title: 'Hostel Khata', backgroundColor: '#f6f7f9',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false,
    },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // WhatsApp and other web links open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); openOutside(url); }
  });
  // Zoom with Ctrl + / Ctrl - / Ctrl 0, and Ctrl+P to print (there is no menu bar).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !input.control) return;
    const wc = win.webContents, z = wc.getZoomLevel();
    if (input.key === '=' || input.key === '+') { wc.setZoomLevel(Math.min(z + 0.5, 4)); e.preventDefault(); }
    else if (input.key === '-') { wc.setZoomLevel(Math.max(z - 0.5, -3)); e.preventDefault(); }
    else if (input.key === '0') { wc.setZoomLevel(0); e.preventDefault(); }
    else if (input.key.toLowerCase() === 'p') { wc.print(); e.preventDefault(); }
  });
  win.loadFile(path.join(__dirname, 'web', 'index.html'));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
