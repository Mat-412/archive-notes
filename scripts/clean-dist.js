const fs = require('fs');
const path = require('path');

/**
 * Clean the ./dist output folder before packaging so we don't accumulate
 * multiple installers with different names.
 */

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

function rmIfExists(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch (_e) {
    // ignore
  }
}

rmIfExists(distDir);
fs.mkdirSync(distDir, { recursive: true });
console.log('Cleaned dist/');