import { readFile, writeFile } from 'node:fs/promises';

const sources = JSON.parse(await readFile('content/sources.json', 'utf8'));
const existing = JSON.parse(await readFile('content/ja.json', 'utf8'));
const refresh = process.argv.includes('--refresh');
const curatedVersions = new Set(['8.0', '8.1', '8.2']);
const noise = /^(?:chore\b|merge\b|bump\b|release\b|version\b|modlist\b|changelog\b|co-authored-by:|https?:\/\/|add files via upload|files via upload|misc(?:ellaneous)? fix(?:es)?$|small fix$)|(?:locali[sz]ation|translat(?:e|es|ed|ion|ions)|update(?:d)? (?:the )?(?:mod|modpack) ?list|generated changelog|(?:french|turkish|spanish|portuguese|russian|chinese|korean) (?:text|lang|translation))/i;
const useful = /\b(?:add|allow|blacklist|buff|change|correct|disable|enable|fix|improve|increase|implement|introduce|nerf|prevent|reduce|remove|replace|resolve|rework|update|adjust|quest|recipe|crash|dupe|progression|config)\b/i;

function cleanEvidence(value) {
  return value.replace(/^\s*[*-]\s*/, '').replace(/^(?:feat|fix|build|refactor|style|docs|perf|config)(?:\([^)]*\))?:\s*/i, '').replace(/^(?:fix|feat)\s+#[0-9]+:\s*/i, '').replace(/\s*\(#[0-9]+\)\s*$/, '').trim();
}

function localizeTerms(value) {
  const replacements = [
    [/item duplication/gi, 'アイテム増殖'], [/world generation/gi, 'ワールド生成'], [/progression/gi, '進行'],
    [/compatibility/gi, '互換性'], [/integrations?/gi, '連携'], [/requirements?/gi, '必要条件'],
    [/descriptions?/gi, '説明文'], [/config(?:uration)?/gi, '設定'], [/crafting/gi, 'クラフト'],
    [/recipes?/gi, 'レシピ'], [/quests?/gi, 'クエスト'], [/rewards?/gi, '報酬'],
    [/spawners?/gi, 'スポナー'], [/crash(?:es)?/gi, 'クラッシュ'], [/damage/gi, 'ダメージ'],
    [/output/gi, '出力'], [/issues?/gi, '問題'], [/loot/gi, '戦利品']
  ];
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value).replace(/\s+/g, ' ').trim();
}

function japaneseText(evidence) {
  const clean = cleanEvidence(evidence);
  const patterns = [
    [/^(.+?)\s+Quest Changes$/i, '$1のクエストを変更。'], [/^(.+?)\s+Quest Backports from ATM11$/i, 'ATM11から$1のクエスト変更を移植。'],
    [/^Typos? in (.+)$/i, '$1の誤字を修正。'], [/^Mention (.+) in (?:the )?quest description$/i, 'クエスト説明文に$1を追記。'],
    [/^(.+?)\s+Buff\s*\+\s*(.+?)\s+Nerf$/i, '$1を強化し、$2を弱体化。'],
    [/^(?:add|added|adds)\s+(.+)/i, '$1を追加。'], [/^(?:allow|allowed|allows)\s+(.+)/i, '$1を利用できるように変更。'],
    [/^(?:fix|fixed|fixes|resolve|resolved|correct|corrected)\s+(.+)/i, '$1を修正。'],
    [/^(?:prevent|prevented|prevents)\s+(.+)/i, '$1を防止。'], [/^(?:remove|removed|removes)\s+(.+)/i, '$1を削除。'],
    [/^(?:disable|disabled|disallow|disallowed)\s+(.+)/i, '$1を無効化。'], [/^(?:enable|enabled)\s+(.+)/i, '$1を有効化。'],
    [/^(?:blacklist|blacklisted)\s+(.+)/i, '$1をブラックリストに追加。'], [/^(?:update|updated|updates)\s+(.+)/i, '$1を更新。'],
    [/^(?:adjust|adjusted|change|changed|changes)\s+(.+)/i, '$1を調整。'], [/^(?:reduce|reduced)\s+(.+)/i, '$1を削減。'],
    [/^(?:increase|increased)\s+(.+)/i, '$1を増加。'], [/^(?:improve|improved)\s+(.+)/i, '$1を改善。'],
    [/^(?:nerf|nerfed)\s+(.+)/i, '$1を弱体化。'], [/^(?:buff|buffed)\s+(.+)/i, '$1を強化。'],
    [/^(?:rework|reworked)\s+(.+)/i, '$1を再調整。'], [/^(?:replace|replaced)\s+(.+)/i, '$1を置き換え。'],
    [/^(?:implement|implemented|introduce|introduced)\s+(.+)/i, '$1を実装。']
  ];
  for (const [pattern, replacement] of patterns) if (pattern.test(clean)) return localizeTerms(clean.replace(pattern, replacement));
  return `「${localizeTerms(clean)}」に関する変更。`;
}

function categoryOf(evidence) {
  if (/\b(?:add|added|allow|enable|implement|introduce|new)\b/i.test(evidence)) return 'feature';
  if (/\b(?:fix|fixed|prevent|resolve|correct|crash|dupe|typo|issue)\b/i.test(evidence)) return 'fix';
  if (/\b(?:blacklist|buff|change|disable|nerf|reduce|remove|increase|balance|adjust)\b/i.test(evidence)) return 'balance';
  return 'other';
}

function candidatesOf(release) {
  const seen = new Set();
  return release.commits.map((evidence, index) => ({ evidence, index, clean: cleanEvidence(evidence) }))
    .filter(item => item.clean.length >= 8 && !noise.test(item.clean))
    .filter(item => { const key = item.clean.toLocaleLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
    .map(item => ({ ...item, score: (useful.test(item.clean) ? 4 : 0) + (/#[0-9]+/.test(item.evidence) ? 1 : 0) + (item.clean.length < 150 ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 8);
}

function modName(raw) { return (raw.match(/^(.*?) \(/)?.[1] || raw).replaceAll('_', ' '); }
function modItems(release) {
  const items = [];
  for (const evidence of release.mods.added) items.push({ category: 'feature', text: `${modName(evidence)}を追加。`, evidence });
  for (const evidence of release.mods.updated) {
    const parsed = evidence.match(/^(.*?) \(([^()]*)\) -> \(([^()]*)\)$/);
    items.push({ category: 'other', text: parsed ? `${parsed[1]}を${parsed[2]}から${parsed[3]}へ更新。` : `${modName(evidence)}を更新。`, evidence });
  }
  for (const evidence of release.mods.removed) items.push({ category: 'balance', text: `${modName(evidence)}を削除。`, evidence });
  return items.slice(0, 8);
}
function makeTranslation(release) {
  const candidates = candidatesOf(release);
  const commitItems = candidates.map(({ evidence }) => ({ category: categoryOf(evidence), text: japaneseText(evidence), evidence }));
  const items = [...commitItems, ...modItems(release)].filter((item, index, all) => all.findIndex(other => other.evidence === item.evidence) === index).slice(0, 8);
  if (!items.length) throw Error(`${release.version}: 日本語化できる公式コミットがありません。`);
  const { added, updated, removed } = release.mods;
  const title = added.length ? `${added.slice(0, 2).map(modName).join('と')}を追加` : removed.length ? (updated.length ? `Mod構成の整理と${updated.length}件の更新` : `${removed.length}件のMod削除と構成整理`) : `${updated.length}件のMod更新とゲーム内容の調整`;
  const parts = [];
  if (added.length) parts.push(`Modを${added.length}件追加`);
  if (updated.length) parts.push(`Modを${updated.length}件更新`);
  if (removed.length) parts.push(`Modを${removed.length}件削除`);
  return {
    sourceHash: release.sourceHash,
    title,
    summary: `ATM10 ${release.version}では${parts.length ? parts.join('、') : 'Mod構成を維持'}。公式Changelogから、クエスト、レシピ、設定、不具合修正などの主要な変更を${items.length}件抜粋しています。`,
    items
  };
}

const translations = {};
for (const release of sources.releases) {
  const current = existing[release.version];
  translations[release.version] = current?.sourceHash === release.sourceHash && (!refresh || curatedVersions.has(release.version)) ? current : makeTranslation(release);
}
await writeFile('content/ja.json', JSON.stringify(translations, null, 2) + '\n');
console.log(`${Object.keys(translations).length}バージョンの日本語要約を保存しました。`);
