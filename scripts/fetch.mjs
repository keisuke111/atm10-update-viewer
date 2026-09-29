import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { parseIndex, parseChangelog } from './changelog.mjs';

const requestedRange = process.argv[2] ?? '3';
const fetchAll = requestedRange === 'all';
const limit = fetchAll ? Number.POSITIVE_INFINITY : Number(requestedRange);
if (!fetchAll && (!Number.isInteger(limit) || limit < 1)) {
  throw Error('取得件数は1以上の整数、または all で指定してください: npm run fetch -- all');
}
async function get(url, json = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'atm10-update-viewer', ...(process.env.GITHUB_TOKEN && url.startsWith('https://api.github.com/') ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) } });
  if (!response.ok) throw Error(`取得失敗 (${response.status}): ${url}`);
  return json ? response.json() : response.text();
}
// Pin every file to one commit so the index and detail files cannot drift mid-fetch.
const { sha } = await get('https://api.github.com/repos/AllTheMods/ATM-10/commits/main', true);
if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('公式コミットIDを取得できませんでした。');
const rawRoot = `https://raw.githubusercontent.com/AllTheMods/ATM-10/${sha}/`;
const available = parseIndex(await get(`${rawRoot}CHANGELOG.md`));
const index = fetchAll ? available : available.slice(0, limit);
if (!index.length) throw Error('公式索引に参照可能なChangelogがありません。');
console.log(`公式索引の参照可能なChangelog ${available.length}件中、${index.length}件を取得します。`);
const incoming = [];
for (const release of index) {
  if (!/^changelogs\/CHANGELOG-ATM10-[\d.]+-[\d.]+\.md$/.test(release.path)) throw Error('想定外のChangelogパスです。');
  const parsed = parseChangelog(await get(rawRoot + release.path));
  incoming.push({ ...release, ...parsed, sourceCommit: sha, sourceUrl: `https://github.com/AllTheMods/ATM-10/blob/${sha}/${release.path}` });
  console.log(`${release.version}: 追加 ${parsed.mods.added.length} / 更新 ${parsed.mods.updated.length} / 削除 ${parsed.mods.removed.length}`);
}
let previous = { releases: [] };
try { previous = JSON.parse(await readFile('content/sources.json', 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const byVersion = new Map(previous.releases.map(r => [r.version, r]));
for (const release of incoming) byVersion.set(release.version, release);
const releases = [...byVersion.values()].sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }));
await mkdir('content', { recursive: true });
// Only replace the previous snapshot after every request and parser check succeeds.
await writeFile('content/sources.json.tmp', JSON.stringify({ checkedAt: new Date().toISOString(), releases }, null, 2) + '\n');
await rename('content/sources.json.tmp', 'content/sources.json');
console.log('取得完了。日本語要約を編集後、npm run build でサイトに反映してください。');
