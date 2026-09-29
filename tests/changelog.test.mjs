import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseIndex, parseChangelog, makeRelease } from '../scripts/changelog.mjs';

test('索引の参照リンクを使用し、リンクのない古いバージョンを飛ばす', () => {
  const releases = parseIndex('## 📦 [4.11] - 🗓️ 2025-09-20\r\n## 📦 [4.10] - 🗓️ 2025-08-24\r\n[4.11]: ./changelogs/CHANGELOG-ATM10-4.7-4.11.md\r\n');
  assert.deepEqual(releases, [{ version: '4.11', date: '2025-09-20', path: 'changelogs/CHANGELOG-ATM10-4.7-4.11.md' }]);
});
test('壊れた索引や最新リンク欠落で黙って旧版を選ばない', () => {
  assert.throws(() => parseIndex('error page'));
  assert.throws(() => parseIndex('## 📦 [9.0] - 🗓️ 2026-10-01\n## 📦 [8.2] - 🗓️ 2026-09-22\n[8.2]: ./changelogs/CHANGELOG-ATM10-8.1-8.2.md'));
});
const fixture = `# Changelog
## 📰 General changes and notes
<blockquote>
- Fix a recipe</blockquote>
## 🛠️ Mods
<details open>
<summary>Added (1)</summary>
- Example (1.0)
</details>
<details>
<summary>Updated (1)</summary>
- Other Mod (1.0) -> (2.0)
</details>
## 🍳 Recipes
<details><summary>Added (999)</summary></details>`;
test('Modセクションとレシピ差分を区別し、省略されたRemovedを0件にする', () => {
  const result = parseChangelog(fixture);
  assert.deepEqual(result.commits, ['Fix a recipe']);
  assert.deepEqual(result.mods, { added: ['Example (1.0)'], updated: ['Other Mod (1.0) -> (2.0)'], removed: [] });
  assert.equal(result.recipes.added, 999);
  assert.equal(result.sourceHash.length, 64);
});
test('Modリスト件数不一致と形式変更を検出', () => {
  assert.throws(() => parseChangelog(fixture.replace('Added (1)', 'Added (2)')));
  assert.throws(() => parseChangelog('a new format'));
});
test('未翻訳・原文変更時は要約を公開しない', () => {
  const source = { version: '1.0', sourceHash: 'abc' };
  assert.equal(makeRelease(source).status, 'pending');
  const stale = makeRelease(source, { sourceHash: 'old', title: 'Old text' });
  assert.equal(stale.status, 'stale');
  assert.equal(stale.translation, null);
});
test('要約の根拠が原文にない場合はビルドを拒否', () => {
  assert.throws(() => makeRelease({ sourceHash: 'abc', commits: ['Fix a recipe'] }, { sourceHash: 'abc', title: '修正', summary: '説明', items: [{ category: 'fix', text: '変更', evidence: 'Invented change' }] }));
});
test('コミット説明がない版は公式Mod差分を根拠にできる', () => {
  const source = { version: '1.0', sourceHash: 'abc', commits: [], mods: { added: ['Example (1.0)'], updated: [], removed: [] } };
  const translation = { sourceHash: 'abc', title: 'Exampleを追加', summary: '説明', items: [{ category: 'feature', text: 'Exampleを追加。', evidence: 'Example (1.0)' }] };
  assert.equal(makeRelease(source, translation).status, 'translated');
});
test('公開データは要約と原文の対応を検証でき、公式の固定リンクを持つ', async () => {
  const { releases } = JSON.parse(await readFile(new URL('../content/sources.json', import.meta.url), 'utf8'));
  const translations = JSON.parse(await readFile(new URL('../content/ja.json', import.meta.url), 'utf8'));
  for (const source of releases) {
    const result = makeRelease(source, translations[source.version]);
    assert.equal(result.status, 'translated');
    assert.equal('commits' in result, false);
    assert.match(source.sourceUrl, /^https:\/\/github\.com\/AllTheMods\/ATM-10\/blob\/[a-f0-9]{40}\/changelogs\//);
    for (const key of ['added', 'updated', 'removed']) assert.ok(Array.isArray(source.mods[key]));
  }
});
