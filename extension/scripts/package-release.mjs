import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionDir, '..');

function parseArgs(argv) {
  const args = {
    browser: 'chrome-mv3',
    outDir: path.join(repoRoot, 'extension-package'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--browser' && argv[i + 1]) {
      args.browser = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--out' && argv[i + 1]) {
      const out = argv[i + 1];
      args.outDir = path.isAbsolute(out) ? out : path.resolve(process.cwd(), out);
      i += 1;
    }
  }
  return args;
}

async function ensureExists(targetPath, message) {
  try {
    await fs.access(targetPath);
  } catch {
    throw new Error(message);
  }
}

async function main() {
  const { browser, outDir } = parseArgs(process.argv.slice(2));
  const sourceDir = path.join(extensionDir, '.output', browser);
  const manifestPath = path.join(sourceDir, 'manifest.json');

  await ensureExists(
    manifestPath,
    `Build output not found for "${browser}". Run: pnpm --dir extension run build:${browser.replace('-mv3', '')}`,
  );

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(outDir), { recursive: true });
  await fs.cp(sourceDir, outDir, { recursive: true });

  console.log(
    `Extension package prepared from .output/${browser} at ${path.relative(repoRoot, outDir) || outDir}`,
  );
}

await main();
