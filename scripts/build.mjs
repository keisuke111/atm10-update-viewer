import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { makeRelease } from './changelog.mjs';

const sources = JSON.parse(await readFile('content/sources.json', 'utf8'));
const translations = JSON.parse(await readFile('content/ja.json', 'utf8'));
const releases = sources.releases.map(source => makeRelease(source, translations[source.version]));
if (!releases.length) throw Error('公開するバージョンがありません。');
await mkdir('data', { recursive: true });
await writeFile('data/releases.json', JSON.stringify({ checkedAt: sources.checkedAt, releases }, null, 2) + '\n');
for (const r of releases) console.log(`${r.version}: ${r.status}`);
