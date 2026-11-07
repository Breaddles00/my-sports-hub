// CI only: stamps package.json with MAJOR.MINOR.<GitHub run number> so every push
// produces a newer version that installed copies of the app will update to.
import { readFileSync, writeFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [major, minor] = pkg.version.split('.');
const run = process.env.GITHUB_RUN_NUMBER;
if (!run) throw new Error('GITHUB_RUN_NUMBER is not set');
pkg.version = `${major}.${minor}.${run}`;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version set to ${pkg.version}`);
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `version=${pkg.version}\n`, { flag: 'a' });
