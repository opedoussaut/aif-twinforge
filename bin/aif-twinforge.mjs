#!/usr/bin/env node
// Starts your own aif-twinforge agent for the 3DDashboard widget:
//   npx github:opedoussaut/aif-twinforge
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`aif-twinforge needs Node.js 22.12 or later (you have ${process.versions.node}).`);
  console.error('Install the LTS version from https://nodejs.org and run the command again.');
  process.exit(1);
}
const agent = fileURLToPath(new URL('../server/agent.ts', import.meta.url));
const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), agent], {
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
