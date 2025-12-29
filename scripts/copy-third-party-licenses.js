const fs = require('fs');
const path = require('path');

/**
 * Copies license/notice files from node_modules into ./third_party_licenses
 * so the packaged app can ship the *actual* upstream texts verbatim.
 */

const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'third_party_licenses');

const mappings = [
  {
    name: 'electron',
    // Prefer top-level LICENSE if present.
    candidates: [
      path.join(projectRoot, 'node_modules', 'electron', 'LICENSE'),
      path.join(projectRoot, 'node_modules', 'electron', 'dist', 'LICENSE'),
    ],
    outName: 'electron-LICENSE',
  },
  {
    name: 'dompurify',
    candidates: [path.join(projectRoot, 'node_modules', 'dompurify', 'LICENSE')],
    outName: 'dompurify-LICENSE',
  },
  {
    name: 'marked',
    candidates: [path.join(projectRoot, 'node_modules', 'marked', 'LICENSE.md')],
    outName: 'marked-LICENSE.md',
  },
  {
    name: 'mathjax',
    candidates: [path.join(projectRoot, 'node_modules', 'mathjax', 'LICENSE')],
    outName: 'mathjax-LICENSE',
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFirstExisting(candidates, destPath) {
  for (const src of candidates) {
    if (fs.existsSync(src) && fs.statSync(src).isFile()) {
      fs.copyFileSync(src, destPath);
      return src;
    }
  }
  return null;
}

function main() {
  ensureDir(outDir);

  const results = [];
  for (const m of mappings) {
    const destPath = path.join(outDir, m.outName);
    const used = copyFirstExisting(m.candidates, destPath);
    results.push({ package: m.name, copiedFrom: used, copiedTo: destPath });
  }

  const missing = results.filter((r) => !r.copiedFrom);
  if (missing.length) {
    console.warn('Some third-party license files could not be found:');
    for (const r of missing) {
      console.warn(`- ${r.package}: expected one of: ${mappings.find(m => m.name === r.package).candidates.join(', ')}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Third-party license files copied:');
    for (const r of results) {
      console.log(`- ${r.package}: ${path.relative(projectRoot, r.copiedFrom)} -> ${path.relative(projectRoot, r.copiedTo)}`);
    }
  }
}

main();

