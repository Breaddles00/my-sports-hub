// CI only (Tauri build): stamps src-tauri/tauri.conf.json with MAJOR.MINOR.<GitHub run number>.
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'src-tauri/tauri.conf.json';
const conf = JSON.parse(readFileSync(path, 'utf8'));
const [major, minor] = conf.version.split('.');
const run = process.env.GITHUB_RUN_NUMBER;
if (!run) throw new Error('GITHUB_RUN_NUMBER is not set');
conf.version = `${major}.${minor}.${run}`;
writeFileSync(path, JSON.stringify(conf, null, 2) + '\n');
console.log(`Version set to ${conf.version}`);
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `version=${conf.version}\n`, { flag: 'a' });
