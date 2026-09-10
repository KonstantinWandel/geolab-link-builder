/* Link Builder. Eine Verknüpfung von Mikrodaten mit deutschen Regionaldaten planen,
   die Fallstricke dazu sehen und den Code dafür bekommen.

   Aufbau: Zustand -> Katalog -> Palette -> Arbeitsfläche -> Prüfungen -> Code.
   Keine Abhängigkeiten, damit die Seite als drei Dateien neben der Quarto-Seite liegen kann.
   Das Fachwissen (Schlüsselarten, Verträglichkeit, Reformen) steht in knowledge.js. */
'use strict';

/* ------------------------------------------------------------------ Werkzeug */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
let seq = 1;
const nid = (p) => `${p}${seq++}`;

function toast(text) {
  const t = el('div', 'toast', esc(text));
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ------------------------------------------------------------------ Zustand */
const S = {
  nodes: [],
  edges: [],
  cat: null,            // catalogue.json
  sel: null,            // {kind:'node'|'edge', id}
  view: { x: 40, y: 30, k: 1 },
  tab: 'checks',
  years: { from: 2010, to: 2022 },   // Jahre der Analysetabelle, vom Nutzer setzbar
  checks: []
};

function baseNode() { return S.nodes.find((n) => n.kind === 'base') || null; }
function nodeById(id) { return S.nodes.find((n) => n.id === id); }
function keyOf(node, keyId) { return node && node.keys.find((k) => k.id === keyId); }
function edgesOf(id) { return S.edges.filter((e) => e.from.node === id || e.to.node === id); }

/* Ein Block entsteht entweder aus einer Vorlage oder aus einem Katalogprodukt. */
function nodeFromTemplate(tpl, x, y) {
  return {
    id: nid('n'), src: 'tpl', tplId: tpl.id, kind: tpl.kind,
    title: tpl.title, subtitle: tpl.subtitle, unit: tpl.unit,
    note: tpl.note, restricted: !!tpl.restricted, editable: !!tpl.editable,
    spatial: !!tpl.spatial, recipe: tpl.recipe || null,
    weightCol: tpl.weightCol || null, reader: tpl.reader,
    keys: tpl.keys.map((k) => ({ id: nid('k'), type: k.type, name: k.name, note: k.note || '', rec: !!k.rec })),
    x, y, pick: null, prodIdx: null
  };
}

/* Eine heruntergeladene Tabelle hat GENAU EINE regionale Tiefe. Der Katalog listet je
   Produkt alle Ebenen, die irgendeine seiner Tabellen hat; ein Block, der sie alle zugleich
   als Schlüssel anbietet, behauptet etwas Falsches und erzeugt drei Spalten desselben Namens.
   Also: eine Ebene, standardmäßig die feinste, im Inspektor umschaltbar. */
const LEVEL_ORDER = ['point', 'grid', 'municipality', 'subdistrict', 'postcode', 'constituency',
                     'district', 'govdistrict', 'state'];
function finestLevel(levels) {
  for (const l of LEVEL_ORDER) if (levels.includes(l)) return l;
  return levels[0] || 'other';
}

function nodeFromProduct(idx, x, y, pick) {
  const p = S.cat.products[idx];
  const levels = (pick && pick.levels && pick.levels.length) ? pick.levels : p.levels;
  const y0 = pick && pick.y0 ? pick.y0 : p.y0;
  const y1 = pick && pick.y1 ? pick.y1 : p.y1;
  const n = {
    id: nid('n'), src: 'cat', prodIdx: idx, kind: 'regional',
    title: pick ? pick.label : p.name,
    subtitle: pick ? p.name : p.source,
    note: p.note, keyHint: p.keyHint, url: pick && pick.url ? pick.url : p.url,
    sourceKey: p.key, sourceLabel: p.source,
    levels, level: finestLevel(levels), y0, y1, keys: [], x, y,
    pick: pick || null, restricted: p.key.startsWith('fdz')
  };
  setLevel(n, n.level);
  return n;
}

/* Setzt die Ebene eines Regionalblocks neu und baut seine Schlüssel dazu. Kanten, die an
   einem weggefallenen Schlüssel hingen, verschwinden mit ihm, sonst zeigen sie ins Leere. */
function setLevel(n, level) {
  const alt = n.keys || [];
  n.level = level;
  const t = LEVEL_TO_KEY[level] || 'other';
  const p = n.prodIdx != null ? S.cat.products[n.prodIdx] : { key: n.sourceKey };
  n.keys = [{ id: nid('k'), type: t, name: keyColumnName(p, t), note: '' }];
  if (n.y0 || n.y1) n.keys.push({ id: nid('k'), type: 'year', name: 'year', note: '' });
  n.unit = unitPhrase([level], n.y0, n.y1);
  const gone = new Set(alt.map((k) => k.id));
  if (gone.size) {
    S.edges.forEach((e) => { e.pairs = e.pairs.filter((q) => !gone.has(q.from) && !gone.has(q.to)); });
    S.edges = S.edges.filter((e) => e.pairs.length);
  }
}

/* Wo die Spalte in der heruntergeladenen Datei vermutlich heißt. Nur geraten, wo geprüft. */
function keyColumnName(p, type) {
  if (!p) return 'area';
  if (type === 'year') return 'year';
  if (p.key === 'inkar') return 'Kennziffer';
  if (p.key === 'regionalatlas') return 'schluessel';
  if (p.key === 'regionalstatistik' || p.key === 'genesis_bund' || p.key === 'zensus2022') {
    return '1_variable_attribute_code';
  }
  return { ags2: 'state', ags3: 'govregion', ags5: 'ags', ags8: 'ags', plz: 'plz',
           wk: 'wk', grid: 'cell', coord: 'lon_lat', other: 'area' }[type] || 'area';
}

const LEVEL_ONE = {
  state: 'federal state', govdistrict: 'government region', district: 'district',
  municipality: 'municipality', postcode: 'postcode', constituency: 'constituency',
  grid: '1 km grid cell', point: 'location', subdistrict: 'sub-district area', other: 'area'
};
function unitPhrase(levels, y0, y1) {
  const lv = levels.map((l) => LEVEL_ONE[l] || l).join(' or ');
  const span = (y0 && y1) ? (y0 === y1 ? ` in ${y0}` : ` and year, ${y0} to ${y1}`) : '';
  return `one row per ${lv || 'area'}${span}`;
}

/* ------------------------------------------------------------------ Katalog */
async function loadCatalogue() {
  const r = await fetch('catalogue.json');
  S.cat = await r.json();
  S.cat.itemsIdx = S.cat.items.map((it, i) => i);
  S.cat.lc = S.cat.items.map((it) => it[0].toLowerCase());
  S.cat.prodLc = S.cat.products.map((p) => (p.name + ' ' + p.source).toLowerCase());
}

/* ------------------------------------------------------------------ Suche */
/* Gesucht wird mit demselben Werkzeug wie im GeoDB-Finder: eine Anfrage an dessen API, also
   dieselbe semantische Suche mit demselben Reranker und damit auch dieselben Treffer. Das ist
   der Grund, warum "unemployment" hier etwas findet, obwohl im Katalog "Erwerbslosenquote"
   steht: die Beschriftungen sind deutsch, die Einbettung ist es nicht.
   Fällt der Dienst aus, bleibt die eingebaute Textsuche über den mitgelieferten Katalog. */
const GEODB_SITE = 'https://geodb.geolab.soz.uni-bielefeld.de/';
const GEODB_API = GEODB_SITE + 'api/soep/advice';
let laufendeSuche = null;

async function searchLive(q, top = 40) {
  if (laufendeSuche) laufendeSuche.abort();
  const abbruch = new AbortController();
  laufendeSuche = abbruch;
  const zeit = setTimeout(() => abbruch.abort(), 9000);
  try {
    const r = await fetch(GEODB_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, top_k: top, dataset_scope: 'all' }),
      signal: abbruch.signal
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    /* Der Finder zeigt auch Glossareinträge, Formatbeschreibungen und Portalkarten, und das
       ist dort richtig. Hier nicht: eine Begriffsdefinition hat keine Zeilen, die man an
       etwas anspielen könnte, und sie stand mit ihrem kurzen Namen ganz oben. */
    const NUTZBAR = new Set(['table', 'regional_indicator', 'indicator', 'climate_dataset', 'dataset']);
    return (d.recommended_variables || [])
      .filter((x) => NUTZBAR.has(x.item_type))
      .map(pickFromRecord)
      .filter((x) => x.label && x.levels.length);
  } finally {
    clearTimeout(zeit);
    if (laufendeSuche === abbruch) laufendeSuche = null;
  }
}

/* Ein Datensatz aus der API wird zu demselben "pick", den auch der mitgelieferte Katalog
   liefert, damit alles dahinter nur eine Form kennt. */
function pickFromRecord(r) {
  const namen = (S.cat && S.cat.levelNames) || {};
  const levels = [...new Set((r.spatial_levels || []).map((l) => namen[l]).filter(Boolean))];
  const info = (S.cat && S.cat.sources && S.cat.sources[r.source_key]) || {};
  return {
    label: (r.label || '').trim(),
    levels,
    y0: r.year_start || null,
    y1: r.year_end || null,
    url: r.indicator_url || r.source_url || r.portal_url || '',
    sourceKey: r.source_key || 'geodb',
    sourceLabel: r.source_label || r.source_key || 'GeoDB',
    dataset: r.dataset_label || r.dataset || '',
    unit: r.unit || '',
    note: info.note || '',
    keyHint: info.keyHint || '',
    live: true
  };
}

/* Suche: Produkte zuerst, dann einzelne Indikatoren. Sortiert nach Trefferlage im Text,
   damit "Arbeitslosenquote" vor "Anteil der Arbeitslosen unter 25 an ..." steht. */
function search(qRaw) {
  const q = qRaw.trim().toLowerCase();
  if (q.length < 2) return null;
  const words = q.split(/\s+/);
  const hit = (hay) => words.every((w) => hay.includes(w));
  const prods = [];
  S.cat.prodLc.forEach((hay, i) => { if (hit(hay)) prods.push(i); });
  const items = [];
  for (let i = 0; i < S.cat.lc.length && items.length < 400; i++) {
    if (hit(S.cat.lc[i])) items.push(i);
  }
  items.sort((a, b) => {
    const pa = S.cat.lc[a].indexOf(words[0]), pb = S.cat.lc[b].indexOf(words[0]);
    return pa - pb || S.cat.lc[a].length - S.cat.lc[b].length;
  });
  return { prods: prods.slice(0, 8), items: items.slice(0, 120), n: items.length };
}

function itemAsPick(i) {
  const [label, prodIdx, y0, y1, code, url] = S.cat.items[i];
  const levels = (code || '').split('').map((c) => S.cat.levelCodes[c]).filter(Boolean);
  const p = S.cat.products[prodIdx] || {};
  return {
    label, prodIdx, y0: y0 || null, y1: y1 || null, levels, url,
    sourceKey: p.key, sourceLabel: p.source, dataset: p.name,
    note: p.note || '', keyHint: p.keyHint || '', live: false
  };
}

/* Ein Block aus einem Treffer, gleichgültig ob er aus der Live-Suche oder aus dem
   mitgelieferten Katalog kommt. */
function nodeFromPick(pick, x, y) {
  if (pick.prodIdx != null) return nodeFromProduct(pick.prodIdx, x, y, pick);
  const levels = pick.levels.length ? pick.levels : ['district'];
  const n = {
    id: nid('n'), src: 'live', prodIdx: null, kind: 'regional',
    title: pick.label, subtitle: pick.sourceLabel,
    note: pick.note, keyHint: pick.keyHint, url: pick.url,
    sourceKey: pick.sourceKey, sourceLabel: pick.sourceLabel,
    levels, level: finestLevel(levels), y0: pick.y0, y1: pick.y1, keys: [], x, y,
    pick, restricted: String(pick.sourceKey || '').startsWith('fdz')
  };
  setLevel(n, n.level);
  return n;
}

function mark(text, q) {
  if (!q) return esc(text);
  const w = q.trim().split(/\s+/)[0];
  const i = text.toLowerCase().indexOf(w.toLowerCase());
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + w.length)) + '</mark>' + esc(text.slice(i + w.length));
}

/* ------------------------------------------------------------------ Palette */
let paletteLauf = 0;
function renderPalette() {
  const host = $('#palette');
  const q = $('#q').value;
  if (q.trim().length >= 2) {
    const lauf = ++paletteLauf;
    host.innerHTML = '<div class="empty">Searching the GeoDB index…</div>';
    $('#palette-hint').textContent = 'Same search as the GeoDB finder.';
    searchLive(q, 40).then((treffer) => {
      if (lauf !== paletteLauf) return;
      zeigeTreffer(host, treffer, q, true);
    }).catch(() => {
      if (lauf !== paletteLauf) return;
      const res = search(q);
      const treffer = res ? res.items.map(itemAsPick) : [];
      zeigeTreffer(host, treffer, q, false, res ? res.prods : []);
    });
    return;
  }
  paletteLauf++;
  renderPaletteRuhe(host);
}

function zeigeTreffer(host, treffer, q, live, prods) {
  host.innerHTML = '';
  $('#palette-hint').innerHTML = treffer.length
    ? `<b>${treffer.length}</b> hit${treffer.length === 1 ? '' : 's'} ${live
        ? `from the <a href="${GEODB_SITE}?q=${encodeURIComponent(q)}" target="_blank" rel="noopener">GeoDB finder</a>, ranked exactly as it ranks them`
        : 'from the built-in catalogue (the live index did not answer)'}. Click one to add it.`
    : 'Nothing found. Try one word, in German or English.';
  if (prods && prods.length) {
    host.appendChild(el('div', 'grouphead', 'Whole data products'));
    prods.forEach((i) => host.appendChild(productCard(i, q)));
  }
  if (!treffer.length) {
    host.appendChild(el('div', 'empty', 'Nothing with that word. Try a single, shorter one, or a German term.'));
    return;
  }
  host.appendChild(el('div', 'grouphead', 'Indicators and tables'));
  treffer.forEach((pick) => host.appendChild(trefferZeile(pick, q)));
}

function trefferZeile(pick, q) {
  const span = pick.y0 ? (pick.y0 === pick.y1 ? String(pick.y0) : `${pick.y0}–${pick.y1}`) : 'no year given';
  const lv = pick.levels.map((l) => LEVEL_LABEL[l]).join(', ') || 'level not stated';
  const row = el('div', 'result',
    `<div class="t">${mark(pick.label, q)}</div><div class="s">${esc(pick.sourceLabel || '')} &middot; ${esc(lv)} &middot; ${esc(span)}</div>`);
  row.addEventListener('click', () => addPick(pick));
  return row;
}

function renderPaletteRuhe(host) {
  host.innerHTML = '';
  $('#palette-hint').innerHTML = 'Drag a block onto the canvas, or click <b>+</b>.';
  const groups = {};
  TEMPLATES.forEach((t) => { (groups[t.group] = groups[t.group] || []).push(t); });
  Object.keys(groups).forEach((g) => {
    host.appendChild(el('div', 'grouphead', esc(g)));
    groups[g].forEach((t) => host.appendChild(templateCard(t)));
  });

  host.appendChild(el('div', 'grouphead', 'Regional data, most used'));
  let shown = 0;
  FEATURED.forEach((needle) => {
    const i = S.cat.products.findIndex((p) => (p.key + '|' + p.name) === needle);
    if (i >= 0) { host.appendChild(productCard(i, '')); shown++; }
  });
  host.appendChild(el('div', 'empty',
    `Search above to reach all <b>${S.cat.items.length.toLocaleString('en')}</b> indicators from
     <b>${S.cat.products.length}</b> data products. Catalogue built ${esc(S.cat.built)} from the
     <a href="${GEODB_SITE}" target="_blank" rel="noopener">GeoDB finder</a>, which is also where
     you can read what any of them contains before you attach it.`));
}

function templateCard(t) {
  const c = el('div', 'card' + (t.restricted ? ' restricted' : ''),
    `<div class="t">${esc(t.title)}</div><div class="s">${esc(t.subtitle)}</div>` +
    `<div class="m">${t.keys.map((k) => esc(k.name)).join(' · ')}</div>` +
    `<button class="add" title="Add to canvas">+</button>`);
  const add = () => addTemplate(t);
  c.querySelector('.add').addEventListener('click', (e) => { e.stopPropagation(); add(); });
  makeDraggableCard(c, add);
  return c;
}

function productCard(i, q) {
  const p = S.cat.products[i];
  const span = p.y0 ? (p.y0 === p.y1 ? p.y0 : `${p.y0}–${p.y1}`) : 'no year given';
  const c = el('div', 'card',
    `<div class="t">${mark(p.name, q)}</div><div class="s">${esc(p.source)}</div>` +
    `<div class="m">${esc(p.levels.map((l) => LEVEL_LABEL[l]).join(' · '))} · ${esc(span)} · ${p.n} item${p.n === 1 ? '' : 's'}</div>` +
    `<button class="add" title="Add to canvas">+</button>`);
  const add = () => addProduct(i, null);
  c.querySelector('.add').addEventListener('click', (e) => { e.stopPropagation(); add(); });
  makeDraggableCard(c, add);
  return c;
}

/* Ziehen aus der Palette: kein HTML5-Drag-and-Drop, weil dessen Zeigerposition über einem
   transformierten Container nicht verlässlich ist. Stattdessen Pointer Events. */
function makeDraggableCard(card, add) {
  card.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || ev.target.closest('.add')) return;
    const start = { x: ev.clientX, y: ev.clientY };
    let ghost = null;
    const move = (e) => {
      const d = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (!ghost && d > 6) {
        ghost = card.cloneNode(true);
        ghost.style.cssText = 'position:fixed;z-index:99;width:240px;opacity:.85;pointer-events:none;box-shadow:var(--shadow)';
        document.body.appendChild(ghost);
      }
      if (ghost) { ghost.style.left = (e.clientX - 30) + 'px'; ghost.style.top = (e.clientY - 14) + 'px'; }
    };
    const up = (e) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (ghost) ghost.remove();
      const over = document.elementFromPoint(e.clientX, e.clientY);
      if (ghost && over && over.closest('.canvas-wrap')) {
        const pt = screenToWorld(e.clientX, e.clientY);
        add(pt.x - 100, pt.y - 30);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function addTemplate(t, x, y) {
  const at = freeSpot(x, y);
  const n = nodeFromTemplate(t, at.x, at.y);
  S.nodes.push(n);
  S.sel = { kind: 'node', id: n.id };
  autoWire(n);
  ensureVisible(n);
  render();
}

function addPick(pick, x, y) {
  const at = freeSpot(x, y);
  const n = nodeFromPick(pick, at.x, at.y);
  S.nodes.push(n);
  S.sel = { kind: 'node', id: n.id };
  autoWire(n);
  ensureVisible(n);
  render();
}

function addProduct(idx, pick, x, y) {
  const at = freeSpot(x, y);
  const n = nodeFromProduct(idx, at.x, at.y, pick);
  S.nodes.push(n);
  S.sel = { kind: 'node', id: n.id };
  autoWire(n);
  ensureVisible(n);
  render();
}

/* Ein neuer Block sucht sich einen Platz, an dem er keinen anderen überdeckt. Die frühere
   Fassung rechnete die Stelle aus der Anzahl der Blöcke aus, und sobald einer verschoben oder
   gelöscht worden war, landete der nächste mitten auf einem bestehenden. */
const NODE_W = 268, NODE_H = 250;
function freeSpot(x, y) {
  if (x != null) return { x, y };
  const kollidiert = (px, py) => S.nodes.some((n) =>
    Math.abs(n.x - px) < NODE_W && Math.abs(n.y - py) < NODE_H);
  if (!S.nodes.length) return { x: 60, y: 60 };
  const rechts = Math.max(...S.nodes.map((n) => n.x));
  for (let spalte = 0; spalte < 8; spalte++) {
    for (let zeile = 0; zeile < 5; zeile++) {
      const px = rechts + 320 + spalte * 320;
      const py = 60 + zeile * NODE_H;
      if (!kollidiert(px, py)) return { x: px, y: py };
    }
  }
  return { x: rechts + 320, y: 60 + S.nodes.length * 30 };
}

/* ================================================================= Arbeitsfläche */
function screenToWorld(cx, cy) {
  const r = $('#canvas').getBoundingClientRect();
  return { x: (cx - r.left - S.view.x) / S.view.k, y: (cy - r.top - S.view.y) / S.view.k };
}

function renderCanvas() {
  const world = $('#world');
  const t = `translate(${S.view.x}px, ${S.view.y}px) scale(${S.view.k})`;
  world.style.transform = t;
  /* Das SVG selbst bleibt stehen und füllt die Fläche; verschoben wird die Gruppe darin.
     Ein transformiertes SVG-Wurzelelement schneidet alles ab, was über seine voreingestellten
     300 mal 150 Pixel hinausragt, und genau das hat die Drähte zu Stummeln gemacht. */
  wireLayer().setAttribute('transform',
    `translate(${S.view.x} ${S.view.y}) scale(${S.view.k})`);
  $('#blank').hidden = S.nodes.length > 0;
  world.innerHTML = '';
  S.nodes.forEach((n) => world.appendChild(nodeEl(n)));
  drawWires();
}

function nodeEl(n) {
  const sel = S.sel && S.sel.kind === 'node' && S.sel.id === n.id;
  const d = el('div', 'node ' + n.kind + (sel ? ' sel' : ''));
  d.style.left = n.x + 'px';
  d.style.top = n.y + 'px';
  d.dataset.node = n.id;

  const head = el('div', 'node-head',
    `<div class="eyebrow">${esc(n.kind === 'base' ? 'Analysis table' : n.kind === 'bridge' ? 'Bridge' : 'Regional data')}</div>` +
    `<div class="ttl">${esc(n.title)}</div>` +
    `<div class="sub">${esc(n.subtitle || '')}</div>` +
    `<button class="node-x" title="Remove this block" aria-label="Remove this block">×</button>`);
  head.querySelector('.node-x').addEventListener('click', (e) => { e.stopPropagation(); removeNode(n.id); });
  d.appendChild(head);

  d.appendChild(el('div', 'node-unit', esc(n.unit || '')));

  if (n.pick) d.appendChild(el('div', 'node-pick', 'Indicator: ' + esc(n.pick.label)));
  if (n.restricted) d.appendChild(el('div', 'node-flag', 'Restricted, apply for access'));

  const ports = el('div', 'ports');
  n.keys.forEach((k) => {
    const meta = KEYS[k.type] || KEYS.other;
    const partner = partnersOf(n.id, k.id);
    const verbunden = partner.length > 0;
    /* geo und time sind die Spalten, über die verschiedene Quellen überhaupt zusammenfinden;
       eine Fallnummer verbindet nur Tabellen derselben Erhebung. Das steht am Block, weil es
       die Frage ist, die vor jeder Verknüpfung kommt. */
    const rolle = meta.family === 'geo' ? 'across' : meta.family === 'time' ? 'across' : 'within';
    const titel = meta.family === 'unit'
      ? `${meta.label}. Links tables from the same study, not different sources.`
      : `${meta.label}${meta.hint ? ' · ' + meta.hint : ''}. This is the kind of column that links different sources.`;
    const p = el('div', `port ${meta.family} ${rolle}${verbunden ? ' linked' : ''}${k.rec ? ' rec' : ''}`);
    p.dataset.port = k.id;
    p.title = titel + (k.note ? ' — ' + k.note : '') +
      (verbunden ? '\nLinked to ' + partner.map((x) => `${x.name} in ${x.node}`).join(' and ') : '');
    p.innerHTML =
      `<span class="dot l" data-port="${k.id}" data-node="${n.id}" data-side="l" title="Drag from here to link"></span>` +
      `<span class="nm">${esc(k.name)}</span>` +
      (verbunden
        ? `<span class="to">→ ${esc(partner.map((x) => x.name).join(', '))}</span>`
        : `<span class="ty">${esc(meta.label)}</span>`) +
      `<span class="dot r" data-port="${k.id}" data-node="${n.id}" data-side="r" title="Drag from here to link"></span>`;
    ports.appendChild(p);
  });
  d.appendChild(ports);

  if (n.note) d.appendChild(el('div', 'node-note', esc(n.note)));

  makeNodeDraggable(d, n);
  d.addEventListener('pointerdown', () => { S.sel = { kind: 'node', id: n.id }; renderRight(); markSelection(); });
  return d;
}

/* Mit welchen Spalten welcher anderen Tabelle eine Spalte verbunden ist. Das steht in der
   Zeile selbst, weil eine Linie zwischen zwei Kästen nur zeigt, DASS etwas verbunden ist. */
function partnersOf(nodeId, keyId) {
  const out = [];
  S.edges.forEach((e) => {
    const A = nodeById(e.from.node), B = nodeById(e.to.node);
    if (!A || !B) return;
    e.pairs.forEach((q) => {
      if (e.from.node === nodeId && q.from === keyId) {
        const k = keyOf(B, q.to); if (k) out.push({ name: k.name, node: B.title });
      } else if (e.to.node === nodeId && q.to === keyId) {
        const k = keyOf(A, q.from); if (k) out.push({ name: k.name, node: A.title });
      }
    });
  });
  return out;
}

function markSelection() {
  $$('#world .node').forEach((d) => {
    d.classList.toggle('sel', !!(S.sel && S.sel.kind === 'node' && S.sel.id === d.dataset.node));
  });
  $$('#wires path.wire').forEach((p) => {
    p.classList.toggle('sel', !!(S.sel && S.sel.kind === 'edge' && S.sel.id === p.dataset.edge));
  });
}

/* Der ganze Kasten lässt sich ziehen, nicht nur seine Kopfzeile: wer eine Karte auf einer
   Fläche sieht, fasst sie irgendwo an. Ausgenommen sind die Anschlusspunkte und der
   Schließknopf, die etwas anderes tun. */
function makeNodeDraggable(d, n) {
  d.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || ev.target.closest('.node-x') || ev.target.closest('.port')) return;
    ev.stopPropagation();
    /* Ohne das fängt der Browser eine Textmarkierung an, sobald man den Kasten zieht, und in
       manchen Browsern schluckt die anschließend die Zeigerereignisse. */
    ev.preventDefault();
    const start = screenToWorld(ev.clientX, ev.clientY);
    const from = { x: n.x, y: n.y };
    let gezogen = false;
    d.setPointerCapture(ev.pointerId);
    const move = (e) => {
      const p = screenToWorld(e.clientX, e.clientY);
      const dx = p.x - start.x, dy = p.y - start.y;
      if (!gezogen && Math.hypot(dx, dy) < 3) return;
      gezogen = true;
      d.classList.add('moving');
      n.x = Math.round(from.x + dx);
      n.y = Math.round(from.y + dy);
      d.style.left = n.x + 'px'; d.style.top = n.y + 'px';
      drawWires();
    };
    const up = () => {
      d.removeEventListener('pointermove', move);
      d.removeEventListener('pointerup', up);
      d.classList.remove('moving');
      if (gezogen) save();
    };
    d.addEventListener('pointermove', move);
    d.addEventListener('pointerup', up);
  });
}

function removeNode(id) {
  S.nodes = S.nodes.filter((n) => n.id !== id);
  S.edges = S.edges.filter((e) => e.from.node !== id && e.to.node !== id);
  if (S.sel && S.sel.id === id) S.sel = null;
  render();
}

/* ------------------------------------------------------------------ Drähte */
function portCentre(nodeId, keyId) {
  const dot = $(`#world .node[data-node="${nodeId}"] .dot.l[data-port="${keyId}"]`);
  const node = nodeById(nodeId);
  if (!dot || !node) return null;
  const nEl = dot.closest('.node');
  const r = dot.getBoundingClientRect(), nr = nEl.getBoundingClientRect();
  return {
    x: node.x + (r.left + r.width / 2 - nr.left) / S.view.k,
    y: node.y + (r.top + r.height / 2 - nr.top) / S.view.k,
    left: node.x, right: node.x + nr.width / S.view.k
  };
}

/* Die Kante geht immer von der Seite des Blocks aus, die zum anderen zeigt. */
function wirePath(a, b) {
  const aRight = a.x < b.x;
  const ax = aRight ? a.right : a.left, bx = aRight ? b.left : b.right;
  const dx = Math.max(46, Math.abs(bx - ax) * 0.45);
  const s = aRight ? 1 : -1;
  return `M ${ax} ${a.y} C ${ax + dx * s} ${a.y}, ${bx - dx * s} ${b.y}, ${bx} ${b.y}`;
}

function wireLayer() {
  let g = $('#wirelayer');
  if (!g) {
    g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.id = 'wirelayer';
    $('#wires').appendChild(g);
  }
  return g;
}

function drawWires() {
  const svg = wireLayer();
  svg.innerHTML = '';
  svg.setAttribute('transform', `translate(${S.view.x} ${S.view.y}) scale(${S.view.k})`);
  S.edges.forEach((e) => {
    const a = portCentre(e.from.node, e.from.key), b = portCentre(e.to.node, e.to.key);
    if (!a || !b) return;
    const d = wirePath(a, b);
    const modes = e.pairs.map((q) => q.mode);
    e.verdict = modes.includes('no') ? 'no'
      : modes.every((m) => m === 'direct') ? 'direct' : 'soft';
    const cls = e.verdict === 'no' ? 'bad' : (e.verdict === 'direct' ? '' : 'warn');
    const A = nodeById(e.from.node), B = nodeById(e.to.node);
    e.label = e.pairs.map((q) => {
      const ka = keyOf(A, q.from), kb = keyOf(B, q.to);
      return ka && kb ? (ka.name === kb.name ? ka.name : `${ka.name} = ${kb.name}`) : '';
    }).filter(Boolean).join(' + ');
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('d', d); hit.setAttribute('class', 'hit'); hit.dataset.edge = e.id;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'wire ' + cls + (S.sel && S.sel.kind === 'edge' && S.sel.id === e.id ? ' sel' : ''));
    path.dataset.edge = e.id;
    [hit, path].forEach((p) => p.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation(); S.sel = { kind: 'edge', id: e.id }; renderRight(); markSelection();
    }));
    svg.appendChild(hit); svg.appendChild(path);
    if (e.label) {
      /* Der Text steht in der Lücke zwischen den Blöcken und wird darauf gekürzt: die Drähte
         liegen hinter den Blöcken, ein zu langer Text verschwände zur Hälfte darunter. */
      /* Die Beschriftung gehört in die Lücke zwischen den Blöcken, nicht auf die Mitte der
         beiden Punkte: die liegt bei nebeneinanderstehenden Blöcken hinter dem linken Block. */
      const aRechts = a.x < b.x;
      const ax = aRechts ? a.right : a.left, bx = aRechts ? b.left : b.right;
      const luecke = Math.abs(bx - ax);
      const passt = Math.max(4, Math.floor(luecke / 5.6));
      const text = e.label.length > passt
        ? (e.pairs.length > 1 ? `${e.pairs.length} keys` : e.label.slice(0, Math.max(3, passt - 1)) + '…')
        : e.label;
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('class', 'wlabel');
      t.setAttribute('x', (ax + bx) / 2); t.setAttribute('y', (a.y + b.y) / 2 - 7);
      t.setAttribute('text-anchor', 'middle');
      t.textContent = text;
      const titel = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      titel.textContent = e.label;
      t.appendChild(titel);
      svg.appendChild(t);
    }
  });
}

/* ------------------------------------------------------------------ Kanten ziehen */
let linking = null;

function startLink(ev) {
  /* Nicht nur der Punkt, die ganze Zeile zieht eine Verbindung. Ein Punkt ist elf Pixel groß,
     und seit sich der ganze Kasten verschieben lässt, verschob ein Griff daneben den Kasten,
     statt zu verbinden. Die Zeile ist der Anfasser, der Punkt nur seine Spitze. */
  const dot = ev.target.closest('.dot');
  const zeile = dot ? dot.closest('.port') : ev.target.closest('.port');
  if (!zeile) return false;
  const nodeEl = zeile.closest('.node');
  if (!nodeEl) return false;
  ev.stopPropagation(); ev.preventDefault();
  const from = { node: nodeEl.dataset.node, key: zeile.dataset.port };
  const fromKey = keyOf(nodeById(from.node), from.key);
  linking = { from, fromKey };
  highlightCandidates(from.node, fromKey.type);
  const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  ghost.setAttribute('class', 'ghost');
  wireLayer().appendChild(ghost);

  const move = (e) => {
    const a = portCentre(from.node, from.key);
    const p = screenToWorld(e.clientX, e.clientY);
    if (a) ghost.setAttribute('d', wirePath(a, { x: p.x, y: p.y, left: p.x, right: p.x }));
  };
  const aufraeumen = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', abbrechen);
    ghost.remove();
    $$('.port').forEach((p) => p.classList.remove('cand', 'dim'));
    linking = null;
  };
  const abbrechen = () => { aufraeumen(); };
  const up = (e) => {
    const t = document.elementFromPoint(e.clientX, e.clientY);
    /* Fallenlassen zählt auf der ganzen Zeile, nicht nur auf dem Punkt. Elf Pixel genau zu
       treffen war die eigentliche Ursache dafür, dass eine gezogene Linie nichts verband:
       sie ließ sich anfangen und nicht abschließen. */
    const zeile = t && t.closest('.port');
    const zielKasten = zeile && zeile.closest('.node');
    aufraeumen();
    if (zeile && zielKasten && zielKasten.dataset.node !== from.node) {
      addEdge(from, { node: zielKasten.dataset.node, key: zeile.dataset.port });
    } else if (zeile) {
      toast('A block cannot be linked to itself.');
    } else if (t && t.closest('.node')) {
      toast('Drop it on one of the key rows, not on the body of the block.');
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', abbrechen);
  return true;
}

/* Beim Ziehen zeigt die Fläche, was passt: das ist der Teil, der Anfängern die Regeln beibringt. */
function highlightCandidates(fromNode, type) {
  S.nodes.forEach((n) => {
    n.keys.forEach((k) => {
      const p = $(`#world .node[data-node="${n.id}"] .port[data-port="${k.id}"]`);
      if (!p) return;
      if (n.id === fromNode) { p.classList.add('dim'); return; }
      const m = matchKeys(type, k.type);
      if (m.mode === 'no') p.classList.add('dim'); else p.classList.add('cand');
      p.title = m.mode === 'no' ? (m.why || 'These two cannot be matched.')
        : m.mode === 'direct' ? 'Same kind of column: drop here.'
        : (m.why || 'These can be matched, with a step in between.');
    });
  });
}

function addEdge(from, to) {
  const dup = S.edges.find((e) =>
    (e.from.node === from.node && e.to.node === to.node) || (e.from.node === to.node && e.to.node === from.node));
  const a = keyOf(nodeById(from.node), from.key), b = keyOf(nodeById(to.node), to.key);
  const m = matchKeys(a.type, b.type);
  if (m.mode === 'no') {
    toast(m.why || 'Those two columns cannot be matched.');
    return;
  }
  /* Zwei Tabellen können über mehrere Spalten zusammengehören, Gebiet und Jahr etwa.
     Solche Paare gehören in dieselbe Kante, nicht in zwei. */
  if (dup) {
    /* Eine Spalte darf in einer Verbindung nur einmal vorkommen. Zwei Paare auf dieselbe
       rechte Spalte ergeben eine Verbundbedingung, die sich selbst widerspricht, und dplyr
       bricht dann mit einer Meldung ab, die niemand auf diese Stelle zurückführt. */
    const belegt = dup.pairs.some((q) => q.from === from.key || q.to === to.key ||
                                         q.from === to.key || q.to === from.key);
    if (belegt) {
      toast('That column is already part of this link. Remove the existing pair first.');
      return;
    }
    dup.pairs.push({ from: from.key, to: to.key, mode: m.mode, why: m.why || '', op: m.op || null });
    S.sel = { kind: 'edge', id: dup.id };
  } else {
    const e = {
      id: nid('e'), from: { node: from.node }, to: { node: to.node },
      pairs: [{ from: from.key, to: to.key, mode: m.mode, why: m.why || '', op: m.op || null }],
      join: 'left', time: 'exact'
    };
    e.from.key = from.key; e.to.key = to.key;
    S.edges.push(e);
    S.sel = { kind: 'edge', id: e.id };
  }
  render();
}

/* Beim Einfügen eines Blocks sofort das offensichtliche Paar vorschlagen. Das ist der
   Unterschied zwischen "leere Fläche" und "es passiert etwas", wenn man zum ersten Mal hier ist. */
function autoWire(n) {
  const partners = S.nodes.filter((o) => o.id !== n.id);
  if (!partners.length) return;
  let best = null;
  partners.forEach((o) => {
    n.keys.forEach((k) => {
      o.keys.forEach((ok) => {
        const m = matchKeys(k.type, ok.type);
        if (m.mode === 'no') return;
        const score = (m.mode === 'direct' ? 100 : m.mode === 'derive' ? 60 : 20) +
                      (KEYS[k.type].family === 'geo' ? 10 : 0) +
                      (o.kind === 'base' || n.kind === 'regional' ? 5 : 0) +
                      /* Bei SOEP ist kkz_rek die richtige Wahl: einheitlicher Gebietsstand. */
                      (/rek/.test(k.name) || /rek/.test(ok.name) ? 8 : 0);
        if (!best || score > best.score) best = { score, a: { node: n.id, key: k.id }, b: { node: o.id, key: ok.id } };
      });
    });
  });
  if (best && best.score >= 60) {
    addEdgeQuiet(best.b, best.a);
    /* Passt zusätzlich ein Jahr auf beiden Seiten, gehört es in dieselbe Kante. */
    const na = nodeById(best.b.node), nb = nodeById(best.a.node);
    const ya = na.keys.find((k) => KEYS[k.type].family === 'time');
    const yb = nb.keys.find((k) => KEYS[k.type].family === 'time');
    if (ya && yb) addEdgeQuiet({ node: na.id, key: ya.id }, { node: nb.id, key: yb.id });
  }
}

function addEdgeQuiet(from, to) {
  const before = S.edges.length;
  const savedSel = S.sel;
  const a = keyOf(nodeById(from.node), from.key), b = keyOf(nodeById(to.node), to.key);
  const m = matchKeys(a.type, b.type);
  if (m.mode === 'no') return;
  const dup = S.edges.find((e) =>
    (e.from.node === from.node && e.to.node === to.node) || (e.from.node === to.node && e.to.node === from.node));
  if (dup) {
    const already = dup.pairs.some((p) => p.from === from.key || p.to === to.key || p.from === to.key || p.to === from.key);
    if (!already) dup.pairs.push({ from: from.key, to: to.key, mode: m.mode, why: m.why || '', op: m.op || null });
  } else {
    S.edges.push({
      id: nid('e'), from: { node: from.node, key: from.key }, to: { node: to.node, key: to.key },
      pairs: [{ from: from.key, to: to.key, mode: m.mode, why: m.why || '', op: m.op || null }],
      join: 'left', time: 'exact'
    });
  }
  S.sel = savedSel;
  return S.edges.length > before;
}

/* ================================================================= Prüfungen */
/* Jede Prüfung ist ein Satz in normaler Sprache, eine Begründung und ein konkreter nächster
   Schritt. Die Reihenfolge ist die Dringlichkeit: was den Datensatz kaputt macht, steht oben. */

const CHECK_ORDER = { err: 0, warn: 1, info: 2, ok: 3 };

/* Das beste noch fehlende Gebietspaar zwischen einem Block und dem, was schon zusammenhängt.
   Nicht "genau eines, sonst nichts": bei SOEPregion stehen sechs Kandidaten zur Wahl, und
   dann ist die Frage nicht, OB man verbindet, sondern welcher Schlüssel der richtige ist,
   und darauf hat das Werkzeug eine Meinung. */
function besteVerbindung(neuer, kandidatenBloecke) {
  let best = null;
  kandidatenBloecke.forEach((o) => {
    if (o.id === neuer.id) return;
    o.keys.filter((k) => KEYS[k.type].family === 'geo').forEach((ok) => {
      neuer.keys.filter((k) => KEYS[k.type].family === 'geo').forEach((nk) => {
        const m = matchKeys(ok.type, nk.type);
        if (m.mode === 'no') return;
        const punkte = (m.mode === 'direct' ? 100 : m.mode === 'derive' ? 60 : 20) +
                       (/rek/.test(ok.name) || /rek/.test(nk.name) ? 12 : 0) +
                       (o.kind === 'base' ? 4 : 0);
        if (!best || punkte > best.punkte) {
          best = { punkte, label: `Link ${ok.name} to ${nk.name}`, do: 'pair',
                   aNode: o.id, aKey: ok.id, bNode: neuer.id, bKey: nk.id };
        }
      });
    });
  });
  return best;
}

function runChecks() {
  const out = [];
  const base = baseNode();
  const add = (level, title, body, fix, where, action) => out.push({ level, title, body, fix, where, action });

  if (!S.nodes.length) {
    add('info', 'Start by putting your own data on the canvas',
      'The first block is the table you will analyse: the one whose rows you want to keep. Everything else is attached to it.',
      'Use <b>Guide me</b>, or drag <b>SOEP person-year</b> or <b>Your own table</b> in from the left.', '',
      { label: 'Show me the blocks', do: 'showPalette', group: 'Your analysis table' });
    return out;
  }
  if (!base) {
    const kandidaten = S.nodes.filter((n) => n.kind !== 'base');
    add('err', 'No analysis table',
      'Nothing on the canvas is marked as the table you are analysing, so there is no side whose rows are kept and nothing to generate code for.',
      'Add one of the blocks under <b>Your analysis table</b>, or promote a block that is already here: any table with rows of its own can be the one you analyse. ' +
      (kandidaten.length === 1
        ? `<b>${esc(kandidaten[0].title)}</b> is ${kandidaten[0].unit}, so it can be.`
        : 'Select a block and use <b>Use this as my analysis table</b> in its panel.') +
      ' Which one it should be is your decision: it depends on whether your rows are people, households, districts or something else.', '',
      kandidaten.length === 1
        ? { label: `Use “${kandidaten[0].title}” as the analysis table`, do: 'asBase', node: kandidaten[0].id }
        : { label: 'Show me the blocks', do: 'showPalette', group: 'Your analysis table' });
  }

  /* Analysetabelle da, aber noch nichts daran. Ohne diesen Satz steht die Spalte leer da,
     was aussieht, als sei das Werkzeug kaputt. */
  if (base && !S.edges.length) {
    add('info', 'Nothing attached yet',
      `Your analysis table is <b>${esc(base.title)}</b>, ${esc(base.unit)}. Now search for the regional data you want beside it, and drag between the two key rows that should meet.`,
      'The search on the left is the GeoDB finder\'s own, so ask in plain words: <i>unemployment rate</i>, <i>Kinderbetreuung</i>, <i>rents</i>.', '',
      { label: 'Show me the catalogue', do: 'showPalette', group: 'Regional data, most used' });
  }

  /* Blöcke, die nicht an der Analysetabelle hängen. Ein Block, der nur mit einem anderen
     losen Block verbunden ist, sieht verkabelt aus und steht trotzdem in keinem Skript. */
  const inKette = chain().order;
  chain().stranded.forEach((n) => {
    if (n.kind === 'base') return;
    add('warn', `“${n.title}” is not connected to your analysis table`,
      edgesOf(n.id).length
        ? 'It is linked to another block, but there is no path from your analysis table to it, so nothing of it reaches the result and it does not appear in the code.'
        : 'A block with no line to another block contributes nothing and does not appear in the code.',
      'Drag from one of its keys to a matching key on a block that is already part of the chain, or remove it.', n.title,
      besteVerbindung(n, inKette) ||
        (baseNode() ? { label: 'Show me this block', do: 'showNode', node: n.id }
                    : { label: 'Show me the blocks', do: 'showPalette', group: 'Your analysis table' }));
  });

  /* Kanten. */
  S.edges.forEach((e) => {
    const A = nodeById(e.from.node), B = nodeById(e.to.node);
    if (!A || !B) return;
    const where = `${A.title} → ${B.title}`;

    const geoPairs = e.pairs.filter((p) => KEYS[keyOf(A, p.from).type].family === 'geo');
    const timePairs = e.pairs.filter((p) => KEYS[keyOf(A, p.from).type].family === 'time');
    const unitPairs = e.pairs.filter((p) => KEYS[keyOf(A, p.from).type].family === 'unit');

    geoPairs.forEach((p) => {
      const ka = keyOf(A, p.from), kb = keyOf(B, p.to);
      const ta = KEYS[ka.type], tb = KEYS[kb.type];
      const bruecke = bridgeFor(ka.type, kb.type);
      const tat = bruecke ? { label: 'Insert the bridge', do: 'bridge', edge: e.id, from: p.from, to: p.to, tpl: bruecke } : null;
      if (p.mode === 'crosswalk') {
        add('warn', `${ta.label} and ${tb.label} need a lookup table`,
          p.why, 'Put a bridge block between the two, or add the correspondence table to your project folder and load it in the script.', where, tat);
      }
      if (p.mode === 'weighted') {
        add('warn', `${ta.label} and ${tb.label} overlap rather than nest`,
          p.why + ' Whatever you do here is an approximation, and it has to be reported as one.',
          'Use a crosswalk with a share column and decide what the share means: population, addresses or area. Then either keep the largest share per unit, or take a weighted average afterwards.', where, tat);
      }
      if (p.mode === 'spatial') {
        add('warn', `${ta.label} and ${tb.label} meet on the map, not in a table`,
          p.why, 'Do the spatial step once, in a GIS or with <code>sf</code>, and save the result as a table with an area code. Everything after that is an ordinary join.', where, tat);
      }
      if (p.mode === 'derive') {
        const grob = (ta.rank || 0) <= (tb.rank || 0) ? ta : tb;
        const fein = grob === ta ? tb : ta;
        add('info', `${grob.label} can be read off ${fein.label}`,
          p.why + ' The script cuts the code to the right number of digits, which only works if the column is text with its leading zero intact.',
          'Nothing to do, as long as the leading-zero check below is followed.', where,
          { label: 'Show me in the code', do: 'showCode', lang: 'r', pattern: '_derived = substr' });
      }

      /* Richtung: fein an grob heißt aggregieren, grob an fein heißt verteilen. */
      const ra = ta.rank || 0, rb = tb.rank || 0;
      const baseSide = (A.kind === 'base') ? 'A' : (B.kind === 'base' ? 'B' : null);
      if (ra && rb && ra !== rb && baseSide) {
        const finerIsBase = (baseSide === 'A' ? ra > rb : rb > ra);
        if (!finerIsBase) {
          const fein = (A.kind === 'base') ? B : A;
          add(fein.aggregate ? 'ok' : 'warn', 'The attached data is finer than your unit of analysis',
            'You are attaching values measured for small areas to rows that stand for a larger area. There is no single value to attach, there are many.' +
            (fein.aggregate ? ' The script now aggregates before it joins.' : ''),
            fein.aggregate
              ? 'Open the R tab and set the weight column in the aggregation step: a plain mean over municipalities is not the district value, because municipalities differ in size.'
              : 'Aggregate the finer table first, and choose the aggregation on purpose. A plain mean over municipalities is not the district value; weight by population, or sum the counts and divide.',
            where,
            fein.aggregate ? null : { label: 'Add the aggregation step', do: 'aggregate', node: fein.id });
        } else {
          add('ok', 'Level fits: the wider value is copied onto every row inside it',
            'Your rows sit inside the areas of the attached table, so each row gets the value of the area it falls in. That is the ordinary case and it is safe.',
            '', where);
        }
      }
    });

    if (!e.pairs.length) {
      add('err', 'This link has no matching columns', 'An empty link produces nothing.', 'Remove it, or drag between two keys.', where,
        { label: 'Show me this link', do: 'showEdge', edge: e.id });
    }
  });

  /* Alles, was den fertigen Schritt betrifft, wird am Schritt geprüft und nicht an der
     einzelnen Kante: ein Block kann über zwei Kanten andocken, Gebiet an der einen, Jahr an
     der anderen, und das ist völlig in Ordnung. */
  chain().steps.forEach((st) => {
    const reg = st.node;
    const where = reg.title;
    const geoP = st.pairs.filter((q) => KEYS[q.l.type].family === 'geo');
    const timeP = st.pairs.filter((q) => KEYS[q.l.type].family === 'time');
    const unitP = st.pairs.filter((q) => KEYS[q.l.type].family === 'unit');

    if (!geoP.length && !unitP.length && timeP.length) {
      const vorschlag = besteVerbindung(reg, chain().order.filter((x) => x.id !== reg.id));
      add('err', `“${reg.title}” is attached on the year alone`,
        'Matching on the year only pairs every row of one side with every row of the other side for that year. The result is enormous and it is always wrong.',
        'Drag a second link between the area codes, or between the case identifiers.', where, vorschlag);
    }
    const e = { time: st.time };
    if (reg.y0 && reg.y1 && timeP.length) {
      const from = S.years.from, to = S.years.to;
      if (reg.y1 < from || reg.y0 > to) {
        add('err', `“${reg.title}” does not cover your years at all`,
          `Your analysis runs ${from} to ${to}; this table covers ${reg.y0} to ${reg.y1}. Every row would come back empty.`,
          'Change the years of your analysis table, or pick a source that reaches into your period.', where,
          { label: `Set the period to ${reg.y0}–${reg.y1}`, do: 'years', from: reg.y0, to: reg.y1 });
      } else if (reg.y0 > from || reg.y1 < to) {
        const miss = [];
        if (reg.y0 > from) miss.push(`${from} to ${reg.y0 - 1}`);
        if (reg.y1 < to) miss.push(`${reg.y1 + 1} to ${to}`);
        const ueber = { from: Math.max(from, reg.y0), to: Math.min(to, reg.y1) };
        add('warn', `Missing years: ${miss.join(' and ')}`,
          `Your analysis runs ${from} to ${to}, this table covers ${reg.y0} to ${reg.y1}. Rows outside that range get a missing value, and a model that drops missing rows will quietly lose them without saying so.`,
          'Either cut the analysis to the overlap, or carry the nearest available year forward and control for it.', where,
          { label: `Cut the period to ${ueber.from}–${ueber.to}`, do: 'years', from: ueber.from, to: ueber.to });
        if (st.time === 'exact') {
          add('info', 'Or take the nearest year that exists',
            'Instead of losing those rows, the link can match each row to the closest year the table has. Defensible for context that moves slowly, misleading for anything that moves fast.',
            'The script then carries the distance to the matched year as a column, so you can report how often it was used.', where,
            { label: 'Match the nearest year', do: 'time', mode: 'nearest', edges: st.edges.map((x) => x.id) });
        }
      } else {
        add('ok', 'The years line up', `Your period ${from} to ${to} sits inside the ${reg.y0} to ${reg.y1} this table covers.`, '', where);
      }
      if (e.time === 'nearest' || e.time === 'lag1') {
        add('info', st.time === 'lag1' ? 'The link uses the previous year on purpose' : 'The link uses the nearest available year',
          e.time === 'lag1'
            ? 'Most regional figures describe 31 December. An interview in spring is therefore closer to the situation the previous year-end describes than to the one at the end of the year it happened in.'
            : 'Where the exact year is missing, the closest one is used instead. That is defensible for slow-moving context and misleading for anything that moves fast.',
          'Keep the distance to the matched year as a column so you can show how often it was used. Whether it is defensible for your outcome is your call.', where,
          { label: 'Show me the setting', do: 'showEdge', edge: (st.edges[0] || {}).id });
      }
    }
  });

  /* Nur Schlüssel, die wirklich an einer Kante hängen. Ein Block bietet mehr Spalten an,
     als man benutzt; Warnungen über eine Gemeindekennziffer, die in keinem Verbund vorkommt,
     sind Lärm und lassen die echten Warnungen untergehen. */
  const usedTypes = new Set();
  S.edges.forEach((e) => {
    const A = nodeById(e.from.node), B = nodeById(e.to.node);
    e.pairs.forEach((q) => {
      const ka = keyOf(A, q.from), kb = keyOf(B, q.to);
      if (ka) usedTypes.add(ka.type);
      if (kb) usedTypes.add(kb.type);
    });
  });
  const usedNames = [];
  S.edges.forEach((e) => {
    const A = nodeById(e.from.node), B = nodeById(e.to.node);
    e.pairs.forEach((q) => {
      const ka = keyOf(A, q.from), kb = keyOf(B, q.to);
      if (ka) usedNames.push(ka.name);
      if (kb) usedNames.push(kb.name);
    });
  });

  /* Führende Nullen: gilt, sobald ein amtlicher Schlüssel wirklich verknüpft wird. */
  const anyAgs = ['ags2', 'ags3', 'ags5', 'ags8', 'plz'].some((t) => usedTypes.has(t));
  if (anyAgs) {
    add('info', 'Keep area codes as text, with the leading zero',
      'Schleswig-Holstein is 01, Berlin is 11. Read as a number, 01001 becomes 1001, and it will not match anything. Spreadsheet software does this silently on open, and so does every CSV reader that guesses column types.',
      'Read the key column as text, and repair anything already damaged by padding it back to width: <code>sprintf("%05d", x)</code> in R, <code>string(x, "%05.0f")</code> in Stata. The generated script does both.', '',
      { label: 'Show me in the code', do: 'showCode', lang: 'r', pattern: 'sprintf\\("%0' });
  }

  /* Gebietsstand. */
  const geoFine = usedTypes.has('ags5') || usedTypes.has('ags8') || usedTypes.has('nuts3') ||
                  usedTypes.has('plz') || usedTypes.has('grid') || usedTypes.has('coord');
  if (geoFine) {
    const hits = REFORMS.filter((r) => r.year >= S.years.from && r.year <= S.years.to);
    const usesRek = usedNames.some((n) => /rek/.test(n));
    /* Gibt es an einer verknüpften Spalte eine zurückgerechnete Schwester, ist der Wechsel
       dorthin die ganze Abhilfe, und der Knopf macht ihn. */
    let rekTat = null;
    if (!usesRek) {
      S.edges.forEach((e) => {
        const A = nodeById(e.from.node), B = nodeById(e.to.node);
        if (!A || !B) return;
        e.pairs.forEach((q) => {
          [[A, q.from, 'from'], [B, q.to, 'to']].forEach(([nd, kid]) => {
            const k = keyOf(nd, kid);
            if (!k || k.type !== 'ags5' || /rek/.test(k.name)) return;
            const rek = nd.keys.find((x) => x.type === 'ags5' && /rek/.test(x.name));
            if (rek && !rekTat) {
              rekTat = { label: `Match on ${rek.name} instead`, do: 'rek', edge: e.id,
                         srcNode: nd.id, oldKey: k.id, newKey: rek.id };
            }
          });
        });
      });
    }
    if (hits.length) {
      add(usesRek ? 'info' : 'warn', `Your period crosses ${hits.length} district reform${hits.length === 1 ? '' : 's'}`,
        'District codes are not stable over time. When districts merge, old codes disappear and a new one appears, so the same place carries different codes in different years and a naive join loses exactly those places.' +
        '<ul>' + hits.map((r) => `<li><b>${r.year}, ${esc(r.where)}.</b> ${esc(r.what)}</li>`).join('') + '</ul>' +
        (usesRek ? 'You are using a recoded key, which is the right answer to this.' : ''),
        usesRek
          ? 'Make sure the regional table is on the same reference date. INKAR and the BBSR reference system are on the 2023 boundaries, which is what <code>kkz_rek</code> uses.'
          : 'Use a key that has been recoded to one reference date on both sides. In SOEP that is <code>kkz_rek</code> (boundaries of 31.12.2023) rather than <code>kkz</code>. Otherwise put a <b>District boundary crosswalk</b> block in between.',
        '', rekTat || { label: 'Show me the crosswalk block', do: 'showPalette', card: 'District boundary crosswalk' });
    } else {
      add('ok', 'No district reform falls in your period', 'Between ' + S.years.from + ' and ' + S.years.to + ' the district boundaries did not change, so the codes are comparable across your years.', '');
    }
    if (usedTypes.has('ags8')) {
      add('info', 'Municipal boundaries change almost every year',
        'Unlike districts, municipalities merge and split constantly, in some states in every legislative period. There is no year in which nothing happened.',
        'Work on one reference date and convert both sides to it, using the Destatis Gebietsstand tables or the BBSR reference system.', '',
      { label: 'Show me the crosswalk block', do: 'showPalette', card: 'District boundary crosswalk' });
    }
  }

  /* Vervielfachung von Zeilen: einmal je zugespielter Tabelle. */
  const attached = chain().steps.map((st) => nodeById(st.right)).filter(Boolean);
  attached.filter((n) => !n.weightCol && n.tplId !== 'regionl').forEach((lookup) => {
    add('info', `“${lookup.title}” must have one row per key`,
      'If the attached table still carries a dimension you have not filtered out (a sex breakdown, an age group, several indicators stacked on top of each other), then one key value appears several times. The join then multiplies your rows, silently, and every count and every regression afterwards is wrong.',
      'The generated script refuses to run in that case: <code>relationship = "many-to-one"</code> in R, and <code>isid</code> plus <code>merge m:1</code> in Stata, all stop with an error rather than hand you a bigger table.', lookup.title,
      { label: 'Show me in the code', do: 'showCode', lang: 'r', pattern: 'anyDuplicated' });
  });

  /* SOEP-Vertraulichkeit. */
  const soep = S.nodes.find((n) => n.tplId === 'soep_person' || n.tplId === 'soep_hh');
  const bridge = S.nodes.find((n) => n.tplId === 'regionl');
  /* Der wichtigste Hinweis für SOEP darf nicht davon abhängen, dass schon ein
     Gebietsschlüssel verknüpft ist: gerade wenn keiner da ist, fehlt er ja. */
  if (soep && !bridge && S.nodes.some((n) => n.kind === 'regional') &&
      !soep.keys.some((k) => KEYS[k.type].family === 'geo')) {
    add('err', 'The SOEP block has no area code yet',
      'Neither the person file nor the household file carries a district, a municipality or a postcode. The regional file is what connects a household and a survey year to a place, and without it there is nothing for regional data to meet.',
      'Add <b>SOEPregion (regionl)</b> and link it on <code>hid</code> and <code>syear</code>. It is applied for separately and used inside the FDZ; see <a href="/Accessing.html" target="_blank" rel="noopener">Accessing georeferenced data</a>.',
      soep.title, { label: 'Add SOEPregion and link it', do: 'addRegionl', node: soep.id });
  }
  if (soep && geoFine) {
    add('warn', 'District-level SOEP data is not in the download',
      'The standard SOEP distribution stops at the federal state. Districts, municipalities, postcodes and coordinates live in the separate regional data, which is applied for on its own and used inside the research data centre.',
      'Plan this as an on-site or remote-execution analysis: the script below is what you take there. Which route you apply for is a decision, and it depends on whether you need area codes or coordinates.', '',
      { label: 'Read how to get access', do: 'open', url: '/Accessing.html' });
    const soepGeoLinked = S.edges.some((e) => {
      const ends = [[nodeById(e.from.node), 'from'], [nodeById(e.to.node), 'to']];
      return ends.some(([n, side]) => n && n.id === soep.id &&
        e.pairs.some((q) => { const k = keyOf(n, side === 'from' ? q.from : q.to); return k && KEYS[k.type].family === 'geo'; }));
    });
    if (!bridge && !soepGeoLinked) {
      add('err', 'The SOEP block still has no area code',
        'The regional data on the canvas is keyed by place, and the SOEP side has nothing to match it with.',
        'Add <b>SOEPregion (regionl)</b> and link it on <code>hid</code> and <code>syear</code>.', soep.title,
        { label: 'Add SOEPregion and link it', do: 'addRegionl', node: soep.id });
    }
  }

  /* Die Quelle führt die gewünschte Ebene nicht. */
  S.nodes.forEach((n) => {
    if (n.kind !== 'regional' || !n.levels || !n.wanted || n.levels.includes(n.wanted)) return;
    add('info', `“${n.title}” is not published at ${(LEVEL_LABEL[n.wanted] || n.wanted).toLowerCase()}`,
      `You asked for ${(LEVEL_LABEL[n.wanted] || n.wanted).toLowerCase()}, and this indicator exists at ` +
      n.levels.map((l) => (LEVEL_LABEL[l] || l).toLowerCase()).join(' and ') + ' only. The link therefore crosses levels.',
      'Either accept the coarser or finer level and read the level check above, or search for a different indicator that is published at the level you need.', n.title,
      n.levels.length ? { label: `Use ${(LEVEL_LABEL[n.level] || n.level).toLowerCase()} instead`, do: 'level', node: n.id, level: n.level } : null);
  });

  /* Der räumliche Schritt hat eigene Fallstricke, die kein Tabellenverbund hat. */
  S.nodes.filter((n) => n.spatial && edgesOf(n.id).length).forEach((n) => {
    add('warn', 'The spatial step decides more than it looks',
      'Turning a point into an area is three choices, and all three change the result. ' +
      '<b>Which boundaries:</b> they move, so a 2015 point in 2023 boundaries lands in a district that did not exist then. ' +
      '<b>Which coordinate system:</b> longitude and latitude in degrees against boundaries in metres silently puts every point off the map, and the join returns nothing rather than an error. ' +
      '<b>What counts as inside:</b> a point on a boundary, an address geocoded to the centre of its street, or a coordinate blurred for privacy each land somewhere slightly wrong.',
      'Use the official boundaries for the reference date of your data (the BKG publishes VG250 free of charge), put both layers in the same projected CRS (ETRS89 / UTM 32N, EPSG 25832, for Germany) before joining, and count the points that matched no polygon. If that count is not near zero, the CRS is wrong.', n.title,
      { label: 'Show me in the code', do: 'showCode', lang: 'r', pattern: 'st_transform' });
  });

  /* Gewichtete Zuordnungstabellen vervielfachen Zeilen mit Absicht. */
  S.nodes.filter((n) => n.weightCol && edgesOf(n.id).length).forEach((n) => {
    if (n.pickLargest) {
      add('ok', `“${n.title}” now keeps one row per unit`,
        `The script takes only the largest share per key, so your rows are not multiplied. The price is a small misallocation: a case in a postcode split across two districts is assigned wholly to the bigger side.`,
        'Report that you did this, and how large the second share typically is.', n.title);
      return;
    }
    add('warn', `“${n.title}” multiplies rows on purpose`,
      `A postcode that lies in two districts appears twice in this table, once per district, with a share in <code>${esc(n.weightCol)}</code>. Attaching it therefore turns one row of yours into two, and any count you run afterwards is inflated.`,
      'Decide before you join: keep only the largest share per unit (one row again, and you accept a small misallocation), or keep all rows and collapse back afterwards with a weighted mean. The script does the second and marks the place.', n.title,
      { label: 'Keep only the largest share', do: 'largest', node: n.id });
  });

  /* Quellenspezifisches. */
  const seen = new Set();
  S.nodes.forEach((n) => {
    const push = (k) => {
      if (seen.has(k)) return; seen.add(k);
      const s = SOURCE_NOTES[k];
      add('info', s.title, s.body, s.fix, n.title,
        s.code ? { label: 'Show me in the code', do: 'showCode', lang: 'r', pattern: s.code }
               : { label: 'Show me this block', do: 'showNode', node: n.id });
    };
    if (['regionalstatistik', 'genesis_bund', 'zensus2022', 'regionalatlas'].includes(n.sourceKey)) {
      push('destatisMissing'); push('decimalComma');
    }
    if (n.sourceKey === 'wegweiser_kommune') push('projection');
    if (n.sourceKey === 'zensus2022') push('singleYear');
    if (n.levels && n.levels.includes('grid')) push('gridSource');
    if (n.levels && n.levels.length === 1 && n.levels[0] === 'point') push('pointSource');
    if (n.restricted && n.kind === 'regional') push('restricted');
  });

  out.sort((a, b) => CHECK_ORDER[a.level] - CHECK_ORDER[b.level]);
  return out;
}

/* ================================================================= Code */
/* Reihenfolge: von der Analysetabelle aus in die Breite, damit der Code so liest, wie man
   arbeitet. Die linke Seite eines Schritts ist immer die schon zusammengebaute Tabelle, nicht
   ein einzelner Block: nach dem ersten Verbund stehen alle bisherigen Spalten darin, und ein
   späterer Verbund darf sich auf jede davon beziehen. Eine frühere Fassung ordnete jeden
   Schritt einem einzelnen Vorgängerblock zu und ließ dabei jede zweite Verbindung zu einem
   Block stillschweigend unter den Tisch fallen. */
function chain() {
  const base = baseNode();
  if (!base) return { order: [], steps: [], stranded: S.nodes.slice() };
  const order = [base], visited = new Set([base.id]), steps = [];
  let guard = 0;
  while (guard++ < 200) {
    /* Welcher Block als nächster drankommt, entscheidet die Reihenfolge im Skript, und zwar
       folgenreich: nimmt man erst den Regionaldatensatz und dann die Brücke, dann hängt die
       Brücke hinter ihm und ihr Gebietsschlüssel erreicht ihn nie. Brücken zuerst, dann was
       am festesten schon angebunden ist. */
    const kandidaten = new Map();
    for (const e of S.edges) {
      const aIn = visited.has(e.from.node), bIn = visited.has(e.to.node);
      if (aIn === bIn) continue;
      const id = aIn ? e.to.node : e.from.node;
      kandidaten.set(id, (kandidaten.get(id) || 0) + 1);
    }
    if (!kandidaten.size) break;
    let next = null, bester = -1;
    kandidaten.forEach((zahl, id) => {
      const n = nodeById(id);
      const rang = (n && n.kind === 'bridge' ? 100 : 0) + zahl;
      if (rang > bester) { bester = rang; next = id; }
    });
    if (!next) break;
    const n = nodeById(next);
    if (!n) break;
    const edges = S.edges.filter((e) =>
      (e.from.node === next && visited.has(e.to.node)) || (e.to.node === next && visited.has(e.from.node)));
    visited.add(next);
    order.push(n);
    steps.push(makeStep(n, edges));
  }
  return { order, steps, stranded: S.nodes.filter((n) => !visited.has(n.id)) };
}

/* Ein Schritt bündelt alle Verbindungen, über die ein Block an das bisher Gebaute andockt. */
function makeStep(node, edges) {
  const pairs = [];
  edges.forEach((e) => {
    const neuIstFrom = e.from.node === node.id;
    const N = node, O = nodeById(neuIstFrom ? e.to.node : e.from.node);
    e.pairs.forEach((q) => {
      const kNeu = keyOf(N, neuIstFrom ? q.from : q.to);
      const kAlt = keyOf(O, neuIstFrom ? q.to : q.from);
      if (kNeu && kAlt) pairs.push({ l: kAlt, r: kNeu, mode: q.mode, op: q.op, L: O, R: N });
    });
  });
  const erste = edges[0] || { join: 'left', time: 'exact' };
  return { node, right: node.id, edges, pairs, join: erste.join, time: erste.time,
           edge: erste, left: (edges[0] ? (edges[0].from.node === node.id ? edges[0].to.node : edges[0].from.node) : null) };
}

function pairsFor(step) { return step.pairs; }

/* Ein Variablenname, den man in einem Skript lesen kann, aus dem Titel des Blocks. */
function benenneQuelle(n) {
  const titel = (n.pick ? n.pick.label : n.title) || 'tab';
  const q = n.sourceKey || 'reg';
  /* Nicht "inkar_inkar_...": wenn der Titel die Quelle schon nennt, reicht der Titel. */
  return titel.toLowerCase().startsWith(q.toLowerCase()) ? titel : q + '_' + titel;
}
const varName = (n) => {
  const raw = (n.tplId === 'regionl' ? 'regionl'
    : n.tplId === 'soep_person' ? 'ppathl'
    : n.tplId === 'soep_hh' ? 'hgen'
    : n.tplId ? n.tplId
    : benenneQuelle(n));
  return raw.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 26) || 'tab';
};

function headerLines(title) {
  const base = baseNode();
  return [
    `# ${'-'.repeat(72)}`,
    `# ${title}`,
    `#`,
    `# Built with the GeoLAB Link Builder on ${new Date().toISOString().slice(0, 10)}.`,
    `# Analysis table: ${base ? base.title : '(none)'}, years ${S.years.from} to ${S.years.to}.`,
    `# This is a plan you still have to check against the files you actually downloaded:`,
    `# column names differ between exports, and the builder can only guess them.`,
    `# ${'-'.repeat(72)}`
  ];
}

function genR() {
  const { order, steps } = chain();
  if (!order.length) return '# Put your analysis table on the canvas first.';
  const L = headerLines('Linking survey microdata to German regional data');
  L.push('', 'library(dplyr)', 'library(readr)', '');

  order.forEach((n, i) => {
    const v = varName(n);
    L.push(`# ${i + 1}. ${n.title}  (${n.unit})`);
    if (n.restricted) L.push(`#    Restricted data: this step runs inside the research data centre.`);
    if (n.keyHint) L.push(...wrapComment(n.keyHint));
    if (n.pick) L.push(`#    Indicator: ${n.pick.label}`);
    if (n.url) L.push(`#    Source: ${n.url}`);
    const textCols = n.keys.filter((k) => ['ags2', 'ags3', 'ags5', 'ags8', 'plz', 'nuts1', 'nuts2', 'nuts3'].includes(k.type));
    if (n.recipe && n.recipe.r) {
      /* Für den räumlichen Schritt hilft kein Dateiname: hier steht, wie die Tabelle
         überhaupt erst entsteht. */
      L.push(`#    Build this table once, then it is an ordinary lookup:`);
      const basis = varName(order[0]);
      n.recipe.r.forEach((line) => L.push(line.replace(/\bpoints\b(?!_with)/g, basis)));
      L.push(`${v} <- points_with_areas`);
    } else {
      const reader = n.reader ? n.reader.r
        : `read_csv2("${v}.csv", locale = locale(encoding = "UTF-8"),\n           na = c("", "-", ".", "...", "/", "x"))`;
      L.push(`${v} <- ${reader}`);
    }
    if (textCols.length) {
      const widths = { ags2: 2, ags3: 3, ags5: 5, ags8: 8, plz: 5 };
      const muts = textCols.map((k, i) => {
        const w = widths[k.type];
        const komma = i < textCols.length - 1 ? ',' : '';
        return w
          ? `    \`${k.name}\` = sprintf("%0${w}d", as.integer(\`${k.name}\`))${komma}   # the leading zero is part of the code`
          : `    \`${k.name}\` = as.character(\`${k.name}\`)${komma}`;
      });
      L.push(`${v} <- ${v} |>`, '  mutate(', muts.join('\n'), '  )');
    }
    L.push('');
  });

  /* Abgeleitete Schlüssel, etwa Kreis aus Gemeinde. */
  steps.forEach((s) => {
    pairsFor(s).forEach((p) => {
      if (p.mode !== 'derive' || p.op !== 'truncate') return;
      const short = (KEYS[p.l.type].rank <= KEYS[p.r.type].rank) ? p : { ...p, l: p.r, r: p.l, L: p.R, R: p.L };
      const digits = KEYS[short.l.type].digits || 5;
      const v = varName(short.R);
      L.push(`# ${short.R.title}: cut the ${KEYS[short.r.type].label.toLowerCase()} down to its ${KEYS[short.l.type].label.toLowerCase()}`);
      L.push(`${v} <- ${v} |> mutate(${short.l.name}_derived = substr(\`${short.r.name}\`, 1, ${digits}))`, '');
    });
  });

  /* Eindeutigkeit der angespielten Seite. */
  /* Zuerst die Schritte, die der Nutzer über die Prüfungen angefordert hat: eine Aggregation
     auf die gröbere Ebene, oder den größten Anteil einer gewichteten Zuordnung. */
  steps.forEach((s) => {
    const ps = pairsFor(s);
    const R = nodeById(s.right);
    if (!R || !ps.length) return;
    const v = varName(R);
    if (R.pickLargest && R.weightCol) {
      const schluessel = ps.map((q) => rightCol(q)).join(', ');
      L.push(`# ${R.title}: keep the largest share per key, so the join cannot multiply rows.`);
      L.push(`# The price is a small misallocation, and it belongs in the write-up.`);
      L.push(`${v} <- ${v} |>`);
      L.push(`  group_by(${schluessel}) |>`);
      L.push(`  slice_max(${R.weightCol}, n = 1, with_ties = FALSE) |>`);
      L.push(`  ungroup()`, '');
    }
    if (R.aggregate) {
      const geo = ps.find((q) => KEYS[q.l.type].family === 'geo');
      const zeit = ps.find((q) => KEYS[q.l.type].family === 'time');
      if (geo) {
        const grob = KEYS[geo.l.type].digits;
        const nach = [grob ? `${geo.l.name} = substr(${geo.r.name}, 1, ${grob})` : `${geo.l.name} = ${geo.r.name}`]
          .concat(zeit ? [zeit.r.name] : []).join(', ');
        L.push(`# ${R.title} is finer than your unit of analysis, so it is aggregated first.`);
        L.push(`# CHOOSE THE WEIGHT: a plain mean over the small areas is NOT the value of the`);
        L.push(`# larger one, because the small areas differ in size. Population is the usual choice;`);
        L.push(`# for counts, sum them and divide by the summed denominator instead.`);
        L.push(`${v} <- ${v} |>`);
        L.push(`  group_by(${nach}) |>`);
        L.push(`  summarise(across(where(is.numeric), ~ weighted.mean(.x, w = weight, na.rm = TRUE)),`);
        L.push(`            .groups = "drop")`, '');
      }
    }
  });

  steps.forEach((s) => {
    const ps = pairsFor(s);
    const R = nodeById(s.right);
    if (!ps.length || !R) return;
    if (R.weightCol && !R.pickLargest) {
      /* Eine gewichtete Zuordnungstabelle ist absichtlich nicht eindeutig; hier zu prüfen
         hieße, das Skript an genau der Stelle abbrechen zu lassen, die so gewollt ist. */
      L.push(`# ${R.title} has several rows per key on purpose, so no uniqueness check here.`, '');
      return;
    }
    const v = varName(R);
    const cols = ps.map((p) => `"${rightCol(p)}"`).join(', ');
    L.push(`# ${R.title} must have one row per key, otherwise the join multiplies rows`);
    L.push(`stopifnot(!anyDuplicated(${v}[c(${cols})]))`, '');
  });

  const baseV = varName(order[0]);
  L.push('# Join. Each step keeps the rows of the analysis table and attaches one table to them.');
  const joinLines = [`dat <- ${baseV}`];
  const pushJoin = (line) => joinLines.push(line);
  steps.forEach((s) => {
    const ps = pairsFor(s);
    if (!ps.length) return;
    const v = varName(nodeById(s.right));
    /* "Vorjahr" heißt: die Zeile aus Jahr t bekommt den Wert von t-1. Dafür braucht die
       Analysetabelle eine Hilfsspalte, sonst müsste man im Verbund rechnen, was dplyr nicht kann. */
    if (s.time === 'lag1') {
      const t = ps.find((q) => KEYS[q.l.type].family === 'time');
      if (t) {
        pushJoin(`  mutate(${t.l.name}_lag = ${t.l.name} - 1L)   # the 31 December before the interview`);
        t.lagged = true;
      }
    }
    const aggregiert = !!nodeById(s.right).aggregate;
    const by = ps.map((p) => {
      const l = p.lagged ? p.l.name + '_lag' : leftCol(p);
      const r = aggregiert && KEYS[p.l.type].family === 'geo' ? p.l.name : rightCol(p);
      return l === r ? `"${l}"` : `"${l}" = "${r}"`;
    }).join(', ');
    const fn = s.join === 'inner' ? 'inner_join' : 'left_join';
    const R = nodeById(s.right);
    if (R.weightCol) {
      /* Der Kommentar bekommt eine eigene Zeile: an das Ende einer Verbundzeile gehängt,
         landet der Pipe dahinter und ist auskommentiert. */
      pushJoin('  # one row per overlap, collapsed again below');
      pushJoin(`  ${fn}(${v}, by = c(${by}), relationship = "many-to-many")`);
    } else {
      pushJoin(`  ${fn}(${v}, by = c(${by}), relationship = "many-to-one")`);
    }
  });
  /* Der native Pipe gehört ans Zeilenende. Steht er vorne, bricht R die Zeile davor ab und
     wertet sie für sich aus, was hier stillschweigend nur die Analysetabelle ergäbe. */
  joinLines.forEach((line, i) => {
    const kommentar = /^\s*#/.test(line);
    const letzte = i === joinLines.length - 1;
    L.push(kommentar || letzte ? line : line + ' |>');
  });
  L.push('');
  const wt = order.find((n) => n.weightCol && !n.pickLargest);
  if (wt) {
    L.push(`# ${wt.title} split some of your rows: each ${''}unit that lies in more than one area`);
    L.push('# now appears once per area. Collapse back to one row per case with a weighted mean,');
    L.push('# and do it before you count anything:');
    L.push('# dat <- dat |>');
    L.push(`#   group_by(across(all_of(c(${order[0].keys.map((k) => `"${k.name}"`).join(', ')})))) |>`);
    L.push(`#   summarise(across(where(is.numeric), ~ weighted.mean(.x, ${wt.weightCol}, na.rm = TRUE)), .groups = "drop")`);
    L.push('# The alternative is to keep only the largest share per case, before the join:');
    L.push(`# ${varName(wt)} <- ${varName(wt)} |> group_by(${wt.keys[0].name}) |> slice_max(${wt.weightCol}, n = 1) |> ungroup()`);
    L.push('');
  }
  L.push('# How well did it match?');
  L.push(`cat("rows:", nrow(dat), "\\n")`);
  L.push(`# Replace <value> with a column that only the attached table has:`);
  L.push(`# dat |> summarise(unmatched = sum(is.na(<value>)), share = mean(is.na(<value>)))`);
  L.push(`# And look at what did not match, it is never random:`);
  L.push(`# dat |> filter(is.na(<value>)) |> count(${firstGeoName(order)}, sort = TRUE)`);
  return L.join('\n');
}

function genStata() {
  const { order, steps } = chain();
  if (!order.length) return '* Put your analysis table on the canvas first.';
  const L = headerLines('Linking survey microdata to German regional data').map((l) => l.replace(/^#/, '*'));
  L.push('', 'version 17', 'clear all', 'set more off', '');

  /* Stata spielt in die offene Datei hinein, also müssen die Zuspieltabellen vorher als .dta
     bereitliegen. Umbenannt wird dabei die ZUGESPIELTE Seite auf die Namen der Analysetabelle:
     benennt man stattdessen im Master um, ist die Spalte beim nächsten merge weg. */
  const stepOf = (id) => steps.find((st) => st.right === id);
  order.slice(1).forEach((n, i) => {
    const v = varName(n);
    const st = stepOf(n.id);
    const ps = st ? pairsFor(st) : [];
    L.push(`* ${i + 2}. ${n.title}  (${n.unit})`);
    if (n.restricted) L.push('*    Restricted data: this step runs inside the research data centre.');
    if (n.keyHint) L.push(...wrapComment(n.keyHint, '*'));
    if (n.pick) L.push(...wrapComment('Indicator: ' + n.pick.label, '*'));
    if (n.url) L.push(`*    Source: ${n.url}`);
    L.push(n.reader ? n.reader.stata
      : `import delimited "${v}.csv", delimiter(";") varnames(1) stringcols(_all) encoding("UTF-8") clear`);
    if (!n.reader) {
      L.push('* Destatis exports write -, ., ... , / or x where a number is missing:');
      L.push('* foreach v of varlist _all { replace `v' + "' = \"\" if inlist(`v'" + ', "-", ".", "...", "/", "x") }');
    }
    n.keys.filter((k) => ['ags2', 'ags3', 'ags5', 'ags8', 'plz'].includes(k.type)).forEach((k) => {
      const w = { ags2: 2, ags3: 3, ags5: 5, ags8: 8, plz: 5 }[k.type];
      L.push(`capture confirm string variable ${k.name}`);
      L.push(`if _rc {`);
      L.push(`    gen str${w} ${k.name}_s = string(${k.name}, "%0${w}.0f")   // area codes stay text`);
      L.push(`    drop ${k.name}`);
      L.push(`    rename ${k.name}_s ${k.name}`);
      L.push(`}`);
    });
    ps.forEach((q) => {
      const l = leftCol(q), r = rightCol(q);
      if (l !== r) L.push(`rename ${r} ${l}   // the analysis table calls this ${l}`);
    });
    if (st && st.time === 'lag1') {
      const t = ps.find((q) => KEYS[q.l.type].family === 'time');
      if (t) L.push(`replace ${leftCol(t)} = ${leftCol(t)} + 1   // context of 31 Dec t-1 meets the interview in t`);
    }
    if (n.pickLargest && n.weightCol) {
      const schluessel = ps.map((q) => leftCol(q)).join(' ');
      L.push(`* keep the largest share per key, so the merge cannot multiply rows`);
      L.push(`bysort ${schluessel} (${n.weightCol}): keep if _n == _N`);
    }
    if (n.aggregate) {
      const geo = ps.find((q) => KEYS[q.l.type].family === 'geo');
      const zeit = ps.find((q) => KEYS[q.l.type].family === 'time');
      if (geo) {
        const grob = KEYS[geo.l.type].digits;
        if (grob) L.push(`gen str${grob} ${geo.l.name} = substr(${leftCol(geo)}, 1, ${grob})`);
        L.push(`* CHOOSE THE WEIGHT: a plain mean over the small areas is not the value of the`);
        L.push(`* larger one. Population is the usual choice; for counts, sum instead.`);
        L.push(`collapse (mean) _all [aw=weight], by(${geo.l.name}${zeit ? ' ' + leftCol(zeit) : ''})`);
      }
    }
    if (ps.length && !(n.weightCol && !n.pickLargest)) {
      const keys = ps.map((q) => leftCol(q)).join(' ');
      L.push(`isid ${keys}   // stops here if the key is not unique, which is what would multiply your rows`);
    }
    L.push(`save "${v}.dta", replace`, '');
  });

  const b = order[0];
  L.push(`* 1. ${b.title}  (${b.unit})`);
  L.push(b.reader ? b.reader.stata : `use "${varName(b)}.dta", clear`, '');

  steps.forEach((st, i) => {
    const ps = pairsFor(st);
    if (!ps.length) return;
    const R = nodeById(st.right);
    const v = varName(R);
    const keys = ps.map((q) => leftCol(q)).join(' ');
    const keep = st.join === 'inner' ? 'keep(match)' : 'keep(master match)';
    L.push(`* attach ${R.title}`);
    if (R.weightCol && !R.pickLargest) {
      L.push(`* This table has several rows per key on purpose, so m:1 would refuse. joinby keeps`);
      L.push(`* every overlap, which means your rows are multiplied and have to be collapsed after.`);
      L.push(`joinby ${keys} using "${v}.dta", unmatched(master) _merge(_merge${i + 1})`);
    } else {
      L.push(`merge m:1 ${keys} using "${v}.dta", ${keep} gen(_merge${i + 1})`);
    }
    L.push(`label variable _merge${i + 1} "1 = no regional value for this row, 3 = matched"`);
    L.push(`tab _merge${i + 1}`, '');
  });
  L.push('* What did not match is never random, so look at it before you drop it:');
  L.push(`* tab ${firstGeoName(order)} if _merge1 == 1, sort`);
  return L.join('\n');
}

function leftCol(p) {
  if (p.mode === 'derive' && p.op === 'truncate' && KEYS[p.l.type].rank > KEYS[p.r.type].rank) return p.r.name + '_derived';
  return p.l.name;
}
function rightCol(p) {
  if (p.mode === 'derive' && p.op === 'truncate' && KEYS[p.r.type].rank > KEYS[p.l.type].rank) return p.l.name + '_derived';
  return p.r.name;
}
function firstGeoName(order) {
  for (const n of order) for (const k of n.keys) if (KEYS[k.type].family === 'geo') return k.name;
  return 'key';
}
function wrapComment(text, mark = '#') {
  const words = String(text).replace(/<[^>]+>/g, '').split(/\s+/);
  const out = []; let line = `${mark}    `;
  words.forEach((w) => {
    if ((line + w).length > 88) { out.push(line); line = `${mark}    `; }
    line += w + ' ';
  });
  if (line.trim() !== mark) out.push(line.replace(/\s+$/, ''));
  return out;
}

/* ------------------------------------------------------------------ Plan in Worten */
function genPlan() {
  const { order, steps } = chain();
  const base = baseNode();
  if (!base) return '<p class="hint">Put your analysis table on the canvas and the plan appears here.</p>';
  const need = order.filter((n) => n.kind !== 'base');
  const html = [];
  html.push('<h3>What you are building</h3>');
  html.push(`<div class="out">One row per <b>${esc(base.unit.replace(/^one row per /, ''))}</b>, ` +
    `with ${need.length ? esc(need.map((n) => n.title).join(', ')) : 'nothing attached yet'} joined on.</div>`);

  html.push('<h3>What you need first</h3><ol>');
  order.forEach((n) => {
    html.push(`<li><b>${esc(n.title)}</b>${n.restricted ? ' <em>(apply for access, work on site)</em>' : ''}` +
      (n.url ? ` &middot; <a href="${esc(n.url)}" target="_blank" rel="noopener">source</a>` : '') +
      (n.pick ? `<br><span class="hint">Indicator: ${esc(n.pick.label)}</span>` : '') + '</li>');
  });
  html.push('</ol>');

  html.push('<h3>Steps</h3><ol>');
  html.push(`<li>Load <b>${esc(base.title)}</b> and keep the columns you need. Its rows are the rows of the result.</li>`);
  steps.forEach((s) => {
    const R = nodeById(s.right), ps = pairsFor(s);
    html.push(`<li>Load <b>${esc(R.title)}</b>, make sure it has exactly one row per ` +
      esc(ps.map((p) => KEYS[p.r.type].label.toLowerCase()).join(' and ')) +
      `, then attach it on ${ps.map((p) => `<code>${esc(leftCol(p))}</code> = <code>${esc(rightCol(p))}</code>`).join(' and ')}.</li>`);
  });
  html.push('<li>Count how many rows found no match, and look at <em>which</em> ones. Unmatched rows cluster: one state, one year, the districts that were merged.</li>');
  html.push('<li>Write down the reference date of the boundaries you used and the vintage of every file. Six months later, nobody remembers.</li>');
  html.push('</ol>');

  const errs = S.checks.filter((c) => c.level === 'err');
  const warns = S.checks.filter((c) => c.level === 'warn');
  if (errs.length || warns.length) {
    html.push('<h3>Before you run it</h3><ol>');
    errs.concat(warns).forEach((c) => html.push(`<li>${esc(c.title)}</li>`));
    html.push('</ol>');
  }
  return html.join('');
}

/* ================================================================= Rechte Spalte */
function renderRight() {
  S.checks = runChecks();
  const errs = S.checks.filter((c) => c.level === 'err').length;
  const warns = S.checks.filter((c) => c.level === 'warn').length;
  const c = $('#c-checks');
  c.textContent = String(errs + warns || S.checks.length);
  c.className = 'count' + (errs ? ' bad' : warns ? ' warn' : '');
  c.title = `${errs} blocking, ${warns} to decide`;

  $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.id === 'tab-' + S.tab)));
  const host = $('#panels');
  host.innerHTML = '';
  host.appendChild(inspector());

  if (S.tab === 'checks') host.appendChild(checksPanel());
  else if (S.tab === 'plan') host.appendChild(el('div', 'recipe', genPlan()));
  else host.appendChild(codePanel(S.tab));
}

function checksPanel() {
  const wrap = el('div', 'checks');
  const n = { err: 0, warn: 0, info: 0, ok: 0 };
  S.checks.forEach((c) => n[c.level]++);
  wrap.appendChild(el('div', 'summary-strip',
    `<div><b>${n.err}</b> blocking</div><div><b>${n.warn}</b> to decide</div>` +
    `<div><b>${n.info}</b> to know</div><div><b>${n.ok}</b> fine</div>`));
  const marks = { err: '×', warn: '!', info: 'i', ok: '✓' };
  S.checks.forEach((c) => {
    const d = el('details', 'check ' + c.level);
    d.open = c.level === 'err';
    d.innerHTML =
      `<summary><span class="mark">${marks[c.level]}</span><span><span class="h">${c.title}</span>` +
      (c.where ? `<span class="where">${esc(c.where)}</span>` : '') + '</span></summary>' +
      `<div class="body">${c.body}</div>` +
      (c.fix ? `<div class="fix"><b>What to do.</b> ${c.fix}</div>` : '');
    if (c.action) {
      /* Ein Knopf, der etwas ändert, sieht anders aus als einer, der nur hinführt: das eine
         darf man blind drücken, das andere ist eine Entscheidung, die beim Leser bleibt. */
      const zeigt = /^show|^open/.test(c.action.do || '');
      const b = el('button', 'btn ' + (zeigt ? 'ghost' : 'primary'), esc(c.action.label));
      b.style.cssText = 'margin:.5rem 0 0 1.6rem';
      b.title = zeigt ? 'Takes you to the place where you decide this'
                      : 'Applies this to the canvas and to the generated code';
      b.addEventListener('click', (ev) => { ev.preventDefault(); applyAction(c.action); });
      d.appendChild(b);
    }
    wrap.appendChild(d);
  });
  return wrap;
}

function codePanel(lang) {
  const code = lang === 'r' ? genR() : genStata();
  const wrap = el('div', 'codewrap');
  const bar = el('div', 'codebar');
  const copy = el('button', 'btn', 'Copy');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code); toast('Copied.'); }
    catch (e) { toast('The browser refused clipboard access; select the text instead.'); }
  });
  const dl = el('button', 'btn ghost', lang === 'r' ? 'Download .R' : 'Download .do');
  dl.addEventListener('click', () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = lang === 'r' ? 'link_regional_data.R' : 'link_regional_data.do';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  bar.appendChild(copy); bar.appendChild(dl);
  wrap.appendChild(bar);
  const pre = el('pre', 'code');
  pre.innerHTML = highlight(code, lang, S.codeMark);
  wrap.appendChild(pre);
  return wrap;
}

function highlight(code, lang, mark) {
  const kw = lang === 'r'
    ? /\b(library|mutate|left_join|inner_join|stopifnot|read_csv2|summarise|filter|count|nrow|substr|sprintf|as\.integer|as\.character|anyDuplicated|cat|locale|na|group_by|slice_max|ungroup|weighted\.mean|across)\b/g
    : /\b(use|save|merge|joinby|isid|collapse|import|delimited|rename|replace|gen|drop|tab|version|clear|capture|confirm|string|bysort|keep)\b/g;
  const faerben = (zeile) => esc(zeile)
    .replace(/^([*#].*)$/, '<span class="c">$1</span>')
    .replace(/(&quot;[^&]*?&quot;)/g, '<span class="s">$1</span>')
    .replace(kw, '<span class="k">$&</span>');
  let re = null;
  try { re = mark ? new RegExp(mark) : null; } catch (e) { re = null; }
  let schon = false;
  return code.split('\n').map((zeile) => {
    const h = faerben(zeile);
    if (re && !schon && re.test(zeile)) { schon = true; return `<span class="codemark">${h}</span>`; }
    return h;
  }).join('\n');
}

/* ------------------------------------------------------------------ Inspektor */
function inspector() {
  const box = el('div', '');
  if (!S.sel) return box;

  if (S.sel.kind === 'edge') {
    const e = S.edges.find((x) => x.id === S.sel.id);
    if (!e) { S.sel = null; return box; }
    const A = nodeById(e.from.node), B = nodeById(e.to.node);
    const d = el('div', 'insp');
    d.innerHTML = `<div class="eyebrow">Selected link</div>` +
      `<h4>${esc(A.title)} → ${esc(B.title)}</h4>` +
      `<div class="sub">Matching on ${e.pairs.length} column pair${e.pairs.length === 1 ? '' : 's'}.</div>`;

    const list = el('div', 'keylist');
    e.pairs.forEach((p, i) => {
      const ka = keyOf(A, p.from), kb = keyOf(B, p.to);
      if (!ka || !kb) return;
      const row = el('div', 'keyrow',
        `<span style="flex:1 1 auto;font-family:var(--mono);font-size:.76rem">${esc(ka.name)} = ${esc(kb.name)}</span>` +
        `<span style="font-size:.7rem;color:var(--faint)">${esc(p.mode)}</span>`);
      const x = el('button', '', '×'); x.title = 'Remove this pair';
      x.addEventListener('click', () => {
        e.pairs.splice(i, 1);
        if (!e.pairs.length) S.edges = S.edges.filter((z) => z.id !== e.id);
        render();
      });
      row.appendChild(x);
      list.appendChild(row);
    });
    d.appendChild(el('label', '', 'Column pairs'));
    d.appendChild(list);

    d.appendChild(el('label', '', 'Which rows do you keep?'));
    const j = el('select');
    j.innerHTML = `<option value="left">All rows of my analysis table, even unmatched ones</option>` +
                  `<option value="inner">Only rows that found a match</option>`;
    j.value = e.join;
    j.addEventListener('change', () => { e.join = j.value; render(); });
    d.appendChild(j);

    d.appendChild(el('label', '', 'How should the years meet?'));
    const t = el('select');
    t.innerHTML = `<option value="exact">Same year on both sides</option>` +
                  `<option value="lag1">Previous year (interview in year t, context at 31 Dec t−1)</option>` +
                  `<option value="nearest">Nearest year that exists</option>`;
    t.value = e.time;
    t.addEventListener('change', () => { e.time = t.value; render(); });
    d.appendChild(t);

    const del = el('button', 'btn ghost', 'Remove this link');
    del.style.marginTop = '.8rem';
    del.addEventListener('click', () => { S.edges = S.edges.filter((z) => z.id !== e.id); S.sel = null; render(); });
    d.appendChild(del);
    box.appendChild(d);
    return box;
  }

  const n = nodeById(S.sel.id);
  if (!n) { S.sel = null; return box; }
  const d = el('div', 'insp');
  d.innerHTML = `<div class="eyebrow">Selected block</div><h4>${esc(n.title)}</h4>` +
    `<div class="sub">${esc(n.subtitle || '')}</div>`;

  if (n.kind === 'base') {
    d.appendChild(el('label', '', 'Years your analysis covers'));
    const row = el('div', 'row');
    ['from', 'to'].forEach((which) => {
      const i = el('input'); i.type = 'number'; i.min = '1984'; i.max = '2040';
      i.value = S.years[which];
      i.addEventListener('change', () => {
        const v = parseInt(i.value, 10);
        if (!isNaN(v)) { S.years[which] = v; render(); }
      });
      row.appendChild(i);
    });
    d.appendChild(row);
    d.appendChild(el('p', 'hint', 'This is what the year checks compare the sources against.'));
  }

  if (n.kind !== 'base') {
    const b = el('button', 'btn', 'Use this as my analysis table');
    b.style.marginTop = '.6rem';
    b.title = 'Its rows become the rows of the result, and everything else is attached to them.';
    b.addEventListener('click', () => applyAction({ do: 'asBase', node: n.id }));
    d.appendChild(b);
    d.appendChild(el('p', 'hint',
      'Any table with rows of its own can be the one you analyse. SOEPregion, for instance, is one row per household and survey year.'));
  } else if (S.nodes.length > 1) {
    d.appendChild(el('p', 'hint', 'This is the analysis table: its rows are the rows of the result.'));
  }

  if (n.kind === 'regional' && n.levels && n.levels.length > 1) {
    d.appendChild(el('label', '', 'Which regional depth did you download?'));
    const sel = el('select');
    sel.innerHTML = n.levels.slice().sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b))
      .map((l) => `<option value="${l}">${esc(LEVEL_LABEL[l] || l)}</option>`).join('');
    sel.value = n.level;
    sel.addEventListener('change', () => { setLevel(n, sel.value); render(); });
    d.appendChild(sel);
    d.appendChild(el('p', 'hint',
      'One downloaded table has one regional depth. This source publishes several, and each is a separate file, so pick the one you actually have. Changing it releases any link that hung on the old key.'));
  }

  if (n.editable) {
    d.appendChild(el('label', '', 'Columns this table has'));
    const list = el('div', 'keylist');
    n.keys.forEach((k, i) => {
      const row = el('div', 'keyrow');
      const nameI = el('input'); nameI.type = 'text'; nameI.value = k.name;
      nameI.addEventListener('change', () => { k.name = nameI.value.trim() || 'col'; render(); });
      const sel = el('select');
      sel.innerHTML = Object.keys(KEYS).map((t) => `<option value="${t}">${esc(KEYS[t].label)}</option>`).join('');
      sel.value = k.type;
      sel.addEventListener('change', () => { k.type = sel.value; render(); });
      const x = el('button', '', '×'); x.title = 'Remove this column';
      x.addEventListener('click', () => { n.keys.splice(i, 1); render(); });
      row.appendChild(nameI); row.appendChild(sel); row.appendChild(x);
      list.appendChild(row);
    });
    d.appendChild(list);
    const add = el('button', 'btn ghost', '+ column');
    add.style.marginTop = '.5rem';
    add.addEventListener('click', () => { n.keys.push({ id: nid('k'), type: 'ags5', name: 'district' }); render(); });
    d.appendChild(add);
    d.appendChild(el('p', 'hint', 'Pick the type that matches what is really in the column. That is what the checks reason about.'));
  }

  if (n.pick && n.pick.url) {
    d.appendChild(el('p', 'hint',
      `<a href="${esc(n.pick.url)}" target="_blank" rel="noopener">Open this indicator at the source →</a>`));
  } else if (n.url) {
    d.appendChild(el('p', 'hint', `<a href="${esc(n.url)}" target="_blank" rel="noopener">Open the source →</a>`));
  }
  /* Der Weg zurück in den Finder: dort steht, was der Datensatz enthält, welche Jahre und
     Ebenen er wirklich führt und was daneben noch in Frage käme. Der Finder liest ?q=. */
  if (n.kind === 'regional') {
    d.appendChild(el('p', 'hint',
      `<a href="${esc(GEODB_SITE)}?q=${encodeURIComponent(n.pick ? n.pick.label : n.title)}"
          target="_blank" rel="noopener">Look this up in the GeoDB finder →</a>`));
  }
  box.appendChild(d);
  return box;
}

/* ================================================================= Führung */
/* Ein Schritt je Bildschirm. Alle vier Fragen untereinander waren höher als das Fenster, und
   die Trefferliste verschwand hinter der Fußleiste: wer zum ersten Mal hier ist, merkt so
   etwas nicht als Scrollproblem, sondern als "das Ding reagiert nicht". */
const GUIDE = { data: null, level: null, prodIdx: null, pick: null, years: null, step: 0 };
const GUIDE_STEPS = ['data', 'level', 'years', 'attach'];

function openGuide() {
  GUIDE.data = GUIDE.level = GUIDE.prodIdx = null;
  GUIDE.pick = null;
  GUIDE.years = { from: S.years.from, to: S.years.to };
  GUIDE.step = 0;
  const veil = el('div', 'veil');
  veil.id = 'veil';
  veil.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="gt">
      <div class="sheet-head">
        <div class="eyebrow" id="gstep">Step 1 of 4</div>
        <h2 id="gt">What are you linking?</h2>
        <p id="gsub">Four short questions, then the canvas is set up for you. Everything stays editable afterwards.</p>
      </div>
      <div class="sheet-body" id="gbody"></div>
      <div class="sheet-foot">
        <button class="btn ghost" id="g-cancel">Cancel</button>
        <span style="flex:1"></span>
        <button class="btn ghost" id="g-back">Back</button>
        <button class="btn primary" id="g-next">Next</button>
      </div>
    </div>`;
  document.body.appendChild(veil);
  veil.addEventListener('pointerdown', (e) => { if (e.target === veil) closeGuide(); });
  $('#g-cancel').addEventListener('click', closeGuide);
  $('#g-back').addEventListener('click', () => { GUIDE.step = Math.max(0, GUIDE.step - 1); drawGuide(); });
  $('#g-next').addEventListener('click', nextGuide);
  document.addEventListener('keydown', guideKeys);
  drawGuide();
}

function guideKeys(e) {
  if (e.key === 'Escape') closeGuide();
  if (e.key === 'Enter' && !$('#g-next').disabled && document.activeElement.type !== 'search') {
    e.preventDefault(); nextGuide();
  }
}
function closeGuide() {
  const v = $('#veil'); if (v) v.remove();
  document.removeEventListener('keydown', guideKeys);
}
function nextGuide() {
  if (GUIDE.step >= GUIDE_STEPS.length - 1) { buildFromGuide(); closeGuide(); return; }
  GUIDE.step++;
  drawGuide();
}

function guideReady() {
  const k = GUIDE_STEPS[GUIDE.step];
  if (k === 'data') return !!GUIDE.data;
  if (k === 'level') return !!GUIDE.level;
  if (k === 'years') return GUIDE.years && GUIDE.years.from <= GUIDE.years.to;
  return !!GUIDE.pick;
}

const GUIDE_TITLES = {
  data: ['Which data are you analysing?', 'This is the table whose rows you keep. Everything else gets attached to it.'],
  level: ['How precisely do you need the place?', 'The finer the level, the more it tells you, and the more careful you have to be.'],
  years: ['Which years does your data cover?', 'Every source is checked against this period, and you are told where it falls short.'],
  attach: ['What do you want to attach?', 'Ask in your own words. This is the same search the GeoDB finder uses, so German and English both work.']
};

function drawGuide() {
  const b = $('#gbody');
  if (!b) return;
  const k = GUIDE_STEPS[GUIDE.step];
  $('#gstep').textContent = `Step ${GUIDE.step + 1} of ${GUIDE_STEPS.length}`;
  $('#gt').textContent = GUIDE_TITLES[k][0];
  $('#gsub').textContent = GUIDE_TITLES[k][1];
  $('#g-back').style.visibility = GUIDE.step === 0 ? 'hidden' : 'visible';
  b.innerHTML = '';

  if (k === 'data') {
    b.appendChild(question([
      ['soep_person', 'SOEP, one row per person and year', 'The usual case for individual-level analysis.'],
      ['soep_hh', 'SOEP, one row per household and year', 'For household income, housing, or anything measured at household level.'],
      ['own', 'My own table', 'Another survey, a register, or administrative data.']
    ], GUIDE.data, (v) => {
      const gewechselt = GUIDE.data !== v;
      GUIDE.data = v;
      if (gewechselt) GUIDE.level = (v === 'own' ? null : 'district');
      GUIDE.step = 1; drawGuide();
    }));
  }

  if (k === 'level') {
    b.appendChild(question(GUIDE.data === 'own' ? [
      ['ags5', 'District code (Kreis, 5 digits)', 'The most common case in German data.'],
      ['ags8', 'Municipality code (8 digits)', 'Finer than districts, and boundaries move often.'],
      ['ags2', 'Federal state only', 'Sixteen values.'],
      ['plz', 'Postcode', 'Careful: postcodes do not follow administrative boundaries.'],
      ['coord', 'Coordinates or an address', 'A point has to become an area before anything can be joined to it.']
    ] : [
      ['district', 'District (Kreis)', 'Needs the SOEP regional data, used at the FDZ.'],
      ['state', 'Federal state', 'Available in the ordinary SOEP download.'],
      ['municipality', 'Municipality', 'Needs the SOEP regional data, and boundaries move often.']
    ], GUIDE.level, (v) => { GUIDE.level = v; GUIDE.step = 2; drawGuide(); }));
    if (GUIDE.data === 'own') {
      b.appendChild(el('p', 'hint',
        'Not sure? Pick what your file literally contains. If two of them are true, pick the finest: the builder derives the coarser ones from it.'));
    }
  }

  if (k === 'years') {
    const row = el('div', '');
    row.style.cssText = 'display:flex;gap:.6rem;max-width:280px;align-items:center';
    ['from', 'to'].forEach((w, i) => {
      if (i) row.appendChild(el('span', 'hint', 'to'));
      const inp = el('input');
      inp.type = 'number'; inp.min = '1950'; inp.max = '2045'; inp.value = GUIDE.years[w];
      inp.style.cssText = 'flex:1;border:1px solid var(--rule);padding:.45rem .55rem;background:var(--paper);font-size:1rem';
      inp.setAttribute('aria-label', w === 'from' ? 'First year' : 'Last year');
      inp.addEventListener('input', () => {
        const v = parseInt(inp.value, 10);
        if (!isNaN(v)) GUIDE.years[w] = v;
        $('#g-next').disabled = !guideReady();
      });
      row.appendChild(inp);
    });
    b.appendChild(row);
    b.appendChild(el('p', 'hint',
      'For SOEP this is the range of survey years you keep. If you do not know yet, leave it: you can change it on the canvas at any time.'));
  }

  if (k === 'attach') {
    const inp = el('input');
    inp.type = 'search';
    inp.placeholder = 'unemployment rate, childcare places, Ärztedichte, rents, air quality…';
    inp.style.cssText = 'width:100%;border:1px solid var(--rule);padding:.5rem .6rem;background:var(--paper);font-size:1rem';
    const res = el('div', '');
    res.style.cssText = 'max-height:44vh;overflow:auto;margin-top:.5rem;border:1px solid var(--rule)';
    const chosen = el('p', 'hint');
    let lauf = 0, timer = null;
    const zeige = (treffer, live) => {
      res.innerHTML = '';
      if (!treffer.length) {
        res.innerHTML = '<div class="empty">Nothing with that word. Try a single, shorter one.</div>';
        return;
      }
      treffer.forEach((pick) => {
        const span = pick.y0 ? (pick.y0 === pick.y1 ? pick.y0 : `${pick.y0}–${pick.y1}`) : 'no year given';
        const row = el('div', 'result',
          `<div class="t">${mark(pick.label, inp.value)}</div><div class="s">${esc(pick.sourceLabel || '')} &middot; ` +
          `${esc(pick.levels.map((l) => LEVEL_LABEL[l]).join(', ') || 'level not stated')} &middot; ${esc(String(span))}</div>`);
        row.addEventListener('click', () => { GUIDE.pick = pick; GUIDE.prodIdx = pick.prodIdx != null ? pick.prodIdx : -1; markChosen(); });
        res.appendChild(row);
      });
      if (!live) res.appendChild(el('div', 'empty', 'The live index did not answer, so these come from the built-in catalogue.'));
    };
    const draw = () => {
      const q = inp.value.trim();
      if (q.length < 2) {
        res.innerHTML = '<div class="empty">Type at least two letters. Ask in your own words, German or English: this is the same search the GeoDB finder uses.</div>';
        return;
      }
      const meins = ++lauf;
      res.innerHTML = '<div class="empty">Searching the GeoDB index…</div>';
      searchLive(q, 40)
        .then((t) => { if (meins === lauf) zeige(t, true); })
        .catch(() => {
          if (meins !== lauf) return;
          const r = search(q);
          zeige(r ? r.items.map(itemAsPick) : [], false);
        });
    };
    const markChosen = () => {
      chosen.innerHTML = `Chosen: <b>${esc(GUIDE.pick.label)}</b> from ${esc(GUIDE.pick.sourceLabel || '')}. ` +
        'Press <b>Build it</b>, or pick something else.';
      $('#g-next').disabled = false;
    };
    inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 320); });
    b.appendChild(inp); b.appendChild(res); b.appendChild(chosen);
    /* Kommt die Wahl von außen (?q= aus dem Finder), steht sie schon fest und muss auch
       so aussehen, sonst wirkt der Knopf "Build it" grundlos aktiv. */
    if (GUIDE.pick) { inp.value = GUIDE.pick.label; markChosen(); }
    draw();
    setTimeout(() => inp.focus(), 30);
  }

  const next = $('#g-next');
  next.textContent = GUIDE.step === GUIDE_STEPS.length - 1 ? 'Build it' : 'Next';
  next.disabled = !guideReady();
}

function question(opts, current, pick) {
  const box = el('div', 'opts');
  opts.forEach(([v, t, dsc], i) => {
    const b = el('button', 'opt',
      `<span class="oi">${String.fromCharCode(97 + i)}</span><span><span class="ot">${esc(t)}</span><br><span class="od">${esc(dsc)}</span></span>`);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(current === v));
    b.addEventListener('click', () => pick(v));
    box.appendChild(b);
  });
  return box;
}

function buildFromGuide() {
  S.nodes = []; S.edges = []; S.sel = null;
  const tpl = TEMPLATES.find((t) => t.id === GUIDE.data);
  const base = nodeFromTemplate(tpl, 60, 60);
  if (GUIDE.data === 'own') {
    base.keys = [
      { id: nid('k'), type: 'caseid', name: 'id' },
      { id: nid('k'), type: 'year', name: 'year' },
      { id: nid('k'), type: GUIDE.level, name: { ags5: 'district', ags8: 'municipality', ags2: 'state', plz: 'plz', coord: 'lon_lat' }[GUIDE.level] }
    ];
  }
  S.nodes.push(base);

  /* SOEP kommt nur über die Regionaldatei an einen Kreis. Das ist der Schritt, den Anfänger
     nicht kennen können, und genau deshalb setzt die Führung ihn von selbst. */
  let anchor = base;
  if (GUIDE.data === 'own' && GUIDE.level === 'coord') {
    /* Ein Punkt wird zu einer Fläche, bevor irgendetwas daran hängen kann. Diesen Schritt
       kann niemand kennen, der zum ersten Mal mit Geodaten arbeitet. */
    const geo = nodeFromTemplate(TEMPLATES.find((t) => t.id === 'geocode'), 380, 40);
    S.nodes.push(geo);
    addEdgeQuiet({ node: base.id, key: base.keys.find((k) => k.type === 'coord').id },
                 { node: geo.id, key: geo.keys.find((k) => k.type === 'coord').id });
    anchor = geo;
  } else if ((GUIDE.data === 'soep_person' || GUIDE.data === 'soep_hh') && GUIDE.level !== 'state') {
    const bridge = nodeFromTemplate(TEMPLATES.find((t) => t.id === 'regionl'), 380, 40);
    S.nodes.push(bridge);
    addEdgeQuiet({ node: base.id, key: base.keys.find((k) => k.type === 'hid').id },
                 { node: bridge.id, key: bridge.keys.find((k) => k.type === 'hid').id });
    addEdgeQuiet({ node: base.id, key: base.keys.find((k) => k.type === 'year').id },
                 { node: bridge.id, key: bridge.keys.find((k) => k.type === 'year').id });
    anchor = bridge;
  } else if (GUIDE.data !== 'own' && GUIDE.level === 'state') {
    base.keys.push({ id: nid('k'), type: 'nuts1', name: 'hgnuts1' });
  }

  const reg = nodeFromPick(GUIDE.pick, 700, 90);
  S.nodes.push(reg);
  const wantLevel = GUIDE.data === 'own'
    ? { ags5: 'district', ags8: 'municipality', ags2: 'state', plz: 'postcode', coord: null }[GUIDE.level]
    : GUIDE.level;
  reg.wanted = wantLevel;
  if (wantLevel && reg.levels.includes(wantLevel)) setLevel(reg, wantLevel);

  let wantType = GUIDE.data === 'own' ? GUIDE.level : LEVEL_TO_KEY[GUIDE.level];
  if (wantType === 'coord') wantType = LEVEL_TO_KEY[reg.level] || 'ags5';
  const cands = anchor.keys.filter((k) => k.type === wantType);
  const aKey = cands.find((k) => /rek/.test(k.name)) || cands[0] ||
               anchor.keys.find((k) => KEYS[k.type].family === 'geo');
  const bKey = reg.keys.find((k) => k.type === wantType) ||
               reg.keys.find((k) => KEYS[k.type].family === 'geo');
  if (aKey && bKey) addEdgeQuiet({ node: anchor.id, key: aKey.id }, { node: reg.id, key: bKey.id });
  const aY = anchor.keys.find((k) => KEYS[k.type].family === 'time');
  const bY = reg.keys.find((k) => KEYS[k.type].family === 'time');
  if (aY && bY) addEdgeQuiet({ node: anchor.id, key: aY.id }, { node: reg.id, key: bY.id });

  /* Die Jahre gehören der Analysetabelle, nicht der Quelle. Sie hier auf die Abdeckung der
     Quelle zu beschneiden würde genau die Warnung verschlucken, die man braucht. */
  if (GUIDE.years) S.years = { from: GUIDE.years.from, to: GUIDE.years.to };
  S.sel = null;
  S.tab = 'checks';
  render();
  fitView();
  toast('Canvas built. The checks on the right say what to watch out for.');
}

/* ------------------------------------------------------------------ Abhilfen */
/* Eine Prüfung, die nur sagt, was falsch ist, verlangt vom Leser genau das Wissen, das ihm
   fehlt. Wo die Abhilfe eindeutig ist, führt die Prüfung sie auf Knopfdruck aus, und der
   erzeugte Code ändert sich mit. */
function applyAction(a) {
  const n = a.node ? nodeById(a.node) : null;
  /* Zeigende Aktionen ändern nichts, sie führen nur hin. Sie kehren früh zurück, weil ein
     render() die Hervorhebung sofort wieder wegwischen würde. */
  switch (a.do) {
    case 'showPalette': zeigePalette(a.group, a.card); return;
    case 'showNode': zeigeBlock(a.node, a.port); return;
    case 'showEdge': zeigeKante(a.edge); return;
    case 'showCode': zeigeImCode(a.lang || 'r', a.pattern); return;
    case 'open': window.open(a.url, '_blank', 'noopener'); return;
    default: break;
  }
  switch (a.do) {
    case 'bridge':
      insertBridge(a);
      return;
    case 'years': {
      S.years = { from: a.from, to: a.to };
      toast(`Analysis period set to ${a.from}–${a.to}.`);
      break;
    }
    case 'time': {
      (a.edges || []).forEach((id) => {
        const e = S.edges.find((x) => x.id === id);
        if (e) e.time = a.mode;
      });
      toast(a.mode === 'nearest' ? 'The link now takes the nearest available year.'
                                 : 'The link now takes the previous year.');
      break;
    }
    case 'rek': {
      /* Auf den zurückgerechneten Schlüssel umhängen: dieselbe Verbindung, andere Spalte. */
      const e = S.edges.find((x) => x.id === a.edge);
      const src = nodeById(a.srcNode);
      if (!e || !src) return;
      const neu = src.keys.find((k) => k.id === a.newKey);
      const paar = e.pairs.find((q) => q.from === a.oldKey || q.to === a.oldKey);
      if (!neu || !paar) return;
      if (paar.from === a.oldKey) paar.from = neu.id; else paar.to = neu.id;
      if (e.from.key === a.oldKey) e.from.key = neu.id;
      if (e.to.key === a.oldKey) e.to.key = neu.id;
      toast(`Now matching on ${neu.name}, one boundary vintage on both sides.`);
      break;
    }
    case 'aggregate':
      if (!n) return;
      n.aggregate = true;
      toast('An aggregation step is now in the script. Set the weight column in it.');
      break;
    case 'largest':
      if (!n) return;
      n.pickLargest = true;
      toast('The script now keeps the largest share per unit, so your rows are not multiplied.');
      break;
    case 'level':
      if (!n) return;
      setLevel(n, a.level);
      toast(`Switched to ${(LEVEL_LABEL[a.level] || a.level).toLowerCase()}.`);
      break;
    case 'addRegionl': {
      const soep = nodeById(a.node);
      if (!soep) return;
      const br = nodeFromTemplate(TEMPLATES.find((t) => t.id === 'regionl'), soep.x + 300, soep.y);
      S.nodes.push(br);
      const h = soep.keys.find((k) => k.type === 'hid'), y = soep.keys.find((k) => KEYS[k.type].family === 'time');
      const bh = br.keys.find((k) => k.type === 'hid'), by = br.keys.find((k) => KEYS[k.type].family === 'time');
      if (h && bh) addEdgeQuiet({ node: soep.id, key: h.id }, { node: br.id, key: bh.id });
      if (y && by) addEdgeQuiet({ node: soep.id, key: y.id }, { node: br.id, key: by.id });
      ensureVisible(br);
      S.sel = { kind: 'node', id: br.id };
      toast('SOEPregion added and linked on hid and syear.');
      break;
    }
    case 'asBase': {
      if (!n) return;
      /* Es gibt genau eine Analysetabelle. Die bisherige fällt auf ihre Herkunft zurück. */
      S.nodes.forEach((x) => {
        if (x.kind === 'base' && x.id !== n.id) x.kind = x.origKind || (x.tplId ? 'bridge' : 'regional');
      });
      if (n.origKind == null) n.origKind = n.kind;
      n.kind = 'base';
      S.sel = { kind: 'node', id: n.id };
      toast(`“${n.title}” is now the analysis table. Its rows are the rows of the result.`);
      break;
    }
    case 'pair': {
      addEdgeQuiet({ node: a.aNode, key: a.aKey }, { node: a.bNode, key: a.bKey });
      toast('Linked.');
      break;
    }
    default:
      return;
  }
  render();
}

function blinken(node, dauer = 2400) {
  if (!node) return;
  node.classList.remove('flash');
  void node.offsetWidth;
  node.classList.add('flash');
  setTimeout(() => node.classList.remove('flash'), dauer);
}

function zeigePalette(group, card) {
  const feld = $('#q');
  if (feld.value) { feld.value = ''; renderPalette(); }
  setTimeout(() => {
    const host = $('#palette');
    let ziele = [];
    if (card) {
      ziele = $$('.card', host).filter((c) => (c.querySelector('.t') || {}).textContent === card);
    } else if (group) {
      const kopf = $$('.grouphead', host).find((x) => x.textContent.trim().toLowerCase() === group.toLowerCase());
      if (kopf) {
        kopf.scrollIntoView({ block: 'start', behavior: 'smooth' });
        let e = kopf.nextElementSibling;
        while (e && !e.classList.contains('grouphead')) {
          if (e.classList.contains('card')) ziele.push(e);
          e = e.nextElementSibling;
        }
      }
    }
    if (ziele.length) ziele[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    ziele.forEach((z) => blinken(z));
    if (!ziele.length) toast('That block is in the list on the left.');
  }, 60);
}

function zeigeBlock(id, portName) {
  const n = nodeById(id);
  if (!n) return;
  S.sel = { kind: 'node', id };
  ensureVisible(n);
  renderCanvas();
  markSelection();
  const d = $(`#world .node[data-node="${id}"]`);
  blinken(d);
  if (portName && d) {
    const p = $$('.port', d).find((x) => (x.querySelector('.nm') || {}).textContent === portName);
    blinken(p);
  }
}

function zeigeKante(id) {
  const e = S.edges.find((x) => x.id === id);
  if (!e) return;
  S.sel = { kind: 'edge', id };
  const a = nodeById(e.from.node);
  if (a) ensureVisible(a);
  renderCanvas();
  renderRight();
  markSelection();
  toast('The link is selected. Its settings are at the top right.');
}

function zeigeImCode(lang, pattern) {
  S.tab = lang;
  S.codeMark = pattern || null;
  renderRight();
  setTimeout(() => {
    const m = $('#panels .codemark');
    if (m) { m.scrollIntoView({ block: 'center', behavior: 'smooth' }); blinken(m, 3000); }
    else toast('That line only appears once the linkage is complete.');
  }, 40);
}

/* Setzt die passende Zuordnungstabelle zwischen zwei Blöcke, deren Schlüssel nicht direkt
   zusammenpassen: GPS auf der einen Seite, Postleitzahl auf der anderen, amtlicher Schlüssel
   auf der dritten. Das ist der eigentliche Zweck der Brückenblöcke, und es von Hand zu
   verlangen hieße zu wissen, dass es sie gibt. */
function insertBridge(tat) {
  const e = S.edges.find((x) => x.id === tat.edge);
  if (!e) return;
  const A = nodeById(e.from.node), B = nodeById(e.to.node);
  const kA = keyOf(A, tat.from), kB = keyOf(B, tat.to);
  const tpl = TEMPLATES.find((t) => t.id === tat.tpl);
  if (!A || !B || !kA || !kB || !tpl) return;

  const mitte = {
    x: Math.round((A.x + B.x) / 2),
    y: Math.round(Math.max(A.y, B.y) + 210)
  };
  const br = nodeFromTemplate(tpl, mitte.x, mitte.y);
  S.nodes.push(br);

  /* Das Paar, das nicht passte, verschwindet; die Brücke hängt an beiden Seiten. */
  e.pairs = e.pairs.filter((q) => !(q.from === tat.from && q.to === tat.to));
  if (!e.pairs.length) S.edges = S.edges.filter((x) => x.id !== e.id);

  const brA = br.keys.find((k) => k.type === kA.type);
  const brB = br.keys.find((k) => k.type === kB.type);
  if (brA) addEdgeQuiet({ node: A.id, key: kA.id }, { node: br.id, key: brA.id });
  if (brB) addEdgeQuiet({ node: br.id, key: brB.id }, { node: B.id, key: kB.id });
  S.sel = { kind: 'node', id: br.id };
  ensureVisible(br);
  render();
  toast(`${tpl.title} inserted. Read what it costs in the checks.`);
}

/* ------------------------------------------------------------------ Was das hier ist */
function openHelp() {
  const veil = el('div', 'veil');
  veil.id = 'veil';
  veil.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ht">
      <div class="sheet-head">
        <div class="eyebrow">About this tool</div>
        <h2 id="ht">Link Builder</h2>
        <p>Plan how survey or administrative microdata meets German regional data, before you write any code.</p>
      </div>
      <div class="sheet-body recipe">
        <h3>What it is for</h3>
        <p>Attaching regional figures to individual-level data looks like a one-line join and is not.
        The area codes change over time, several geographies overlap instead of nesting, the years
        rarely line up, and a lookup table with one row too many quietly multiplies your sample.
        Every one of those goes wrong silently: the code runs, the numbers look plausible.</p>
        <p>This page lets you lay the linkage out as a picture, tells you which of those traps your
        particular design walks into, and writes the R or Stata script with the guards already in it.</p>

        <h3>How to use it</h3>
        <ol>
          <li><b>Guide me</b> asks four questions and builds the canvas for you. That is the fastest way in.</li>
          <li>On the canvas, every block is a table and every row inside it is a column you could match on.
              Drag from one of those dots to a dot on another block to link them. Matching dots light up
              while you drag, and the ones that cannot work go grey.</li>
          <li>The right-hand side updates as you go: <b>Checks</b> is the list of things to watch,
              <b>Plan</b> is the same thing in words, and <b>R</b> and <b>Stata</b> are the script.</li>
          <li>Click a block or a link to change its details. Click a link to choose how the years should meet.</li>
        </ol>

        <h3>What it does not do</h3>
        <p>It never touches your data and it does not run anything. It writes a plan and a script that
        you check against the files you actually downloaded, because column names differ between
        exports and the builder can only make a good guess at them.</p>

        <h3>Where the catalogue comes from</h3>
        <p>The ${S.cat ? S.cat.items.length.toLocaleString('en') : ''} indicators come from the
        <a href="${GEODB_SITE}" target="_blank" rel="noopener">GeoDB finder</a>, and the search here
        asks that finder directly, so it ranks them exactly as it does. Every result in the finder
        also carries a link back into this page, with the indicator already chosen. The catalogue
        bundled with the page is the fallback for when that service is unreachable; it also holds
        all 660 INKAR indicators with their per-level year coverage. The SOEP structure follows
        SOEP-Core v41.</p>
        <p>Background reading on the site: <a href="/why.html" target="_blank" rel="noopener">Why Geodata</a>,
        <a href="/Linking.html" target="_blank" rel="noopener">Linking</a> and
        <a href="/Accessing.html" target="_blank" rel="noopener">Accessing georeferenced data</a>.</p>
      </div>
      <div class="sheet-foot">
        <button class="btn primary" id="h-close">Got it</button>
      </div>
    </div>`;
  document.body.appendChild(veil);
  const zu = () => { const v = $('#veil'); if (v) v.remove(); document.removeEventListener('keydown', k); };
  const k = (e) => { if (e.key === 'Escape') zu(); };
  veil.addEventListener('pointerdown', (e) => { if (e.target === veil) zu(); });
  $('#h-close').addEventListener('click', zu);
  document.addEventListener('keydown', k);
}

/* ------------------------------------------------------------------ Beispiel */
function loadExample() {
  S.nodes = []; S.edges = []; S.sel = null;
  S.years = { from: 2010, to: 2022 };
  const p = nodeFromTemplate(TEMPLATES.find((t) => t.id === 'soep_person'), 40, 50);
  const r = nodeFromTemplate(TEMPLATES.find((t) => t.id === 'regionl'), 350, 26);
  S.nodes.push(p, r);
  addEdgeQuiet({ node: p.id, key: p.keys.find((k) => k.type === 'hid').id },
               { node: r.id, key: r.keys.find((k) => k.type === 'hid').id });
  addEdgeQuiet({ node: p.id, key: p.keys.find((k) => k.type === 'year').id },
               { node: r.id, key: r.keys.find((k) => k.type === 'year').id });
  const i = S.cat.products.findIndex((x) => x.key === 'inkar' && /Arbeitslosigkeit/.test(x.name));
  const itemI = S.cat.items.findIndex((it) => it[1] === i && /Arbeitslosenquote/i.test(it[0]));
  const pick = itemI >= 0 ? itemAsPick(itemI) : null;
  const reg = nodeFromProduct(i, 670, 60, pick);
  if (reg.levels.includes('district')) setLevel(reg, 'district');
  S.nodes.push(reg);
  const rek = r.keys.find((k) => /rek/.test(k.name));
  const regGeo = reg.keys.find((k) => k.type === 'ags5') || reg.keys.find((k) => KEYS[k.type].family === 'geo');
  if (rek && regGeo) addEdgeQuiet({ node: r.id, key: rek.id }, { node: reg.id, key: regGeo.id });
  const ry = reg.keys.find((k) => KEYS[k.type].family === 'time');
  if (ry) addEdgeQuiet({ node: r.id, key: r.keys.find((k) => k.type === 'year').id }, { node: reg.id, key: ry.id });
  S.tab = 'checks';
  render();
  fitView();
}

/* ------------------------------------------------------------------ Ansicht */
function fitView() {
  if (!S.nodes.length) return;
  const r = $('#canvas').getBoundingClientRect();
  const xs = S.nodes.map((n) => n.x), ys = S.nodes.map((n) => n.y);
  const w = Math.max(...xs) + 260 - Math.min(...xs);
  const h = Math.max(...ys) + 260 - Math.min(...ys);
  const k = Math.min(1, (r.width - 70) / w, (r.height - 70) / h);
  S.view.k = Math.max(0.45, Math.min(1, k));
  S.view.x = (r.width - w * S.view.k) / 2 - Math.min(...xs) * S.view.k;
  S.view.y = Math.max(24, (r.height - h * S.view.k) / 2) - Math.min(...ys) * S.view.k;
  renderCanvas();
}

/* Ein neu eingefügter Block kann rechts außerhalb des Sichtfelds landen. Dann sieht es aus,
   als sei nichts passiert. Also so weit schieben, dass er ganz zu sehen ist. */
function ensureVisible(n) {
  const r = $('#canvas').getBoundingClientRect();
  const k = S.view.k;
  const links = S.view.x + n.x * k, oben = S.view.y + n.y * k;
  const rechts = links + NODE_W * k, unten = oben + 210 * k;
  const rand = 24;
  if (rechts > r.width - rand) S.view.x -= (rechts - (r.width - rand));
  if (links < rand) S.view.x += (rand - links);
  if (unten > r.height - rand) S.view.y -= (unten - (r.height - rand));
  if (oben < rand) S.view.y += (rand - oben);
}

function render() {
  renderCanvas();
  renderRight();
  markSelection();
  save();
}

/* ------------------------------------------------------------------ Sitzung merken */
function save() {
  try {
    localStorage.setItem('geolab-linkbuilder', JSON.stringify({
      nodes: S.nodes, edges: S.edges, years: S.years, view: S.view, seq
    }));
  } catch (e) { /* privater Modus */ }
}
function restore() {
  try {
    const raw = localStorage.getItem('geolab-linkbuilder');
    if (!raw) return false;
    const o = JSON.parse(raw);
    if (!o.nodes || !o.nodes.length) return false;
    S.nodes = o.nodes; S.edges = o.edges || []; S.years = o.years || S.years;
    S.view = o.view || S.view; seq = o.seq || seq;
    return true;
  } catch (e) { return false; }
}

/* ------------------------------------------------------------------ Verdrahtung */
function wireUp() {
  /* Entprellt: sonst geht je Tastendruck eine Anfrage an den Finder. */
  let tippTimer = null;
  $('#q').addEventListener('input', () => {
    clearTimeout(tippTimer);
    tippTimer = setTimeout(renderPalette, 320);
  });

  const canvas = $('#canvas');
  canvas.addEventListener('pointerdown', (ev) => {
    if (startLink(ev)) return;
    if (ev.target.closest('.node')) return;
    S.sel = null; renderRight(); markSelection();
    const start = { x: ev.clientX, y: ev.clientY, vx: S.view.x, vy: S.view.y };
    canvas.classList.add('dragging');
    const move = (e) => {
      S.view.x = start.vx + (e.clientX - start.x);
      S.view.y = start.vy + (e.clientY - start.y);
      const t = `translate(${S.view.x}px, ${S.view.y}px) scale(${S.view.k})`;
      $('#world').style.transform = t; $('#wires').style.transform = t;
    };
    const up = () => {
      canvas.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      save();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  canvas.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
  }, { passive: false });

  $('#btn-zoom-in').addEventListener('click', () => zoom(1.15));
  $('#btn-zoom-out').addEventListener('click', () => zoom(1 / 1.15));
  $('#btn-fit').addEventListener('click', fitView);
  $('#btn-guide').addEventListener('click', openGuide);
  $('#btn-example').addEventListener('click', loadExample);
  $('#btn-reset').addEventListener('click', () => {
    S.nodes = []; S.edges = []; S.sel = null; S.tab = 'checks'; render();
  });

  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    S.tab = t.id.replace('tab-', ''); S.codeMark = null; renderRight();
  }));

  $('#btn-help').addEventListener('click', openHelp);

  $('#btn-theme').addEventListener('click', () => {
    const now = document.documentElement.getAttribute('data-theme');
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = (now ? now : (sysDark ? 'dark' : 'light')) === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('geolab-linkbuilder-thema', JSON.stringify({ wert: next, zeit: Date.now() }));
    } catch (e) { /* privater Modus */ }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (!S.sel) return;
    e.preventDefault();
    if (S.sel.kind === 'edge') S.edges = S.edges.filter((x) => x.id !== S.sel.id);
    else removeNode(S.sel.id);
    S.sel = null; render();
  });

  window.addEventListener('resize', () => { spaltenNachziehen(); drawWires(); });
  wireGrips();
}

/* Die beiden Spaltenbreiten. Sie stehen als Custom Properties am Raster und werden pro
   Browser gemerkt.

   Wichtig, und beim ersten Versuch falsch gemacht: die Grenzen sind RELATIV zum Fenster, nicht
   feste Pixelwerte. Ein Codefenster von 780 px ist auf einem breiten Bildschirm angenehm und
   drückt auf einem 1085 px breiten Ansichtsfenster (ein 1900-px-Schirm bei 175 % Skalierung) die
   Arbeitsfläche komplett heraus, samt der Griffe, mit denen man es zurückziehen könnte. Deshalb
   behält die Fläche immer ihre Mindestbreite, und die gespeicherten Werte werden beim Laden und
   bei jeder Fenstergrößenänderung erneut begrenzt. */
const CANVAS_MIN = 300;
const SPALTEN_STANDARD = { left: 274, right: 400 };

function spaltenGrenzen(welche, cols) {
  const gesamt = cols.getBoundingClientRect().width;
  const andere = parseInt(getComputedStyle(cols).getPropertyValue('--' + (welche === 'left' ? 'right' : 'left')), 10)
                 || SPALTEN_STANDARD[welche === 'left' ? 'right' : 'left'];
  const min = welche === 'left' ? 200 : 280;
  const platz = gesamt - andere - 10 - CANVAS_MIN;
  return [min, Math.max(min, Math.min(welche === 'left' ? 620 : 900, platz))];
}

function setzeSpalte(welche, px, cols, merken = true) {
  const [min, max] = spaltenGrenzen(welche, cols);
  const wert = Math.max(min, Math.min(max, Math.round(px)));
  cols.style.setProperty('--' + welche, wert + 'px');
  if (merken) {
    try {
      const alt = JSON.parse(localStorage.getItem('geolab-linkbuilder-spalten') || '{}');
      alt[welche] = wert;
      localStorage.setItem('geolab-linkbuilder-spalten', JSON.stringify(alt));
    } catch (e) { /* privater Modus */ }
  }
  return wert;
}

/* Nach dem Laden und nach jeder Größenänderung: beide Spalten wieder in die Grenzen holen,
   ohne die Wunschbreite zu vergessen. Wird das Fenster wieder breit, kommt sie zurück. */
function spaltenNachziehen() {
  const cols = $('.cols');
  if (!cols || !cols.getBoundingClientRect().width) return;
  let wunsch = { ...SPALTEN_STANDARD };
  try { wunsch = { ...wunsch, ...JSON.parse(localStorage.getItem('geolab-linkbuilder-spalten') || '{}') }; }
  catch (e) { /* privater Modus */ }
  /* Reicht der Platz für beide Wünsche nicht, gibt die breitere Spalte zuerst nach. */
  const gesamt = cols.getBoundingClientRect().width;
  let links = wunsch.left, rechts = wunsch.right;
  const zuViel = (links + rechts + 10 + CANVAS_MIN) - gesamt;
  if (zuViel > 0) {
    const summe = links + rechts;
    links = Math.max(200, links - zuViel * (links / summe));
    rechts = Math.max(260, rechts - zuViel * (rechts / summe));
  }
  cols.style.setProperty('--left', Math.round(links) + 'px');
  cols.style.setProperty('--right', Math.round(rechts) + 'px');
  setzeSpalte('left', links, cols, false);
  setzeSpalte('right', rechts, cols, false);
}

function wireGrips() {
  const cols = $('.cols');
  spaltenNachziehen();

  [['#grip-left', 'left'], ['#grip-right', 'right']].forEach(([sel, welche]) => {
    const g = $(sel);
    if (!g) return;
    g.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      g.setPointerCapture(ev.pointerId);
      g.classList.add('active');
      const r = cols.getBoundingClientRect();
      const move = (e) => {
        setzeSpalte(welche, welche === 'left' ? e.clientX - r.left : r.right - e.clientX, cols);
        drawWires();
      };
      const up = () => {
        g.classList.remove('active');
        g.removeEventListener('pointermove', move);
        g.removeEventListener('pointerup', up);
        drawWires();
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up);
    });
    /* Doppelklick stellt diese Spalte auf die Ausgangsbreite zurück. */
    g.addEventListener('dblclick', () => {
      setzeSpalte(welche, SPALTEN_STANDARD[welche], cols);
      drawWires();
      toast('Column width reset.');
    });
    /* Auch mit der Tastatur, sonst ist die Spaltenbreite für alle unerreichbar, die nicht
       mit der Maus arbeiten. */
    g.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const jetzt = parseInt(getComputedStyle(cols).getPropertyValue('--' + welche), 10) ||
                    SPALTEN_STANDARD[welche];
      const schritt = e.key === 'ArrowRight' ? 24 : -24;
      setzeSpalte(welche, welche === 'left' ? jetzt + schritt : jetzt - schritt, cols);
      drawWires();
    });
  });
}

function zoom(f, cx, cy) {
  const r = $('#canvas').getBoundingClientRect();
  const px = (cx == null ? r.width / 2 : cx - r.left);
  const py = (cy == null ? r.height / 2 : cy - r.top);
  const k = Math.max(0.4, Math.min(1.8, S.view.k * f));
  S.view.x = px - (px - S.view.x) * (k / S.view.k);
  S.view.y = py - (py - S.view.y) * (k / S.view.k);
  S.view.k = k;
  renderCanvas();
}

/* ------------------------------------------------------------------ Start */
/* Aus dem GeoDB-Finder kommt man mit ?q=<Indikator> hierher. Dann steht das Ziel schon fest
   und es fehlen nur noch die Fragen nach den eigenen Daten. Die Adresse wird danach bereinigt,
   damit ein Neuladen nicht wieder die Führung öffnet. */
async function vonAussenUebernehmen() {
  const q = new URLSearchParams(location.search).get('q');
  if (!q) return false;
  history.replaceState(null, '', location.pathname);
  let treffer = [];
  try { treffer = await searchLive(q, 10); } catch (e) { /* Dienst nicht erreichbar */ }
  if (!treffer.length) {
    const r = search(q);
    treffer = r ? r.items.slice(0, 1).map(itemAsPick) : [];
  }
  if (!treffer.length) { toast(`Nothing found for “${q}”.`); return false; }
  const genau = treffer.find((t) => t.label.toLowerCase() === q.trim().toLowerCase()) || treffer[0];
  openGuide();
  GUIDE.pick = genau;
  GUIDE.prodIdx = genau.prodIdx != null ? genau.prodIdx : -1;
  drawGuide();
  const sub = $('#gsub');
  if (sub) sub.textContent = `You came from the GeoDB finder with “${genau.label}”. It is already chosen as what to attach, so answer these and the canvas is built.`;
  return true;
}

(async function init() {
  try {
    await loadCatalogue();
  } catch (e) {
    $('#palette').innerHTML = '<div class="empty">The data catalogue could not be loaded. Reload the page.</div>';
    return;
  }
  wireUp();
  renderPalette();
  if (!restore()) loadExample(); else render();
  vonAussenUebernehmen();
})();
