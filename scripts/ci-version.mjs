// CI only: stamps package.json (which src-tauri/tauri.conf.json reads its version from) with
// MAJOR.MINOR.<GitHub run number>, so every push to main is newer than the last.
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'package.json';
const pkg = JSON.parse(readFileSync(path, 'utf8'));
const [major, minor] = pkg.version.split('.');
const run = process.env.GITHUB_RUN_NUMBER;
if (!run) throw new Error('GITHUB_RUN_NUMBER is not set');
pkg.version = `${major}.${minor}.${run}`;
writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version set to ${pkg.version}`);
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `version=${pkg.version}\n`, { flag: 'a' });
