import { createModel, compareVersions, transitionOf, mentionedMods } from './comparison.js';

const $ = selector => document.querySelector(selector);
const node = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
const button = (text, className, action) => {
  const el = node('button', className, text);
  el.type = 'button';
  el.addEventListener('click', action);
  return el;
};
const link = (text, href) => {
  const el = node('a', 'source-link', text);
  el.href = href;
  el.target = '_blank';
  el.rel = 'noopener noreferrer';
  return el;
};
const statuses = {
  added: { label: '追加', symbol: '+' }, updated: { label: '更新', symbol: '↑' },
  removed: { label: '削除', symbol: '−' }, unchanged: { label: '変更なし', symbol: '=' },
  unknown: { label: '確認不可', symbol: '?' }
};
const categories = { feature: '追加・便利機能', fix: '修正・改善', balance: 'バランス調整', other: 'その他' };
const statusText = release => release.status === 'stale' ? '原文更新・日本語要約を再確認中' : '日本語要約を準備中';
const translationOf = release => release.status === 'translated' ? release.translation : null;
const versionText = value => value === null ? '未導入' : value === undefined ? '確認不可' : value;
const badge = status => node('span', 'status-badge ' + status, statuses[status].symbol + ' ' + statuses[status].label);
let data, model, comparison, visibleRows = [], notes = [], highlights = [];
let activeFilter = 'all', selection = null, returnFocus = null;

function showNotice(text) {
  $('#notice').hidden = !text;
  $('#notice').textContent = text;
}
function markSelection() {
  for (const row of $('#mod-rows').children) {
    const active = selection?.type === 'mod' && selection.name === row.dataset.name;
    row.classList.toggle('selected', active);
    row.querySelector('button').setAttribute('aria-expanded', String(active));
  }
}
function openPanel(type, name) {
  if ($('#inspector').hidden) returnFocus = document.activeElement;
  selection = { type, name };
  $('#inspector').hidden = false;
  $('#workbench').classList.add('with-detail');
  $('#detail-body').replaceChildren();
  $('#inspector').scrollTop = 0;
  markSelection();
}
function focusPanel() {
  $('#close-detail').focus({ preventScroll: true });
}
function closePanel(restore = true) {
  $('#inspector').hidden = true;
  $('#workbench').classList.remove('with-detail');
  selection = null;
  markSelection();
  if (restore) {
    const target = returnFocus?.isConnected ? returnFocus : $('#comparison');
    target.focus({ preventScroll: true });
  }
}
function versionsBlock(row) {
  const block = node('div', 'detail-versions');
  for (const [index, side] of [[0, [comparison.from, row.before]], [1, [comparison.to, row.after]]]) {
    if (index) block.append(node('span', '', '→'));
    const cell = node('div');
    cell.append(node('small', '', (index ? '比較先 ' : '比較元 ') + side[0]), node('code', '', versionText(side[1])));
    block.append(cell);
  }
  return block;
}
function evidencePair(text, raw, release, index, section = 'コミット履歴') {
  const pair = node('section', 'evidence-pair');
  const number = String(index).padStart(2, '0');
  pair.append(node('span', 'evidence-label', number + ' / 日本語説明'), node('p', 'explanation', text));
  pair.append(node('span', 'source-label', number + ' / 対応する公式原文 · ' + release.version + ' · ' + section));
  const quote = node('blockquote', '', raw);
  quote.cite = release.sourceUrl;
  pair.append(quote, link(release.version + ' の公式Changelog ↗', release.sourceUrl));
  return pair;
}
function describeEvent(event) {
  if (event.kind === 'added') return event.name + ' が追加されました（' + event.after + '）。';
  if (event.kind === 'removed') return event.name + ' が削除されました（削除前 ' + event.before + '）。';
  return event.name + ' が ' + event.before + ' から ' + event.after + ' に更新されました。';
}
function modDetail(name, focus = true) {
  const row = comparison.rows.find(item => item.name === name);
  if (!row) return;
  openPanel('mod', name);
  const body = $('#detail-body');
  body.append(node('span', 'detail-context', comparison.from + ' → ' + comparison.to + ' / Modバージョン差分'), node('h2', '', name), badge(row.status), versionsBlock(row));
  if (row.status === 'unchanged') {
    body.append(node('p', 'explanation', '比較元と比較先のModバージョンは同じです。設定やレシピまで変更がないことを意味しません。'));
  } else if (row.status === 'unknown') {
    body.append(node('p', 'explanation', '片側の状態を確認できないため、追加・削除などを判定していません。'));
  } else {
    const descriptions = {
      added: '比較元では未導入で、比較先には含まれています。',
      removed: '比較元に含まれ、比較先では削除されています。',
      updated: '比較元と比較先でModバージョンが変わっています。'
    };
    body.append(node('p', 'explanation', descriptions[row.status]));
  }
  body.append(node('p', 'detail-note', '以下は収録した公式記録を日本語で説明したものです。個別Modの機能変更は、バージョン番号だけから推測していません。'));
  if (!row.events.length) {
    body.append(node('p', 'detail-note', 'この比較区間に更新記録はありません。下記の記録と連続した収録履歴からバージョンを確認しています（根拠の記録は比較区間外の場合があります）。'));
  } else if (comparison.from.localeCompare(comparison.to, 'en', { numeric: true }) > 0) {
    body.append(node('p', 'detail-note', '逆方向の比較です。以下の原文は、各リリースが公開されたときの変更方向で示しています。'));
  }
  row.evidence.forEach((event, i) => body.append(evidencePair(describeEvent(event), event.raw, event.release, i + 1, 'Mods / ' + event.kind)));
  const related = highlights.filter(item => mentionedMods(item.evidence, [name]).length);
  if (related.length) {
    body.append(node('h3', '', '原文にこのMod名が登場する主な変更'));
    related.forEach(item => body.append(highlightButton(item)));
    body.append(node('p', 'detail-note', '名称の一致による参照です。Mod更新と設定変更の因果関係を示すものではありません。'));
  }
  const index = visibleRows.findIndex(item => item.name === name);
  if (index >= 0) {
    const nav = node('div', 'detail-nav');
    for (const [delta, label] of [[-1, '← 前のMod'], [1, '次のMod →']]) {
      const next = visibleRows[index + delta];
      const control = button(label, 'outline-button', () => {
        modDetail(next.name);
        const tr = [...$('#mod-rows').children].find(el => el.dataset.name === next.name);
        tr?.scrollIntoView({ block: 'nearest' });
      });
      control.disabled = !next;
      nav.append(control);
    }
    body.append(nav);
  }
  if (focus) focusPanel();
}
function highlightButton(item) {
  const el = button('', 'highlight-item', () => highlightDetail(item));
  el.append(node('span', 'tag', categories[item.category] || 'その他'), node('span', 'item-text', item.text), node('span', '', '→'));
  return el;
}
function renderHighlightPreview() {
  const previous = $('#overview-copy').querySelector('.overview-highlights');
  previous?.remove();
  if (!highlights.length) {
    $('#highlights-button').hidden = true;
    return;
  }
  const preview = node('div', 'overview-highlights');
  preview.append(node('h3', '', '主な変更'));
  const list = node('ul');
  const previewItems = [];
  if (notes.length > 1) {
    for (const release of notes) {
      const item = highlights.find(candidate => candidate.release === release);
      if (item) previewItems.push(item);
      if (previewItems.length === 3) break;
    }
  }
  for (const item of highlights) {
    if (previewItems.length === 3) break;
    if (!previewItems.includes(item)) previewItems.push(item);
  }
  for (const item of previewItems) {
    const entry = node('li');
    const control = button('', 'overview-highlight', () => highlightDetail(item));
    if (notes.length > 1) control.append(node('span', 'preview-version', item.release.version));
    control.append(node('span', '', item.text), node('span', 'preview-arrow', '→'));
    entry.append(control);
    list.append(entry);
  }
  preview.append(list);
  $('#overview-copy').append(preview);
  const remaining = Math.max(0, highlights.length - 3);
  $('#highlights-button').hidden = false;
  $('#highlights-button').textContent = remaining ? `残り${remaining}件を見る →` : '主な変更を見る →';
}
function highlightDetail(item) {
  openPanel('highlight', item.id);
  const body = $('#detail-body');
  body.append(button('← 要約・主な変更に戻る', 'text-button', () => notesDetail()));
  body.append(node('h2', '', '主な変更'), node('span', 'detail-context', item.release.version + ' / ' + item.release.date));
  body.append(node('p', '', categories[item.category] || 'その他'));
  body.append(evidencePair(item.text, item.evidence, item.release, 1));
  body.append(node('h3', '', '原文に記載されたMod'));
  const names = mentionedMods(item.evidence, comparison.rows.map(row => row.name));
  if (names.length) {
    names.forEach(name => {
      const row = comparison.rows.find(row => row.name === name);
      body.append(button(name + ' ↗', 'mod-link', () => modDetail(name)));
      body.append(versionsBlock(row));
    });
    body.append(node('p', 'detail-note', 'バージョンは選択中の2版の比較です。この主要変更だけに起因する差分ではありません。'));
  } else {
    body.append(node('p', 'detail-note', '収録Mod名との完全一致を確認できません。対象名は上の日本語説明・原文で確認してください。旧・新バージョンは推測していません。'));
  }
  focusPanel();
}
function notesDetail(focus = true) {
  openPanel('notes');
  const body = $('#detail-body');
  body.append(node('h2', '', '日本語要約と主な変更'));
  body.append(node('p', 'detail-note', '各リリースの公開時点の説明です。複数版の比較では途中の変更も含み、最終的なMod構成差分とは一致しない場合があります。'));
  for (const release of notes) {
    const trans = translationOf(release);
    const section = node('section', 'release-summary');
    section.append(node('h3', '', release.version + ' · ' + release.date), node('p', '', trans?.summary || statusText(release)), link('公式Changelog ↗', release.sourceUrl));
    if (trans) section.append(...highlights.filter(item => item.release === release).map(highlightButton));
    body.append(section);
  }
  if (!notes.length) body.append(node('p', 'detail-note', 'このバージョンの日本語要約は未収録です。'));
  if (focus) focusPanel();
}
function sourcesDetail() {
  openPanel('sources');
  const body = $('#detail-body');
  body.append(node('h2', '', '公式Changelog'), node('p', 'detail-note', '取得時のコミットに固定した公式リンクです。途中の変更や掲載外のレシピ差分も確認できます。'));
  for (const release of notes) {
    const t = transitionOf(release);
    const section = node('section', 'release-summary');
    section.append(link(t.from + ' → ' + t.to + ' の公式Changelog ↗', release.sourceUrl), node('p', '', release.date + ' 公開'));
    body.append(section);
  }
  if (!notes.length) body.append(link('公式Changelogの索引 ↗', 'https://github.com/AllTheMods/ATM-10/blob/main/CHANGELOG.md'));
  focusPanel();
}
function renderFilters() {
  const filters = [['all', 'すべて', comparison.rows.length], ...Object.entries(statuses).filter(([key]) => key !== 'unknown' || comparison.counts.unknown).map(([key, meta]) => [key, meta.symbol + ' ' + meta.label, comparison.counts[key]])];
  $('#filters').replaceChildren(...filters.map(([key, label, count]) => {
    const control = button('', 'filter ' + key, () => {
      activeFilter = key;
      if (key === 'unchanged') $('#diff-only').checked = false;
      renderRows();
      [...$('#filters').children].find(el => el.dataset.filter === key)?.focus({ preventScroll: true });
    });
    control.dataset.filter = key;
    control.setAttribute('aria-pressed', String(key === activeFilter));
    control.disabled = count === 0;
    if (!count) control.title = 'この比較には該当するModがありません';
    control.append(node('span', '', label), node('span', 'count', String(count)));
    return control;
  }));
}
function renderRows() {
  const query = $('#mod-search').value.trim().toLocaleLowerCase();
  visibleRows = comparison.rows.filter(row =>
    row.name.toLocaleLowerCase().includes(query) &&
    (!$('#diff-only').checked || row.status !== 'unchanged') &&
    (activeFilter === 'all' || activeFilter === row.status));
  if ($('#sort').value === 'status') {
    const order = ['added', 'updated', 'removed', 'unchanged', 'unknown'];
    visibleRows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  }
  renderFilters();
  $('#mod-rows').replaceChildren(...visibleRows.map(row => {
    const tr = node('tr');
    tr.dataset.name = row.name;
    const th = node('th'); th.scope = 'row';
    const control = button(row.name, 'row-name', () => modDetail(row.name));
    control.setAttribute('aria-controls', 'inspector');
    control.setAttribute('aria-expanded', 'false');
    const openMark = node('span', 'row-open', '↗');
    openMark.setAttribute('aria-hidden', 'true');
    control.append(openMark);
    th.append(control); tr.append(th);
    for (const [index, value] of [row.before, row.after].entries()) {
      const td = node('td', index ? 'after-cell' : 'before-cell');
      td.append(node('span', value == null ? 'version-missing' : '', versionText(value)));
      tr.append(td);
    }
    const status = node('td'); status.append(badge(row.status)); tr.append(status);
    tr.addEventListener('click', event => { if (!event.target.closest('button')) modDetail(row.name); });
    return tr;
  }));
  $('#result-count').textContent = visibleRows.length + ' / ' + comparison.rows.length + '件を表示';
  $('#reset-filters').hidden = !query && activeFilter === 'all';
  $('#empty').hidden = !!visibleRows.length;
  $('#empty').textContent = query ? '一致するModはありません。名前や絞り込み条件を変えてください。未収録のModもあります。' : 'この条件に該当するModはありません。「差分だけ表示」や変更種別を確認してください。';
  if (selection?.type === 'mod') {
    if (!visibleRows.some(row => row.name === selection.name)) closePanel(false);
    else modDetail(selection.name, false);
  }
  markSelection();
}
function rebuild() {
  closePanel(false);
  const from = $('#from-version').value, to = $('#to-version').value;
  try { comparison = compareVersions(model, from, to); }
  catch (error) {
    comparison = { from, to, rows: [], counts: { added: 0, updated: 0, removed: 0, unchanged: 0, unknown: 0 }, path: [] };
    showNotice(error.message);
    notes = []; highlights = [];
    $('#overview-copy').replaceChildren(node('h2', '', '比較できない組み合わせです'));
    $('#range-label').textContent = '履歴が未収録';
    $('#highlights-button').hidden = true;
    updateComparisonHeader(); renderRows(); return;
  }
  const reverse = from.localeCompare(to, 'en', { numeric: true }) > 0;
  showNotice(from === to ? '同じバージョンを比較しています。Modバージョンの差分はありません。' : reverse ? '新しい版から古い版への比較です。追加・削除はこの比較方向で表示し、日本語要約と原文は公開時の方向で表示します。' : '');
  notes = comparison.path.map(edge => edge.release);
  if (!notes.length) notes = model.releases.filter(release => release.version === to);
  highlights = notes.flatMap(release => (translationOf(release)?.items || []).map((item, i) => ({ ...item, release, id: release.version + '-' + i })));
  if (activeFilter !== 'all' && !comparison.counts[activeFilter]) activeFilter = 'all';
  $('#range-label').textContent = comparison.path.length + '回の更新を比較';
  const copy = $('#overview-copy'); copy.replaceChildren();
  if (notes.length === 1) {
    const trans = translationOf(notes[0]);
    copy.append(node('h2', '', notes[0].version + ' · ' + (trans?.title || statusText(notes[0]))), node('p', '', trans?.summary || 'Mod比較と公式原文は引き続き確認できます。'));
  } else if (notes.length) {
    copy.append(node('h2', '', from + ' → ' + to + ' / ' + notes.length + 'リリースの更新'));
    copy.append(node('p', '', notes.map(release => release.version + '：' + (translationOf(release)?.title || statusText(release))).join(' ／ ')));
  } else copy.append(node('h2', '', '日本語要約は未収録です'));
  renderHighlightPreview();
  updateComparisonHeader();
  renderRows();
  $('#table-scroll').scrollTop = 0;
}
function updateComparisonHeader() {
  document.title = comparison.from + ' → ' + comparison.to + ' | ATM10 Update Viewer';
  $('#total-label').textContent = '履歴で確認できる ' + comparison.rows.length + ' Mods';
  for (const side of ['from', 'to']) {
    const release = model.releases.find(item => item.version === comparison[side]);
    const date = $('#' + side + '-date');
    date.textContent = release ? release.date.replaceAll('-', '.') + ' 公開' : '収録範囲の起点';
    if (release) date.dateTime = release.date;
    else date.removeAttribute('datetime');
  }
  $('#before-heading').replaceChildren(node('span', '', '比較元'), node('span', 'column-version', comparison.from));
  $('#after-heading').replaceChildren(node('span', '', '比較先'), node('span', 'column-version', comparison.to));
}
function applyHash() {
  const hash = location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const latest = model.releases[0], initial = transitionOf(latest);
  let from = params.get('from'), to = params.get('to');
  const legacy = model.releases.find(release => release.version === hash);
  if (legacy) ({ from, to } = transitionOf(legacy));
  const invalid = hash && !legacy && (!model.versions.includes(from) || !model.versions.includes(to));
  $('#from-version').value = model.versions.includes(from) ? from : initial.from;
  $('#to-version').value = model.versions.includes(to) ? to : initial.to;
  rebuild();
  if (invalid) showNotice('指定の比較は未収録です。最新掲載版の比較を表示しています。');
}
function navigateVersions() {
  const hash = new URLSearchParams({ from: $('#from-version').value, to: $('#to-version').value }).toString();
  if (location.hash.slice(1) === hash) rebuild();
  else location.hash = hash;
}

$('#close-detail').addEventListener('click', () => closePanel());
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#inspector').hidden) closePanel(); });
$('#highlights-button').addEventListener('click', () => notesDetail());
$('#source-button').addEventListener('click', sourcesDetail);
$('#mod-search').addEventListener('input', renderRows);
$('#sort').addEventListener('change', renderRows);
$('#diff-only').addEventListener('change', () => {
  if ($('#diff-only').checked && activeFilter === 'unchanged') activeFilter = 'all';
  renderRows();
});
$('#reset-filters').addEventListener('click', () => {
  $('#mod-search').value = ''; activeFilter = 'all'; $('#diff-only').checked = false; renderRows(); $('#mod-search').focus();
});
$('#from-version').addEventListener('change', navigateVersions);
$('#to-version').addEventListener('change', navigateVersions);
$('#swap').addEventListener('click', () => {
  const old = $('#from-version').value;
  $('#from-version').value = $('#to-version').value;
  $('#to-version').value = old;
  navigateVersions();
});

try {
  const response = await fetch('./data/releases.json');
  if (!response.ok) throw Error('HTTP ' + response.status);
  data = await response.json();
  if (!data.releases?.length) throw Error('更新データがありません。');
  model = createModel(data.releases);
  for (const selector of ['#from-version', '#to-version']) {
    $(selector).replaceChildren(...[...model.versions].reverse().map(version => {
      const option = node('option', '', version); option.value = version; return option;
    }));
  }
  $('#checked-at').textContent = '取得確認：' + new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(data.checkedAt)) + ' JST';
  $('#loading').hidden = true;
  $('#viewer').hidden = false;
  applyHash();
  window.addEventListener('hashchange', applyHash);
} catch (error) {
  console.error(error);
  $('#viewer').hidden = true;
  const loading = $('#loading');
  loading.hidden = false; loading.setAttribute('role', 'alert');
  loading.replaceChildren(node('h1', '', '比較データを読み込めませんでした'), node('p', '', error.message), node('p', '', '通信状態を確認してください。ローカルでは npm start で起動できます。'), button('再読み込み', 'outline-button', () => location.reload()), link('公式Changelogを見る ↗', 'https://github.com/AllTheMods/ATM-10/blob/main/CHANGELOG.md'));
}

