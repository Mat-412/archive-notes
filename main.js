const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

let mainWindow;

const EDITION_LABEL = '(Free Edition)';

let updatePromptVisible = false;
let updateCheckSource = null; // 'startup' | 'manual' | null
let updateDownloadStarted = false;

function setMainWindowProgress(percent01OrNull) {
  try {
    if (!mainWindow || typeof mainWindow.setProgressBar !== 'function') return;
    if (percent01OrNull === null) {
      // remove progress indicator
      mainWindow.setProgressBar(-1);
      return;
    }
    const v = Math.max(0, Math.min(1, Number(percent01OrNull)));
    mainWindow.setProgressBar(v);
  } catch (_e) {
    // ignore
  }
}

function resetUpdateState() {
  updateCheckSource = null;
  updateDownloadStarted = false;
  setMainWindowProgress(null);
}

function getBestWindowIcon() {
  try {
    const iconPath = path.join(__dirname, 'favicon.ico');
    const base = nativeImage.createFromPath(iconPath);
    if (!base || base.isEmpty()) return iconPath;

    // On Windows, the titlebar icon is rendered at different logical sizes depending on DPI scaling.
    // If we hand Windows a native icon at the exact size (e.g. 20px for 125% scaling),
    // it avoids blurry scaling artifacts.
    const scale = (screen && screen.getPrimaryDisplay)
      ? (screen.getPrimaryDisplay().scaleFactor || 1)
      : 1;
    const targetSize = Math.max(16, Math.round(16 * scale));

    const sized = base.resize({ width: targetSize, height: targetSize, quality: 'best' });
    return (sized && !sized.isEmpty()) ? sized : iconPath;
  } catch (_e) {
    return path.join(__dirname, 'favicon.ico');
  }
}

function withSingleUpdatePrompt(fn) {
  if (updatePromptVisible) return;
  updatePromptVisible = true;
  Promise.resolve()
    .then(fn)
    .catch(() => {
      // ignore
    })
    .finally(() => {
      updatePromptVisible = false;
    });
}

function initAutoUpdater() {
  // We want a "click to update" flow, not silent downloads.
  autoUpdater.autoDownload = false;

  autoUpdater.on('error', (err) => {
    const shouldShow = updateCheckSource === 'manual' || updateDownloadStarted;
    if (shouldShow) {
      const msg = err && err.message ? err.message : String(err || 'Unknown error');
      dialog.showMessageBox(mainWindow || undefined, {
        type: 'error',
        title: 'Update Error',
        message: updateDownloadStarted ? 'Could not download the update.' : 'Could not check for updates.',
        detail: msg
      }).catch(() => {});
    }
    resetUpdateState();
  });

  autoUpdater.on('update-available', (info) => {
    withSingleUpdatePrompt(async () => {
      const version = (info && info.version) ? info.version : 'a new version';
      const res = await dialog.showMessageBox(mainWindow || undefined, {
        type: 'none',
        title: 'Update Available',
        message: `Update available: v${version}`,
        detail: 'Would you like to download and install it now?',
        buttons: ['Download and Install', 'Later'],
        defaultId: 0,
        cancelId: 1
      });

      if (res.response === 0) {
        updateDownloadStarted = true;
        autoUpdater.downloadUpdate().catch((err) => {
          // Ensure users see errors even if the check was triggered on startup.
          const msg = err && err.message ? err.message : String(err || 'Unknown error');
          dialog.showMessageBox(mainWindow || undefined, {
            type: 'error',
            title: 'Update Error',
            message: 'Could not download the update.',
            detail: msg
          }).catch(() => {});
          resetUpdateState();
        });
      } else {
        // user chose "Later"
        resetUpdateState();
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    if (updateCheckSource === 'manual') {
      dialog.showMessageBox(mainWindow || undefined, {
        type: 'none',
        title: 'No Updates',
        message: 'You’re up to date.',
        detail: `Version ${getAppVersionSafe()}`
      }).catch(() => {});
    }
    resetUpdateState();
  });

  autoUpdater.on('download-progress', (progress) => {
    try {
      const pct = progress && typeof progress.percent === 'number' ? progress.percent : null;
      if (pct === null) return;
      setMainWindowProgress(pct / 100);
    } catch (_e) {
      // ignore
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    withSingleUpdatePrompt(async () => {
      const version = (info && info.version) ? info.version : '';
      const res = await dialog.showMessageBox(mainWindow || undefined, {
        type: 'none',
        title: 'Update Ready',
        message: `Update${version ? ` v${version}` : ''} downloaded.`,
        detail: 'Restart now to install the update?',
        buttons: ['Restart and Install', 'Later'],
        defaultId: 0,
        cancelId: 1
      });

      if (res.response === 0) {
        autoUpdater.quitAndInstall();
      } else {
        // user chose "Later"
        resetUpdateState();
      }
    });
  });
}

function checkForUpdates(source) {
  updateCheckSource = source || 'manual';
  // electron-updater will throw if publish config isn't present / usable.
  autoUpdater.checkForUpdates().catch((err) => {
    if (updateCheckSource === 'manual') {
      const msg = err && err.message ? err.message : String(err || 'Unknown error');
      dialog.showMessageBox(mainWindow || undefined, {
        type: 'error',
        title: 'Update Error',
        message: 'Could not check for updates.',
        detail:
          msg +
          '\n\nTip: Auto-updates require published releases (e.g. GitHub Releases) and a matching publish config in electron-builder.'
      }).catch(() => {});
    }
    resetUpdateState();
  });
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getAppVersionSafe() {
  return app.getVersion ? app.getVersion() : '1.0.2';
}

function getAppStatePath() {
  return path.join(app.getPath('userData'), 'app-state.json');
}

async function readAppState() {
  try {
    const p = getAppStatePath();
    if (!fs.existsSync(p)) return {};
    const raw = await fs.promises.readFile(p, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_e) {
    return {};
  }
}

async function writeAppState(next) {
  try {
    const p = getAppStatePath();
    await fs.promises.writeFile(p, JSON.stringify(next, null, 2), 'utf-8');
  } catch (_e) {
    // ignore
  }
}

function extractChangelogSection(markdown, version) {
  if (!markdown) return null;
  const v = escapeRegex(version);
  const re = new RegExp(
    `^##\\s*\\[${v}\\][^\\n]*\\n([\\s\\S]*?)(?=^##\\s*\\[|\\Z)`,
    'm'
  );
  const match = markdown.match(re);
  if (!match) return null;
  return (match[1] || '').trim();
}

function markdownToDialogText(markdown) {
  const text = String(markdown || '')
    .replace(/\r\n/g, '\n')
    // turn "- " bullets into the same style used elsewhere in Help dialogs
    .replace(/^\s*-\s+/gm, '• ')
    // remove inline code backticks for cleaner dialogs
    .replace(/`([^`]+)`/g, '$1')
    .trim();

  return text;
}

async function getWhatsNewDialogDetailText() {
  const version = getAppVersionSafe();
  try {
    const changelogPath = resolveBundledTextFile('CHANGELOG.md');
    const markdown = await fs.promises.readFile(changelogPath, 'utf-8');
    const section = extractChangelogSection(markdown, version);
    if (section) {
      return markdownToDialogText(section);
    }
    return '• Updates in this version.';
  } catch (_e) {
    return '• Updates in this version.';
  }
}

async function showWhatsNewDialog(parentWindow) {
  const version = getAppVersionSafe();
  const detail = await getWhatsNewDialogDetailText();
  await dialog.showMessageBox(parentWindow || undefined, {
    type: 'none',
    title: "What's New",
    message: `Archive Notes ${EDITION_LABEL}\nVersion ${version}`,
    detail: detail || ''
  });
}

async function maybeShowWhatsNewOnUpdate() {
  const current = getAppVersionSafe();
  const state = await readAppState();
  const lastShown = typeof state.lastShownWhatsNewVersion === 'string'
    ? state.lastShownWhatsNewVersion
    : (typeof state.lastRunVersion === 'string' ? state.lastRunVersion : '');

  // Show once per version (covers both first install and upgrades).
  if (!lastShown || lastShown !== current) {
    await showWhatsNewDialog(mainWindow);
  }

  await writeAppState({ ...state, lastRunVersion: current, lastShownWhatsNewVersion: current });
}

function formatCopyright(startYear) {
  const currentYear = new Date().getFullYear();
  if (!Number.isFinite(startYear)) return `© ${currentYear}`;
  if (currentYear <= startYear) return `© ${startYear}`;
  return `© ${startYear}–${currentYear}`;
}

function resolveBundledTextFile(filename) {
  // In production, `extraResources` places files in the app's resources directory
  // (process.resourcesPath). In dev, fall back to the project root.
  const productionPath = path.join(process.resourcesPath, filename);
  if (app.isPackaged && fs.existsSync(productionPath)) return productionPath;
  return path.join(__dirname, filename);
}

function getBugReportUrl() {
  try {
    // Prefer reading from package.json so you can change it once for future releases.
    // (In packaged builds, this is included due to build.files: "**/*".)
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const pkg = require('./package.json');
    const bugs = pkg && pkg.bugs;
    if (!bugs) return null;
    if (typeof bugs === 'string') return bugs;
    if (typeof bugs.url === 'string') return bugs.url;
  } catch (_e) {
    // ignore
  }
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    icon: getBestWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadFile('index.html');

  // Custom Menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Import',
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            mainWindow.webContents.send('menu-import');
          }
        },
        {
          label: 'Export',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            mainWindow.webContents.send('menu-export');
          }
        },
        { type: 'separator' },
        {
          label: 'Print',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            mainWindow.webContents.print();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Change Background Color',
          submenu: [
            {
              label: 'Blue-Gray (Default)',
              click: () => {
                mainWindow.webContents.send('change-background-color', '5A6E7F');
              }
            },
            { type: 'separator' },
            {
              label: 'White',
              click: () => {
                mainWindow.webContents.send('change-background-color', 'FFF');
              }
            },
            {
              label: 'Gray',
              click: () => {
                mainWindow.webContents.send('change-background-color', 'DCDCDC');
              }
            },
            {
              label: 'Brown',
              click: () => {
                mainWindow.webContents.send('change-background-color', '5E2F0D');
              }
            },
            {
              label: 'Black',
              click: () => {
                mainWindow.webContents.send('change-background-color', '000000');
              }
            },
            { type: 'separator' },
            {
              label: 'Blue',
              click: () => {
                mainWindow.webContents.send('change-background-color', '0F4C81');
              }
            },
            {
              label: 'Green',
              click: () => {
                mainWindow.webContents.send('change-background-color', '0A5D0A');
              }
            },
            {
              label: 'Red',
              click: () => {
                mainWindow.webContents.send('change-background-color', '8B0000');
              }
            },
            {
              label: 'Orange',
              click: () => {
                mainWindow.webContents.send('change-background-color', 'FF7B00');
              }
            },
            {
              label: 'Teal',
              click: () => {
                mainWindow.webContents.send('change-background-color', '339999');
              }
            },
            {
              label: 'Yellow',
              click: () => {
                mainWindow.webContents.send('change-background-color', 'FFE114');
              }
            },
            {
              label: 'Purple',
              click: () => {
                mainWindow.webContents.send('change-background-color', '800080');
              }
            },
            {
              label: 'Pink',
              click: () => {
                mainWindow.webContents.send('change-background-color', 'FFC0CB');
              }
            },
            { type: 'separator' },
            {
              label: 'Custom...',
              accelerator: 'F6',
              click: () => {
                mainWindow.webContents.send('open-custom-background-modal');
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Toggle Preview Mode',
          accelerator: 'F4',
          click: () => {
            mainWindow.webContents.send('menu-toggle-preview');
          }
        },
        {
          label: 'Toggle Full Screen',
          role: 'togglefullscreen',
          accelerator: 'F11'
        },
        { type: 'separator' },
        {
          label: 'Insert Symbols Using LaTeX',
          accelerator: 'F7', 
          click: () => {
            mainWindow.webContents.send('menu-insert-math-symbols');
          }
        },
        {
          label: 'Insert Custom Table',
          accelerator: 'F8',
          click: () => {
            mainWindow.webContents.send('menu-insert-custom-table');
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Using the App',
          click: () => {
            dialog.showMessageBox({
              type: 'none',
              title: 'Using the App',
              detail: 
`The app consists of three main sections:
• Sidebar: Contains your notebooks and notes hierarchy
• Left pane (Editor): Where you type Markdown and LaTeX content
• Right pane (Preview): Shows the formatted result of your content

Sidebar Explained:
• "Add Notebook" button: Creates a top-level notebook to organize related notes
• "✎" button: Edit the title of the notebook or note
• "+" button: Add a new note within the selected notebook or note
• "-" button: Delete the notebook or note (moves to Trash)
• Arrow (▶/▼): Expand or collapse to show/hide nested notes
• Number in parentheses: Shows how many subnotes are contained directly under the note
• Changing order of notes: Drag the note and drop when the blue guide line is in the desired spot
• Nesting notes: Drag the note and drop when the blue guide box is around the desired parent note

Steps to Create and Edit Notes:
1. Create a notebook using the "Add Notebook" button
2. Add notes to notebooks using the "+" button
3. Select a note by clicking its header (turns black when selected)
4. Type in the left editor pane using Markdown and LaTeX syntax
5. See the formatted result instantly in the right preview pane

Special Features:
• Toggle Preview Mode (F4): Show/hide the preview pane for a distraction-free writing experience
• Custom Background Color (F6): Use preset colors or enter a custom hex code for your background
• Insert Symbols Using LaTeX (F7): Open a searchable list of math symbols to insert into your notes
• Insert Custom Table (F8): Create tables with custom rows and columns using Markdown syntax`
            });
          }
        },
        {
          label: 'What is Markdown?',
          click: () => {
            dialog.showMessageBox({
              type: 'none',
              title: 'What is Markdown?',
              detail:
`Markdown is a lightweight markup language that lets you format text using simple, readable syntax. 

Basic Concept:
• Plain text format that's easy to read even without formatting
• Converts to HTML for display in the preview pane
• No need to use complex editors or know HTML

How to Use It:
• Type in the editor pane using special characters
• See formatted results instantly in the preview pane
• The text stays readable even without rendering

Common Formatting:
• # Heading (use # for headings of different levels)
• **Bold text** (surround with double asterisks)
• *Italic text* (surround with single asterisks)
• "-" Item (hyphen for bullet lists)
• 1. Item (numbers for ordered lists)
• [Link text](url) (for hyperlinks)`

            });
          }
        },
        {
          label: 'What is LaTeX?',
          click: () => {
            dialog.showMessageBox({
              type: 'none',
              title: 'What is LaTeX?',
              detail:
`LaTeX is a typesetting system commonly used for mathematical and scientific writing.

Basic Concept:
• A markup language that allows you to write complex mathematical expressions and symbols
• Used in academic papers, scientific publications, and technical documents
• In this app, we use a subset focused on math expressions

How to Use It:
• Symbols have a code you type in the editor pane (left) to make it render in the preview pane (right)
• Type \\ followed by the code and surround it with $ on both sides
• The "Insert Math Symbols Using LaTeX" option in the view menu inserts a symbol of your choice

Examples:
• To print √2: type $\\sqrt{2}$ 
• To print θ: type $\\theta$
• To print ±x²: type $\\pm{x^2}$

Common Uses:
• Complex equations and formulas
• Mathematical symbols not available on standard keyboards
• Professional-looking mathematical notation

Press F7 to open the LaTeX symbols list for quick insertion of symbols.`
            });
          }
        },
        {
          label: 'Keyboard Shortcuts',
          click: () => {
            dialog.showMessageBox({
              type: 'none',
              title: 'Keyboard Shortcuts',
              detail:
`Shortcuts:
• About: F1
• Toggle Preview Mode: F4
• Custom Background Color: F6
• Insert Symbols Using LaTeX: F7
• Insert Custom Table: F8
• Toggle Full Screen: F11
• Import: Ctrl+I
• Export: Ctrl+Shift+E
• Print: Ctrl+P

Navigation:
• Use arrow keys to navigate through notes in sidebar
• Use Tab to indent list items
• Use Shift+Tab to outdent list items`
            });
          }
        },
        { type: 'separator' },
        {
          label: "What's New",
          click: () => {
            showWhatsNewDialog(mainWindow);
          }
        },
        {
          label: 'Check for Updates',
          click: () => {
            checkForUpdates('manual');
          }
        },
        {
          label: 'Report a Bug',
          click: async () => {
            const url = getBugReportUrl();
            if (url) {
              await shell.openExternal(url);
              return;
            }
            const version = getAppVersionSafe();
            const subject = encodeURIComponent(`Archive Notes bug report (v${version})`);
            const body = encodeURIComponent(
              `Please describe the issue and include steps to reproduce.\n\n` +
              `Version: ${version}\n` +
              `OS: ${process.platform} ${process.getSystemVersion ? process.getSystemVersion() : ''}\n`
            );
            await shell.openExternal(`mailto:cjmatheu31@outlook.com?subject=${subject}&body=${body}`);
          }
        },
        {
          label: 'Licenses',
          click: async () => {
            const licensePath = resolveBundledTextFile('LICENSE.txt');
            // Prefer showing the file in its folder if it exists.
            if (fs.existsSync(licensePath)) {
              shell.showItemInFolder(licensePath);
              return;
            }
            // Fallback: open the resources folder (may vary in dev).
            await shell.openPath(process.resourcesPath || __dirname);
          }
        },
        { type: 'separator' },
        {
          label: 'About',
          accelerator: 'F1',
          click: () => {
            const version = getAppVersionSafe();
            const copyright = formatCopyright(2025);
            dialog.showMessageBox({
              type: 'none',
              title: 'About',
              message: `Archive Notes ${EDITION_LABEL}\nVersion ${version}`,
              detail:
`Offline desktop note-taking app with Markdown and LaTeX support. Includes hierarchical organization, a built-in symbol insertion tool, a built-in table builder, and much more.

${copyright} Carson Matheu. All rights reserved.
`
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // Disallow window.open popups
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Prevent navigation out of our app
  mainWindow.webContents.on('will-navigate', (e) => {
    e.preventDefault();
  });
}

app.whenReady().then(() => {
  createWindow();
  initAutoUpdater();
  checkForUpdates('startup');
  maybeShowWhatsNewOnUpdate().catch(() => {
    // ignore
  });
});

// Flush any pending saves before quitting
let isQuitting = false;
app.on('before-quit', (event) => {
  if (isQuitting) return; // Already handling quit
  if (mainWindow && !mainWindow.isDestroyed()) {
    isQuitting = true;
    // Trigger save flush in renderer (beforeunload will also handle it, but this ensures it happens)
    mainWindow.webContents.executeJavaScript(`
      if (typeof __saveTimer !== 'undefined' && __saveTimer) {
        clearTimeout(__saveTimer);
        __saveTimer = null;
      }
      if (typeof saveAppDataImmediate === 'function') {
        saveAppDataImmediate();
      }
    `).catch(() => {
      // ignore
    });
    // Small delay to allow IPC save to complete
    setTimeout(() => {
      isQuitting = false;
      app.quit();
    }, 150);
    event.preventDefault();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Save data to main.json
ipcMain.handle('save-data', async (event, data) => {
  try {
    const filePath = path.join(app.getPath('userData'), 'main.json');
    await fs.promises.writeFile(filePath, JSON.stringify(data), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Load data from main.json (fallback to legacy notes-data.json)
ipcMain.handle('load-data', async () => {
  try {
    const mainPath = path.join(app.getPath('userData'), 'main.json');
    const legacyPath = path.join(app.getPath('userData'), 'notes-data.json');
    if (fs.existsSync(mainPath)) {
      const data = await fs.promises.readFile(mainPath, 'utf-8');
      return { success: true, data: JSON.parse(data) };
    }
    if (fs.existsSync(legacyPath)) {
      const data = await fs.promises.readFile(legacyPath, 'utf-8');
      return { success: true, data: JSON.parse(data) };
    }
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Export notes
ipcMain.handle('export-notes', async (event, data) => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('documents'), 'notes-backup.json'),
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (filePath) {
      await fs.promises.writeFile(filePath, JSON.stringify(data), 'utf-8');
      return { success: true };
    }
    return { success: false, error: 'Export cancelled' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Import notes
ipcMain.handle('import-notes', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (filePaths && filePaths[0]) {
      const data = await fs.promises.readFile(filePaths[0], 'utf-8');
      return { success: true, data: JSON.parse(data) };
    }
    return { success: false, error: 'Import cancelled' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});