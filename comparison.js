// Reconstruct only the Mod identities observed in contiguous changelog data.
export function transitionOf(release) {
  const match = decodeURIComponent(release.path || release.sourceUrl).match(/CHANGELOG-ATM10-([0-9.]+)-([0-9.]+)\.md/i);
  if (!match || match[2] !== release.version) throw Error('バージョン間の対応を確認できません。');
  return { from: match[1], to: match[2] };
}
export function parseMod(raw, kind) {
  const m = raw.match(/^(.*?) \(([^()]*)\)(?: -> \(([^()]*)\))?$/);
  if (!m || (kind === 'updated' && !m[3])) throw Error(`Mod表記を読み取れません：${raw}`);
  return { name: m[1], before: kind === 'added' ? null : m[2], after: kind === 'removed' ? null : (m[3] || m[2]), kind, raw };
}
export function createModel(releases) {
  const edges = releases.map(release => {
    const changes = new Map();
    for (const kind of ['added', 'updated', 'removed']) for (const raw of release.mods[kind]) {
      const event = parseMod(raw, kind);
      if (changes.has(event.name)) throw Error(`Modの記録が重複しています：${event.name}`);
      changes.set(event.name, { ...event, release });
    }
    return { ...transitionOf(release), release, changes };
  });
  const versions = [...new Set(edges.flatMap(e => [e.from, e.to]))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const snapshots = new Map(versions.map(v => [v, new Map()]));
  const setState = (version, name, value) => {
    const s = snapshots.get(version);
    if (s.has(name) && s.get(name) !== value) throw Error(`Mod履歴が一致しません：${name} / ${version}`);
    if (s.has(name)) return false;
    s.set(name, value);
    return true;
  };
  for (const e of edges) for (const event of e.changes.values()) {
    setState(e.from, event.name, event.before);
    setState(e.to, event.name, event.after);
  }
  // An omitted Mod retains its known version only across a recorded edge.
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      const before = snapshots.get(e.from), after = snapshots.get(e.to);
      for (const name of new Set([...before.keys(), ...after.keys()])) {
        if (e.changes.has(name)) continue;
        if (before.has(name)) changed = setState(e.to, name, before.get(name)) || changed;
        if (after.has(name)) changed = setState(e.from, name, after.get(name)) || changed;
      }
    }
  }
  return { releases, edges, versions, snapshots };
}
export function compareVersions(model, from, to) {
  if (!model.snapshots.has(from) || !model.snapshots.has(to)) throw Error('未収録のバージョンです。');
  const queue = [{ version: from, path: [] }], seen = new Set([from]);
  let path;
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current.version === to) { path = current.path; break; }
    for (const e of model.edges) {
      const next = e.from === current.version ? e.to : e.to === current.version ? e.from : null;
      if (next && !seen.has(next)) { seen.add(next); queue.push({ version: next, path: [...current.path, e] }); }
    }
  }
  if (!path) throw Error('この2版の間には未収録の履歴があるため、比較できません。');
  const left = model.snapshots.get(from), right = model.snapshots.get(to), rows = [];
  for (const name of new Set([...left.keys(), ...right.keys()])) {
    const before = left.get(name), after = right.get(name);
    if (before === null && after === null) continue;
    const status = before === undefined || after === undefined ? 'unknown' : before === after ? 'unchanged' : before === null ? 'added' : after === null ? 'removed' : 'updated';
    const events = path.flatMap(e => e.changes.has(name) ? [e.changes.get(name)] : []);
    const evidence = events.length ? events : model.edges.flatMap(e => e.changes.has(name) ? [e.changes.get(name)] : []);
    rows.push({ name, before, after, status, events, evidence });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }));
  const counts = { added: 0, updated: 0, removed: 0, unchanged: 0, unknown: 0 };
  rows.forEach(row => counts[row.status]++);
  return { from, to, rows, counts, path };
}
// Exact name mentions are navigation aids, never inferred dependency links.
export function mentionedMods(evidence, names) {
  const text = evidence.toLocaleLowerCase();
  return names.filter(name => {
    const escaped = name.toLocaleLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(text);
  });
}
