import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(__dirname, '..');
const chromeOutDir = path.join(extensionDir, 'dist', 'chrome-mv3');

async function main() {
  const backgroundSrc = path.join(chromeOutDir, 'background.js');
  const backgroundDest = path.join(extensionDir, 'dist', 'background.js');

  await fs.mkdir(path.dirname(backgroundDest), { recursive: true });
  await fs.copyFile(backgroundSrc, backgroundDest);

  console.log('Synced legacy artifact: dist/background.js');
}

await main();
