// Builds the widget and uploads dist/ to a MinIO bucket that the 3DDashboard can read.
// Usage: node scripts/deploy-minio.mjs [--watch]
// Settings: minio.config.json next to package.json (never committed; see minio.config.example.json).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'minio';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const configFile = join(root, 'minio.config.json');
if (!existsSync(configFile)) {
  console.error('Missing minio.config.json. Copy minio.config.example.json and fill it in.');
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(configFile, 'utf8'));
for (const key of ['endPoint', 'accessKey', 'secretKey', 'bucket', 'publicUrl'])
  if (!cfg[key]) {
    console.error(`minio.config.json: "${key}" is required.`);
    process.exit(1);
  }
const prefix = (cfg.prefix ?? 'aif-twinforge').replace(/^\/+|\/+$/g, '');
const client = new Client({
  endPoint: cfg.endPoint,
  port: cfg.port,
  useSSL: cfg.useSSL ?? true,
  accessKey: cfg.accessKey,
  secretKey: cfg.secretKey,
});
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const files = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

async function upload() {
  const list = files(dist);
  for (const file of list) {
    const key = `${prefix}/${relative(dist, file).replaceAll('\\', '/')}`;
    await client.fPutObject(cfg.bucket, key, file, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
  }
  const url = `${cfg.publicUrl.replace(/\/+$/, '')}/${prefix}/index.html`;
  console.log(`${new Date().toLocaleTimeString()} uploaded ${list.length} files · ${url}`);
}

const watch = process.argv.includes('--watch');
const result = await build({
  root,
  configFile: join(root, 'vite.config.mjs'),
  build: watch ? { watch: {} } : {},
});
if (watch) {
  result.on('event', (e) => {
    if (e.type === 'END') upload().catch((err) => console.error('Upload failed:', err.message));
    if (e.type === 'ERROR') console.error('Build failed:', e.error.message);
  });
  console.log('Watching src/. Each change is rebuilt and uploaded; refresh the widget to load it.');
} else {
  await upload();
}
