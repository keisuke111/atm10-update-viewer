import { createHash } from 'node:crypto';

export function parseIndex(markdown) {
  const links = new Map([...markdown.matchAll(/^\[([^\]]+)\]:\s+\.\/(changelogs\/[^\s]+\.md)\s*$/gm)].map(m => [m[1], m[2]]));
  const releases = [...markdown.matchAll(/^##[^\n]*\[([\d.]+)\][^\n]*(\d{4}-\d{2}-\d{2})/gm)]
    .map(m => ({ version: m[1], date: m[2], path: links.get(m[1]) }));
  if (!releases.length || !releases[0].path) throw Error('公式索引の形式が変わりました。最新バージョンのリンクを確認してください。');
  // Some older headings (4.8–4.10) have no corresponding reference link.
  return releases.filter(r => r.path);
}

export function parseChangelog(markdown) {
  const sections = markdown.split(/^## /m).slice(1);
  const general = sections.find(s => s.startsWith('📰 General changes and notes'));
  const modSection = sections.find(s => s.startsWith('🛠️ Mods'));
  if (!general || !modSection) throw Error('公式詳細の形式が変わりました。General / Mods セクションを確認してください。');
  const commits = [...general.matchAll(/^- (.+)$/gm)].map(m => m[1].replace(/<[^>]*>/g, '').trim());
  const mods = { added: [], updated: [], removed: [] };
  for (const m of modSection.matchAll(/<summary>(Added|Updated|Removed) \((\d+)\)<\/summary>([\s\S]*?)<\/details>/g)) {
    const entries = [...m[3].matchAll(/^- (.+)$/gm)].map(line => line[1].trim());
    if (entries.length !== Number(m[2])) throw Error(`Mod件数の不一致: ${m[1]}`);
    mods[m[1].toLowerCase()] = entries;
  }
  if (!Object.values(mods).some(a => a.length)) throw Error('Mod一覧を取得できませんでした。');
  const recipes = {};
  const recipeSection = sections.find(s => s.startsWith('🍳 Recipes')) || '';
  for (const m of recipeSection.matchAll(/<summary>(Added|Updated|Removed) \((\d+)\)<\/summary>/g)) recipes[m[1].toLowerCase()] = Number(m[2]);
  return { sourceHash: createHash('sha256').update(markdown).digest('hex'), commits, mods, recipes };
}

export function makeRelease(source, translation) {
  const status = !translation ? 'pending' : translation.sourceHash === source.sourceHash ? 'translated' : 'stale';
  if (status === 'translated') {
    if (!translation.title || !translation.summary || !translation.items?.length) throw Error(`日本語要約が不完全です: ${source.version}`);
    const officialEvidence = new Set([...source.commits, ...source.mods.added, ...source.mods.updated, ...source.mods.removed]);
    for (const item of translation.items) {
      if (!['feature', 'fix', 'balance', 'other'].includes(item.category) || !item.text || !officialEvidence.has(item.evidence)) {
        throw Error(`日本語要約の分類または根拠を確認してください: ${source.version}`);
      }
    }
  }
  // The browser only needs selected evidence stored in the translation. Keep the
  // complete commit list in the build input instead of republishing it wholesale.
  const { commits, ...publicSource } = source;
  return { ...publicSource, status, translation: status === 'translated' ? translation : null };
}
