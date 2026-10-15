// Runs TypeDoc over each package's `src/index.ts` and writes the reflection JSON to `data/<slug>.json`.
// Also records the package's version and git branch so the build can link to the right source.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PACKAGES } from './packages.mjs';


const DOCS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(DOCS_ROOT, '..');
const DATA_DIR = path.join(DOCS_ROOT, 'data');


// prefer our own typedoc, fall back to one installed in a sibling package so `npm i` here is optional
async function loadTypedoc() {
  const candidates = [
    path.join(DOCS_ROOT, 'package.json'),
    ...PACKAGES.map((pkg) => path.join(REPO_ROOT, pkg.dir, 'package.json')),
  ];
  for (const candidate of candidates) {
    try {
      const require = createRequire(candidate);
      const resolved = require.resolve('typedoc');
      return await import(resolved);
    } catch (error) {
      continue;
    }
  }
  throw new Error('Could not find typedoc, run `npm install` inside the docs folder.');
}

function gitBranch(cwd) {
  try {
    return execFileSync('git', ['branch', '--show-current'], {cwd, encoding: 'utf8'}).trim() || 'master';
  } catch (error) {
    return 'master';
  }
}


const only = process.argv.slice(2);
const { Application, LogLevel } = await loadTypedoc();
fs.mkdirSync(DATA_DIR, {recursive: true});

for (const pkg of PACKAGES) {
  if (only.length && !only.includes(pkg.slug)) {
    continue;
  }
  const cwd = path.join(REPO_ROOT, pkg.dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const branch = gitBranch(cwd);

  console.log(`[extract] ${pkg.npm}@${manifest.version} (${branch})`);
  const app = await Application.bootstrap({
    entryPoints: [path.join(cwd, 'src', 'index.ts')],
    tsconfig: path.join(cwd, 'tsconfig.json'),
    excludeExternals: true,
    excludePrivate: true,
    gitRevision: branch,
    logLevel: LogLevel.Error,
    readme: 'none',
    skipErrorChecking: true,
    sourceLinkTemplate: `https://github.com/${pkg.repo}/blob/{gitRevision}/{path}#L{line}`,
  });
  const project = await app.convert();
  if (!project) {
    throw new Error(`TypeDoc failed to convert ${pkg.npm}`);
  }

  const json = app.serializer.projectToObject(project, cwd);
  json.__meta = {
    branch,
    description: manifest.description || '',
    license: manifest.license || '',
    name: manifest.name,
    version: manifest.version,
    dependencies: Object.keys(manifest.dependencies || {}),
    peerDependencies: Object.keys(manifest.peerDependencies || {}),
    engines: manifest.engines || null,
  };
  fs.writeFileSync(path.join(DATA_DIR, `${pkg.slug}.json`), JSON.stringify(json));
}

console.log('[extract] done');
