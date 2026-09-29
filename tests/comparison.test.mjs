import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createModel, compareVersions, parseMod, mentionedMods } from '../comparison.js';

const release = (from, to, mods = {}) => ({ version: to, path: `changelogs/CHANGELOG-ATM10-${from}-${to}.md`, mods: { added: [], updated: [], removed: [], ...mods } });

test('実データの隣接比較は公式の追加・更新・削除件数と一致する', async () => {
  const data = JSON.parse(await readFile(new URL('../data/releases.json', import.meta.url), 'utf8'));
  const model = createModel(data.releases);
  for (const edge of model.edges) {
    const comparison = compareVersions(model, edge.from, edge.to);
    for (const kind of ['added', 'updated', 'removed']) assert.equal(comparison.counts[kind], edge.release.mods[kind].length);
    assert.equal(comparison.counts.unknown, 0);
  }
});

test('収録した全履歴は最古版から最新版まで途切れず比較できる', async () => {
  const data = JSON.parse(await readFile(new URL('../data/releases.json', import.meta.url), 'utf8'));
  const model = createModel(data.releases);
  const comparison = compareVersions(model, model.versions[0], model.versions.at(-1));
  assert.equal(model.versions.length, data.releases.length + 1);
  assert.equal(comparison.path.length, data.releases.length);
  assert.equal(comparison.counts.unknown, 0);
});

test('複数版の更新は最初の旧版と最後の新版を比較し、途中の追加は追加のまま', () => {
  const m = createModel([
    release('1.0', '1.1', { updated: ['A (1) -> (2)'], added: ['B (1)'] }),
    release('1.1', '1.2', { updated: ['A (2) -> (3)', 'B (1) -> (2)'] })
  ]);
  const result = compareVersions(m, '1.0', '1.2');
  assert.deepEqual(result.rows.map(r => [r.name, r.before, r.after, r.status]), [['A', '1', '3', 'updated'], ['B', null, '2', 'added']]);
  assert.equal(result.rows[0].events.length, 2);
});

test('比較区間外の記録から変更なしを確認でき、根拠を保持する', () => {
  const m = createModel([release('1', '2', { updated: ['A (1) -> (2)'] }), release('2', '3', { added: ['B (1)'] })]);
  const a = compareVersions(m, '2', '3').rows.find(r => r.name === 'A');
  assert.equal(a.status, 'unchanged');
  assert.equal(a.before, '2');
  assert.equal(a.events.length, 0);
  assert.equal(a.evidence[0].release.version, '2');
});

test('追加後に削除されたModを終点に含めず、途中の履歴は保つ', () => {
  const m = createModel([release('1', '2', { added: ['Temporary (1)'] }), release('2', '3', { removed: ['Temporary (1)'] })]);
  const result = compareVersions(m, '1', '3');
  assert.equal(result.rows.length, 0);
  assert.equal(result.path.length, 2);
});

test('削除・再追加とロールバックで終点が同じなら変更なし', () => {
  const m = createModel([release('1', '2', { removed: ['A (1)'], updated: ['B (1) -> (2)'] }), release('2', '3', { added: ['A (1)'], updated: ['B (2) -> (1)'] })]);
  const result = compareVersions(m, '1', '3');
  assert.equal(result.counts.unchanged, 2);
  assert.ok(result.rows.every(r => r.events.length === 2));
});

test('逆方向では追加と削除が反転し、原文は書き換えない', () => {
  const m = createModel([release('1', '2', { added: ['A (1)'], removed: ['B (2)'], updated: ['C (3) -> (4)'] })]);
  const r = compareVersions(m, '2', '1').rows;
  assert.deepEqual(r.map(x => [x.status, x.before, x.after]), [['removed', '1', null], ['added', null, '2'], ['updated', '4', '3']]);
  assert.equal(r[2].evidence[0].raw, 'C (3) -> (4)');
});

test('同じ版では既知で導入済みのModだけが変更なしになる', () => {
  const m = createModel([release('1', '2', { added: ['A (1)'], removed: ['B (2)'] })]);
  const result = compareVersions(m, '2', '2');
  assert.deepEqual(result.rows.map(r => [r.name, r.status]), [['A', 'unchanged']]);
  assert.equal(result.path.length, 0);
});

test('欠けた履歴を越えて状態を推測しない', () => {
  const m = createModel([release('1', '2', { added: ['A (1)'] }), release('3', '4', { added: ['B (2)'] })]);
  assert.throws(() => compareVersions(m, '1', '4'), /未収録/);
  assert.equal(compareVersions(m, '1', '2').rows.length, 1);
  assert.throws(() => compareVersions(m, '0', '2'), /未収録/);
});

test('矛盾する履歴・不明な形式を静かに誤表示しない', () => {
  assert.throws(() => createModel([release('1', '2', { updated: ['A (1) -> (2)'] }), release('2', '3', { updated: ['A (9) -> (3)'] })]), /一致しません/);
  assert.throws(() => parseMod('Unknown format', 'updated'), /読み取れません/);
});

test('Mod名の照合は単語境界と正規表現記号を尊重する', () => {
  assert.deepEqual(mentionedMods('Fix Create: Copycats+ and Neo Vitae integrations', ['Create: Copycats+', 'Neo Vitae', 'Vita', 'Fixer']), ['Create: Copycats+', 'Neo Vitae']);
});
