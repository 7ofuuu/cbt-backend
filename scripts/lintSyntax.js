const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const targets = ['index.js', 'src', 'scripts', 'prisma/seed.js'];

function collectJsFiles(entryPath, files) {
  const stats = fs.statSync(entryPath);

  if (stats.isDirectory()) {
    const children = fs.readdirSync(entryPath);
    for (const child of children) {
      collectJsFiles(path.join(entryPath, child), files);
    }
    return;
  }

  if (entryPath.endsWith('.js')) {
    files.push(entryPath);
  }
}

function toRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function main() {
  const jsFiles = [];

  for (const target of targets) {
    const fullPath = path.join(rootDir, target);
    if (fs.existsSync(fullPath)) {
      collectJsFiles(fullPath, jsFiles);
    }
  }

  const uniqueFiles = Array.from(new Set(jsFiles)).sort();

  if (uniqueFiles.length === 0) {
    console.log('No JavaScript files found for syntax check.');
    return;
  }

  let hasError = false;

  for (const file of uniqueFiles) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
      console.log(`[OK] ${toRelative(file)}`);
    } catch (error) {
      hasError = true;
      console.error(`[FAIL] ${toRelative(file)}`);
      const output = error.stderr ? error.stderr.toString().trim() : error.message;
      if (output) {
        console.error(output);
      }
    }
  }

  if (hasError) {
    process.exit(1);
  }

  console.log(`Syntax check passed for ${uniqueFiles.length} file(s).`);
}

main();
