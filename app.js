(function () {
'use strict';
const B = window.Backend;
const VER = 'v9';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const parseT = x => { const t = String(x == null ? '' : x).trim().replace(',', '.'); if (t.includes(':')) { const p = t.split(':').map(v => parseFloat(v) || 0); return p.length >= 3 ? p[0] * 60 + p[1] + p[2] / 60 : p[0] + p[1] / 60; } const v = parseFloat(t); return isFinite(v) ? v : 0; };
const hms = sec => { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), c = sec % 60, p = n => String(n).padStart(2, '0'); return h ? h + ':' + p(m) + ':' + p(c) : m + ':' + p(c); };
const maskT = d => { d = d.padStart(6, '0'); return d.slice(0, 2) + ':' + d.slice(2, 4) + ':' + d.slice(4); };
const fmtT = x => { if (x === '' || x == null) return ''; if (typeof x === 'string') return x; const sec = Math.round(x * 60); return maskT(String(Math.floor(sec / 3600) * 10000 + Math.floor(sec % 3600 / 60) * 100 + sec % 60)); };
const humT = x => { const t = String(x == null ? '' : x).trim(); if (!t) return ''; const v = typeof x === 'number' ? x : parseT(t); const m = Math.floor(v + 1e-9); let sc = Math.round((v - m) * 60); return (m ? m + ' мин' : '') + (m && sc ? ' ' : '') + (sc ? sc + ' с' : '') || '0 мин'; };
const num = x => { const v = parseFloat(String(x == null ? '' : x).replace(',', '.')); return isFinite(v) ? v : 0; };
const fmt = (v, d) => (isFinite(v) ? v : 0).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 2 : d });

/* ───────── Права ───────── */
const BLOCKS = { catalog: 'Каталог (детали, изделия)', launches: 'Запуски', reports: 'Вечерние отчёты', prices: 'Цены и суммы' };
const LEVELS = ['нет', 'смотреть', 'править', 'удалять'];
const TPL = {
  operator: { name: 'Оператор', perms: { catalog: 1, launches: 1, reports: 2, prices: 0 } },
  locksmith: { name: 'Слесарь', perms: { catalog: 1, launches: 1, reports: 1, prices: 0 } },
  manager: { name: 'Руководитель', perms: { catalog: 3, launches: 3, reports: 3, prices: 3 } },
  accountant: { name: 'Бухгалтер', perms: { catalog: 0, launches: 1, reports: 0, prices: 1 } },
  viewer: { name: 'Только просмотр', perms: { catalog: 1, launches: 1, reports: 1, prices: 0 } }
};
const SETUP_TYPES = ['токарный', 'фрезерный', 'токарно-фрезерный'];
const guessType = name => /nex[us]{1,2}\s?55|токарно-фрез/i.test(name) ? 'токарно-фрезерный' : /фрез|mill/i.test(name) ? 'фрезерный' : /токар|lathe|tc\s?-?\d|[cs]k\s?-?\d|ts\s?-?\d/i.test(name) ? 'токарный' : '';
const SEED_MACHINES = ['Metalltec TC45', 'Metalltec Nexus 55', 'Metalltec CK-36',
  'Китайский токарный станок', 'Фрезерный станок ЧПУ', 'Токарный 16К20', 'Токарный ИЖ',
  'Фрезерный универсальный (малый)', 'Фрезерный универсальный (большой)'];

const S = { me: null, users: [], machines: [], parts: [], projects: [], launches: [], reports: [], ready: {}, denied: {} };
function can(b, l) { const m = S.me; if (!m) return false; if (m.isAdmin) return true; return ((m.perms || {})[b] || 0) >= l; }

/* ───────── Калькулятор материала ───────── */
// [id, название, плотность г/см³, другие написания для поиска]
const MAT_ROWS = [
  ['steel', 'Сталь (без марки)', 7.85, 'сталь, конструкционная'],
  ['st10', 'Сталь 10', 7.85, ''], ['st20', 'Сталь 20', 7.85, ''], ['st35', 'Сталь 35', 7.85, ''], ['st45', 'Сталь 45', 7.85, ''],
  ['st3', 'Ст3', 7.85, 'Сталь 3, Ст3сп'],
  ['a12', 'Сталь А12', 7.85, 'А12, автоматная'], ['a40g', 'Сталь А40Г', 7.85, 'А40Г'],
  ['s40h', 'Сталь 40Х', 7.82, '40Х'], ['s40hn', 'Сталь 40ХН', 7.85, '40ХН'],
  ['s30hgsa', 'Сталь 30ХГСА', 7.85, '30ХГСА'], ['s38h2mua', 'Сталь 38Х2МЮА', 7.7, '38Х2МЮА'],
  ['s65g', 'Сталь 65Г', 7.85, '65Г'], ['u8', 'Сталь У8', 7.83, 'У8А'], ['u10', 'Сталь У10', 7.81, 'У10А'],
  ['shh15', 'Сталь ШХ15', 7.81, 'ШХ15'], ['s09g2s', 'Сталь 09Г2С', 7.85, '09Г2С'], ['r6m5', 'Р6М5', 8.1, 'быстрорез'],
  ['inox', 'Нержавеющая сталь (без марки)', 7.9, 'нерж, нержавейка, нержавеющая'],
  ['s12h18n10t', '12Х18Н10Т', 7.9, 'AISI 321,AISI321,321'], ['s08h18n10', '08Х18Н10', 7.9, 'AISI 304,AISI304,304'],
  ['s10h17n13m2t', '10Х17Н13М2Т', 7.95, 'AISI 316,AISI316,316'], ['s20h13', '20Х13', 7.7, ''], ['s40h13', '40Х13', 7.7, ''], ['s14h17n2', '14Х17Н2', 7.75, ''],
  ['alu', 'Алюминий (без марки)', 2.7, 'алюминий'],
  ['dural', 'Д16Т', 2.78, 'Д16, дюраль, дюралюминий'], ['ad31', 'АД31', 2.71, ''], ['ad1', 'АД1', 2.71, ''],
  ['amg6', 'АМг6', 2.64, ''], ['amg3', 'АМг3', 2.67, ''], ['amc', 'АМц', 2.73, ''],
  ['v95', 'В95', 2.85, 'В95Т1'], ['ak4', 'АК4-1', 2.8, ''], ['ak6', 'АК6', 2.75, ''], ['ak12', 'АК12', 2.65, ''],
  ['brass', 'Латунь (без марки)', 8.5, 'латунь'], ['l63', 'Латунь Л63', 8.44, 'Л63'], ['ls59', 'Латунь ЛС59-1', 8.5, 'ЛС59-1, ЛС59'],
  ['bronze', 'Бронза (без марки)', 8.8, 'бронза'], ['braj', 'Бронза БрАЖ9-4', 7.6, 'БрАЖ9-4, БрАЖ'],
  ['brocs', 'Бронза БрОЦС5-5-5', 8.8, 'БрОЦС5-5-5, БрОЦС'], ['brajmc', 'Бронза БрАЖМц10-3-1,5', 7.6, 'БрАЖМц'],
  ['brkmc', 'Бронза БрКМц3-1', 8.4, 'БрКМц'], ['copper', 'Медь М1', 8.94, 'медь, М1, М2'],
  ['ti', 'Титан (без марки)', 4.5, 'титан'], ['vt10', 'Титан ВТ1-0', 4.5, 'ВТ1-0'], ['vt6', 'Титан ВТ6', 4.43, 'ВТ6'],
  ['caprolon', 'Капролон (ПА6)', 1.15, 'ПА6, нейлон, капролон'], ['pom', 'Полиацеталь POM', 1.41, 'POM, ПОМ, дельрин'],
  ['ptfe', 'Фторопласт Ф4 (PTFE)', 2.2, 'Ф4, фторопласт, тефлон, PTFE'], ['zedex', 'Зедекс', 1.3, ''],
  ['textolit', 'Текстолит', 1.35, ''], ['pe', 'Полиэтилен ПНД (HDPE)', 0.95, 'ПЭ, ПНД, HDPE, полиэтилен'],
  ['pp', 'Полипропилен (PP)', 0.91, 'ПП, полипропилен'], ['pvc', 'ПВХ', 1.4, 'PVC'],
  ['acryl', 'Оргстекло (акрил)', 1.19, 'акрил, плексиглас, PMMA, оргстекло'], ['abs', 'АБС', 1.05, 'ABS'], ['peek', 'PEEK', 1.31, 'ПЭЭК']
];
// поиск не различает регистр, латиницу/кириллицу похожих букв, знаки и пробелы
const LK = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };
const nrm = s => String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/[a-z]/g, ch => LK[ch] || ch).replace(/[^a-zа-я0-9]+/g, ' ').trim();
const MATERIALS = MAT_ROWS.map(([id, name, d, al]) => ({ id, name, d, k: [name].concat(al ? al.split(',') : []).map(nrm).filter(Boolean) }));
function matOf(c) {
  if (c.mat === 'custom') return { id: 'custom', name: c.matName || 'Свой материал', d: num(c.density), k: [] };
  return MATERIALS.find(x => x.id === c.mat) || MATERIALS[0];
}
function findMaterials(q) {
  const nq = nrm(q).replace(/ /g, '');
  const score = m => {
    if (!nq) return 1; let b = 0;
    for (const k of m.k) {
      const kk = k.replace(/ /g, '');
      if (kk.startsWith(nq)) b = Math.max(b, 3);
      else if (k.split(' ').some(w => w.startsWith(nq))) b = Math.max(b, 2);
      else if (kk.includes(nq)) b = Math.max(b, 1);
    }
    return b;
  };
  return MATERIALS.map((m, i) => [score(m), i, m]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(x => x[2]).slice(0, 60);
}
// какая марка названа в тексте «Сталь А12, круг 25»: побеждает самое длинное совпадение целым словом
function guessMaterial(text) {
  const t = ' ' + nrm(text) + ' '; let best = null, bl = 0;
  for (const m of MATERIALS) for (const k of m.k) {
    const L = k.replace(/ /g, '').length;
    if (L < 2 || !t.includes(' ' + k + ' ')) continue;
    if (L < 3 && t.trim() !== k) continue;
    const sc = L + (/без марки/.test(m.name) ? 0 : 100);
    if (sc > bl) { best = m; bl = sc; }
  }
  return best;
}
const SHAPES = {
  round: { name: 'Круг', dims: [['D', 'Диаметр D, мм', 30]], area: v => Math.PI * v.D * v.D / 4 },
  square: { name: 'Квадрат', dims: [['A', 'Сторона A, мм', 30]], area: v => v.A * v.A },
  hex: { name: 'Шестигранник', dims: [['S', 'Под ключ S, мм', 27]], area: v => v.S * v.S * Math.sqrt(3) / 2 },
  tube: { name: 'Труба', dims: [['D', 'Наружный D, мм', 40], ['T', 'Стенка T, мм', 5]], area: v => Math.PI / 4 * (v.D * v.D - Math.pow(v.D - 2 * v.T, 2)) },
  strip: { name: 'Полоса / лист', dims: [['W', 'Ширина W, мм', 50], ['T', 'Толщина T, мм', 10]], area: v => v.W * v.T },
  angle: { name: 'Уголок', dims: [['A', 'Полка A, мм', 25], ['B', 'Полка B, мм', 25], ['T', 'Толщина T, мм', 4]], area: v => v.T * (v.A + v.B - v.T) },
  profile: { name: 'Профильная труба', dims: [['A', 'Сторона A, мм', 40], ['B', 'Сторона B, мм', 40], ['T', 'Стенка T, мм', 3]], area: v => v.A * v.B - (v.A - 2 * v.T) * (v.B - 2 * v.T) }
};
function defaultDims(shape) { const o = {}; SHAPES[shape].dims.forEach(([k, , d]) => o[k] = String(d)); return o; }
function defaultCalc() { return { mat: 'steel', matUser: false, shape: 'round', dims: defaultDims('round'), qty: '1', spare: '0', len: '100', kerf: '3', face: '1', tail: '0', bar: '' }; }
function calc(c) {
  const sh = SHAPES[c.shape] || SHAPES.round, dv = {};
  sh.dims.forEach(([k]) => dv[k] = num((c.dims || {})[k]));
  const area = Math.max(0, sh.area(dv));
  const m = matOf(c);
  const qty = num(c.qty), spare = num(c.spare), len = num(c.len), kerf = num(c.kerf), face = num(c.face), tail = num(c.tail), bar = num(c.bar);
  const pieces = qty + spare, pieceLen = len + kerf + face, totalMm = pieces * pieceLen + tail;
  const out = { area, pieces, pieceLen, totalMm, massKg: area * totalMm / 1e6 * m.d, kgPerM: area / 1000 * m.d, pieceMass: area * pieceLen / 1e6 * m.d, mat: m, shape: sh };
  if (bar > 0 && pieceLen > 0) {
    out.perBar = Math.floor((bar - tail) / pieceLen);
    if (out.perBar > 0) { out.bars = Math.ceil(pieces / out.perBar); out.barsTotalMm = out.bars * bar; out.leftover = out.barsTotalMm - pieces * pieceLen; }
  }
  return out;
}
function dimsText(c) { const sh = SHAPES[c.shape]; return sh.dims.map(([k]) => (c.dims || {})[k] || '?').join('×'); }
function calcResultHTML(c, emb) {
  const r = calc(c);
  if (emb) {
    return `<div class="big">${fmt(r.pieceLen, 1)} мм · ${fmt(r.pieceMass, 3)} кг</div>
      <div class="muted">длина заготовки на 1 деталь (деталь + рез + торцовка) и её масса; ${fmt(r.kgPerM, 3)} кг/м</div>
      <div class="muted">${esc(r.mat.name)} · ${r.mat.d > 0 ? fmt(r.mat.d, 2) + ' г/см³' : 'укажите плотность'}</div>`;
  }
  let h = `<div class="big">${fmt(r.massKg, 2)} кг · ${fmt(r.totalMm / 1000, 3)} м</div><dl>
    <dt>Материал</dt><dd>${esc(r.mat.name)} · ${r.mat.d > 0 ? fmt(r.mat.d, 2) + ' г/см³' : 'укажите плотность'}</dd>
    <dt>Заготовок</dt><dd>${fmt(r.pieces, 0)} шт по ${fmt(r.pieceLen, 1)} мм</dd>
    <dt>Общая длина</dt><dd>${fmt(r.totalMm, 1)} мм</dd>
    <dt>Масса 1 заготовки</dt><dd>${fmt(r.pieceMass, 3)} кг</dd>
    <dt>Погонная масса</dt><dd>${fmt(r.kgPerM, 3)} кг/м</dd>
    <dt>Площадь сечения</dt><dd>${fmt(r.area, 1)} мм²</dd>`;
  if (r.perBar != null) {
    h += r.perBar > 0
      ? `<dt>С прутка</dt><dd>${r.perBar} шт</dd><dt>Прутков</dt><dd>${r.bars} (${fmt(r.barsTotalMm / 1000, 2)} м)</dd><dt>Остаток</dt><dd>${fmt(r.leftover, 0)} мм</dd>`
      : `<dt>С прутка</dt><dd>заготовка не помещается</dd>`;
  }
  return h + '</dl>';
}
function calcHTML(c, emb) {
  const f = (label, path, val, extra) => `<label>${label}<input inputmode="decimal" data-bind="${path}" value="${esc(val)}" ${extra || ''}></label>`;
  const sh = SHAPES[c.shape];
  return `<div class="calc">
    <div class="row">
      <div class="cb"><label>Материал (вводите первые буквы)<input class="cb-in" autocomplete="off" spellcheck="false" placeholder="А12, 40Х, Д16, нерж…" value="${esc(matOf(c).name)}"></label><div class="cb-list" hidden></div></div>
      <label>Сечение<select data-bind="calc.shape" data-re="1">${Object.keys(SHAPES).map(k => `<option value="${k}"${k === c.shape ? ' selected' : ''}>${SHAPES[k].name}</option>`).join('')}</select></label>
    </div>
    ${c.mat === 'custom' ? `<div class="row">${f('Плотность «' + esc(c.matName) + '», г/см³', 'calc.density', c.density)}</div>` : ''}
    <div class="row">${sh.dims.map(([k, label]) => f(label, 'calc.dims.' + k, (c.dims || {})[k])).join('')}</div>
    <div class="row">
      ${emb ? '' : f('Деталей, шт', 'calc.qty', c.qty) + f('Запас, шт', 'calc.spare', c.spare)}
      ${f('Длина детали, мм', 'calc.len', c.len)}
      ${f('Ширина реза, мм', 'calc.kerf', c.kerf)}
      ${f('Торцовка, мм', 'calc.face', c.face)}
      ${emb ? '' : f('Хвост прутка, мм', 'calc.tail', c.tail) + f('Длина прутка, мм (необяз.)', 'calc.bar', c.bar)}
    </div>
    <div class="result" data-calcres="${emb ? 1 : 0}">${calcResultHTML(c, emb)}</div>
  </div>`;
}
function calcSummary(c) {
  const r = calc(c);
  return `${r.mat.name}, ${r.shape.name} ${dimsText(c)} мм\nДеталей: ${fmt(r.pieces, 0)} (длина ${c.len} + рез ${c.kerf} + торцовка ${c.face})\nОбщая длина: ${fmt(r.totalMm, 1)} мм (${fmt(r.totalMm / 1000, 3)} м)\nМасса: ${fmt(r.massKg, 2)} кг`;
}

/* ───────── Состояние страницы, черновик ───────── */
let draft = null, draftKey = null, calcState = defaultCalc(), formErr = '';
function refreshCalc() { if (draft && draft.calc) document.querySelectorAll('[data-calcres]').forEach(el => el.innerHTML = calcResultHTML(draft.calc, el.dataset.calcres === '1')); }
function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] == null ? (a[k] = {}) : a[k]), o); t[last] = v; }
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
function showModal(title, bodyHTML, buttons) {
  const m = $('#modal'); m.hidden = false;
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHTML;
  $('#modalBtns').innerHTML = buttons.map(b =>
    `<button class="${b.cls || ''}" data-act="${b.act}"${b.arg ? ' data-arg="' + b.arg + '"' : ''}>${esc(b.label)}</button>`
  ).join('');
}
function closeModal() { const m = $('#modal'); if (m) m.hidden = true; }
async function doCreateLaunch(projId, proj, qty, pri, deadline) {
  const items = (proj.items || []).map(it => {
    const pt = partById(it.partId);
    return { partId: it.partId, partArt: pt ? pt.art : '', partName: pt ? pt.name : '', qtyPer: parseInt(it.qty) || 1, qtyTotal: (parseInt(it.qty) || 1) * qty };
  });
  const id = 'ln' + Date.now();
  const rec = { projectId: projId, projectArt: proj.art || '', projectName: proj.name, qty, priority: pri || 'normal', deadline: deadline || '', status: 'active', created: Date.now(), createdBy: S.me.uid, createdByName: S.me.name || S.me.login || '', items };
  await B.save('launches', id, rec);
  toast('Запуск создан');
  location.hash = '#/launch/' + id;
}
function route() { const h = location.hash.replace(/^#\/?/, ''); const [path, qs] = h.split('?'); return { seg: path.split('/').filter(Boolean), q: new URLSearchParams(qs || '') }; }
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru');
const partById = id => S.parts.find(p => p.id === id);
const machineName = id => { const m = S.machines.find(x => x.id === id); return m ? m.name : ''; };

/* ───────── Сортировка каталогов ───────── */
const CAT_SORT_PARTS = [
  { id: 'alpha', label: 'Название' },
  { id: 'art', label: 'Артикул' },
  { id: 'date', label: 'Дата' },
  { id: 'mat', label: 'Материал' }
];
const CAT_SORT_PROJ = [
  { id: 'alpha', label: 'Название' },
  { id: 'art', label: 'Артикул' },
  { id: 'date', label: 'Дата' },
  { id: 'count', label: 'Кол-во деталей' }
];
let catSort = { parts: { key: 'alpha', dir: 1 }, projects: { key: 'alpha', dir: 1 } };
let viewMode = { parts: 'full', projects: 'full', active: 'full' };
const expandedCards = new Set();
function viewToggleBtn(section) {
  const isFull = viewMode[section] === 'full';
  return `<button class="chip view-toggle" data-act="toggleView" data-arg="${section}" title="${isFull ? 'Компактный вид' : 'Подробный вид'}">${isFull ? '⊟ Кратко' : '⊞ Подробно'}</button>`;
}
function lastReportInfo(launchId) {
  const reps = S.reports.filter(r => r.launchId === launchId);
  if (!reps.length) return null;
  const last = reps.reduce((a, b) => (b.created || 0) > (a.created || 0) ? b : a);
  const parts = (last.entries || []).map(e => {
    const pt = partById(e.partId);
    return (pt ? (pt.art || pt.name) : '') + ': +' + e.done + ' шт';
  }).filter(Boolean);
  return { date: last.date || '', user: last.userName || '', summary: parts.join(', ') || 'без изменений' };
}
function sortCatalog(items, cat) {
  const st = catSort[cat] || catSort.parts;
  const s = st.key, d = st.dir;
  return items.slice().sort((a, b) => {
    let r = 0;
    if (s === 'alpha') r = String(a.name || '').localeCompare(String(b.name || ''), 'ru');
    else if (s === 'art') r = String(a.art || '').localeCompare(String(b.art || ''), 'ru');
    else if (s === 'date') r = (a.createdAt || 0) - (b.createdAt || 0);
    else if (s === 'mat') r = String(a.mat || '').localeCompare(String(b.mat || ''), 'ru');
    else if (s === 'count') r = ((a.items || []).length) - ((b.items || []).length);
    if (r === 0) r = String(a.name || '').localeCompare(String(b.name || ''), 'ru');
    return r * d;
  });
}
function catSortBtns(modes, cat) {
  const st = catSort[cat];
  return modes.map(m => {
    const cur = st.key === m.id;
    const arrow = cur ? (st.dir === 1 ? ' ↑' : ' ↓') : '';
    return `<button class="chip${cur ? ' active' : ''}" data-act="setCatSort" data-arg="${cat}:${m.id}">${m.label}${arrow}</button>`;
  }).join('');
}

/* ───────── Экраны ───────── */
function viewLogin(err) {
  return `<div class="card login"><h1>Вход</h1>
    <label>Логин<input id="lg" autocomplete="username" autocapitalize="none"></label>
    <label>Пароль<input id="pw" type="password" autocomplete="current-password"></label>
    ${err ? `<div class="err">${esc(err)}</div>` : ''}
    <button class="primary" data-act="login">Войти</button>
    <p class="muted">Учётную запись выдаёт администратор.</p>
    <p><button class="link" data-act="diag">Проверить связь с Google</button></p><pre id="diag" class="muted" style="white-space:pre-wrap;font-size:12px"></pre></div>`;
}
function viewNoProfile() {
  const m = S.me;
  return `<div class="card login"><h1>Нет доступа</h1>
    <p>${m.missing ? 'Вы вошли, но для вашей учётной записи нет профиля.' : m.error ? 'Не удалось прочитать профиль: ' + esc(m.error) : 'Доступ отключён администратором.'}</p>
    ${m.missing ? `<p class="muted">Если это первый администратор: создайте в Firestore документ <b>users/${esc(m.uid)}</b> (см. README, шаг 5).</p>` : ''}
    <button data-act="logout">Выйти</button></div>`;
}
function listBar(ph, newHref, canNew, label) {
  return `<div class="bar"><div class="grow"><input id="q" placeholder="${ph}" value="${esc(listQuery)}"></div>${canNew ? `<a class="btn primary" href="${newHref}">${label}</a>` : ''}</div>`;
}
let listQuery = '';
function viewParts() {
  const q = listQuery.toLowerCase();
  const filtered = S.parts.filter(p => !q || (p.art + ' ' + p.name + ' ' + p.mat).toLowerCase().includes(q));
  const items = sortCatalog(filtered, 'parts');
  const compact = viewMode.parts === 'compact';
  return `<h1>Детали</h1>${listBar('Поиск по артикулу, названию, материалу', '#/part/new', can('catalog', 2), '+ Деталь')}
    ${filtered.length > 1 ? `<div class="sort-bar">${viewToggleBtn('parts')}${catSortBtns(CAT_SORT_PARTS, 'parts')}</div>` : `<div class="sort-bar">${viewToggleBtn('parts')}</div>`}
    <div class="list${compact ? ' list-compact' : ''}">${items.map(p => {
      const exp = compact && expandedCards.has(p.id);
      const titleHtml = compact && !exp
        ? `<div class="t">${p.art ? `<span class="art">${esc(p.art)}</span>` : ''}<span class="cname">${esc(p.name)}</span></div>`
        : `<div class="t">${p.art ? `<span class="art">${esc(p.art)}</span>` : ''}${esc(p.name)}</div>`;
      return `<a class="item hasth${exp ? ' expanded' : ''}" href="#/part/${p.id}">${thumbHTML(p.drawing)}<div class="tx">${titleHtml}
      ${compact && !exp ? `<button class="link expand-btn" data-act="toggleExpand" data-arg="${p.id}">▾ Развернуть</button>` : partLines(p)}${exp ? `<button class="link expand-btn" data-act="toggleExpand" data-arg="${p.id}">▴ Свернуть</button>` : ''}</div></a>`;
    }).join('') || '<p class="muted">Деталей пока нет.</p>'}</div>`;
}
function viewProjects() {
  const q = listQuery.toLowerCase();
  const filtered = S.projects.filter(p => !q || (p.art + ' ' + p.name).toLowerCase().includes(q));
  const items = sortCatalog(filtered, 'projects');
  const compact = viewMode.projects === 'compact';
  return `<h1>Изделия</h1>${listBar('Поиск по названию, артикулу', '#/project/new', can('catalog', 2), '+ Изделие')}
    ${filtered.length > 1 ? `<div class="sort-bar">${viewToggleBtn('projects')}${catSortBtns(CAT_SORT_PROJ, 'projects')}</div>` : `<div class="sort-bar">${viewToggleBtn('projects')}</div>`}
    <div class="list${compact ? ' list-compact' : ''}">${items.map(p => {
      const exp = compact && expandedCards.has(p.id);
      const details = `<div class="s">деталей в составе: ${(p.items || []).length}${(p.files || []).length ? ' · чертежей сборки: ' + p.files.length : ''}</div>
      ${(() => { const hn = (p.items || []).map(i => { const pt = partById(i.partId); return pt && pt.notePri === 'high' && String(pt.note || '').trim() ? pt : null; }).filter(Boolean); return hn.length ? hn.map(pt => `<div class="s s-high">⚠ ${esc(pt.art || pt.name)}: ${clip(String(pt.note).replace(/\s+/g, ' ').trim(), 100)}</div>`).join('') : ''; })()}`;
      const titleHtml = compact && !exp
        ? `<div class="t">${p.art ? `<span class="art">${esc(p.art)}</span>` : ''}<span class="cname">${esc(p.name)}</span></div>`
        : `<div class="t">${p.art ? `<span class="art">${esc(p.art)}</span>` : ''}${esc(p.name)}</div>`;
      return `<a class="item hasth${exp ? ' expanded' : ''}" href="#/project/${p.id}">${thumbHTML(projThumb(p))}<div class="tx">${titleHtml}
      ${compact && !exp ? `<button class="link expand-btn" data-act="toggleExpand" data-arg="${p.id}">▾ Развернуть</button>` : details}${exp ? `<button class="link expand-btn" data-act="toggleExpand" data-arg="${p.id}">▴ Свернуть</button>` : ''}</div></a>`;
    }).join('') || '<p class="muted">Изделий пока нет.</p>'}</div>`;
}
function fileBlock(meta, key, dis) {
  if (!meta) return '<div class="file"><span class="muted">нет файла</span></div>';
  return previewHTML(meta) + `<div class="file"><span>📎 ${esc(meta.name)}</span><button class="x" data-act="openFile" data-arg="${meta.id}">В новой вкладке</button>${dis ? '' : `<button class="x danger" data-act="rmFile" data-arg="${key}">Убрать</button>`}</div>`;
}
const isCoatName = x => { const n = normCoat(x); return !!n && !n.includes(',') && COATS.some(c => c[0] === n); };
function partWork(p) {
  const st = (p.steps || []).map(x => String(x || '').trim()).filter(Boolean);
  const work = st.filter(x => !isCoatName(x));
  const coats = normCoat([p.coat].concat(st.filter(isCoatName)).filter(Boolean).join(', ')).split(', ').filter(Boolean);
  return { work, coats };
}
const clip = (t, n) => esc(t.length > n ? t.slice(0, n - 3) + '…' : t);
function workLines(p) {
  const w = partWork(p);
  return `<div class="s">${w.work.length ? 'слесарка (' + w.work.length + '): ' + clip(w.work.join(' → '), 110) : '<span class="muted">слесарка: не указана</span>'}</div>`
    + (w.coats.length ? `<div class="s">покрытие: ${esc(w.coats.join(', '))}</div>` : '');
}
function setupsLine(p) {
  const st = p.setups || [], fs = p.finishSetups || [];
  if (!st.length && !fs.length) return 'сетапов на станках: нет';
  const tm = x => { const t = String(x == null ? '' : x).trim(); if (!t) return 'время не указано'; const sec = Math.round((typeof x === 'number' ? x : parseT(t)) * 60); return 'тайм ' + hms(sec); };
  let r = 'сетапов на станках: ' + st.length + st.map((u, i) => ` · сетап ${i + 1}${u.type ? ' (' + esc(u.type) + ')' : ''} — ${tm(u.time)}`).join('');
  if (fs.length) r += ' · чистовых: ' + fs.length + fs.map((u, i) => ` · чист. ${i + 1}${u.type ? ' (' + esc(u.type) + ')' : ''} — ${tm(u.time)}`).join('');
  return r;
}
function partLines(p) {
  const w = partWork(p), bits = [];
  let m = esc(p.mat || 'материал не указан');
  if (p.calc && !p.bought) { const r = calc(p.calc); if (r.pieceLen > 0) m += ` · длина заготовки ${fmt(r.pieceLen, 0)} мм`; }
  if (p.bought) m = 'покупная заготовка: ' + m;
  return `<div class="s">${m}</div>
    <div class="s">${setupsLine(p)}${p.drawing ? '' : ' · нет чертежа'}</div>
    ${p.harden ? `<div class="s">закалка: ${esc(p.hardenType || 'тип не указан')}${p.hardenHRC ? ', ' + esc(p.hardenHRC) + ' HRC' : ''}${p.hardenAllowance ? ' · с припуском' + ((p.finishSetups || []).length ? ' (' + (p.finishSetups || []).length + ' чист. сетап.)' : '') : ''}</div>` : ''}
    <div class="s">${w.work.length ? 'слесарка (' + w.work.length + '): ' + clip(w.work.join(' → '), 110) : 'слесарка: не указана'}</div>`
    + (w.coats.length ? `<div class="s">покрытие: ${esc(w.coats.join(', '))}</div>` : '')
    + (String(p.note || '').trim() ? `<div class="s${p.notePri === 'high' ? ' s-high' : ''}">${p.notePri === 'high' ? '⚠ ' : ''}примечание: ${clip(String(p.note).replace(/\s+/g, ' ').trim(), 140)}</div>` : '');
}
function finishSetupsHTML(setups, machines, dis) {
  if (!setups.length) return '<p class="muted">Чистовых сетапов нет.</p>';
  return setups.map((s, i) => `<div class="setup">
    <div class="sh">Чистовой сетап ${i + 1}${s.type ? ' · ' + esc(s.type) : ''}</div>
    <label>Тип<select data-bind="finishSetups.${i}.type" ${dis}><option value="">—</option>${SETUP_TYPES.map(t => `<option${t === s.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <label>Станок<select data-bind="finishSetups.${i}.machine" ${dis}><option value="">—</option>${machines.map(m => `<option value="${m.id}"${m.id === s.machine ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
    <label>Время (чч:мм:сс)<input class="tmask" inputmode="numeric" autocomplete="off" placeholder="00:00:00" data-bind="finishSetups.${i}.time" value="${esc(fmtT(s.time))}" ${dis}></label>
    <label>Заметка<input data-bind="finishSetups.${i}.note" value="${esc(s.note)}" ${dis}></label>
    <div class="pg"><label>Имя файла ПУ<input data-bind="finishSetups.${i}.program" value="${esc(s.program)}" ${dis}></label></div>
    ${dis ? '' : `<button class="x danger" data-act="delFinishSetup" data-arg="${i}">✕</button>`}</div>`).join('');
}
function viewPart() {
  const p = draft, dis = can('catalog', 2) ? '' : 'disabled';
  const used = S.projects.filter(pr => (pr.items || []).some(i => i.partId === p.id));
  const machines = S.machines.slice().sort(byName);
  return `<a class="back" href="#/parts">← Детали</a><h1>${p.id ? 'Деталь' : 'Новая деталь'}</h1>
  <div class="hero">
  <div class="card hero-dr"><h2>Чертёж</h2>${fileBlock(p.drawing, 'drawing', dis)}
    ${dis ? '' : '<input type="file" data-file="drawing" accept="application/pdf,image/*">'}
    <p class="muted">PDF или фото, до 8 МБ. STEP/DXF добавим позже.</p></div>
  <div class="card hero-info">
    <div class="row"><label>Артикул<input data-bind="art" value="${esc(p.art)}" ${dis}></label>
    <label>Название<input data-bind="name" value="${esc(p.name)}" ${dis}></label></div>
    <label>Материал (как писать в наряде)<input data-bind="mat" value="${esc(p.mat)}" placeholder="Сталь 40, круг Ø30" ${dis}></label>
    ${gradesIn(p.mat).length > 1 ? '<div class="warn">⚠ В материале указано несколько марок — проверьте, по какой считать заготовку.</div>' : ''}
    <label class="chk"><input type="checkbox" data-bind="bought" ${p.bought ? 'checked' : ''} ${dis}> Покупная заготовка</label>
    <p class="muted chk-h">Болт, штифт и т. п., которые дорабатываем: время считается, пруток не нужен. Какая именно — напишите в поле «Материал», например: болт DIN 933 М20×100.</p>
    <label class="chk"><input type="checkbox" data-bind="harden" ${p.harden ? 'checked' : ''} ${dis}> Закалка</label>
    ${p.harden ? `<div class="hard-opts">
      <div class="row"><label>Тип<select data-bind="hardenType" ${dis}><option value="">—</option><option${p.hardenType === 'твч' ? ' selected' : ''}>твч</option><option${p.hardenType === 'печь' ? ' selected' : ''}>печь</option></select></label>
      <label>Твёрдость, HRC<input data-bind="hardenHRC" value="${esc(p.hardenHRC)}" placeholder="45–50" inputmode="text" ${dis}></label></div>
      <label class="chk"><input type="checkbox" data-bind="hardenAllowance" ${p.hardenAllowance ? 'checked' : ''} ${dis}> Припуск под чистовую обработку после закалки</label>
    </div>` : ''}
    <label class="cs">Покрытие (можно несколько через запятую, можно своё)<input class="cs-in" data-bind="coat" value="${esc(p.coat)}" placeholder="оксидирование, краска…" autocomplete="off" ${dis}><div class="cb-list" hidden></div></label>

    <div class="note-block${p.notePri === 'high' ? ' note-high' : p.notePri === 'normal' ? ' note-normal' : ''}">
    <div class="note-hdr"><label>Заметка<textarea data-bind="note" ${dis}>${esc(p.note)}</textarea></label>
    <label>Приоритет<select data-bind="notePri" ${dis}><option value="">—</option><option value="normal"${p.notePri === 'normal' ? ' selected' : ''}>Обычная</option><option value="high"${p.notePri === 'high' ? ' selected' : ''}>⚠ Важная</option></select></label></div></div>
  </div>
  </div>
  <div class="card"><h2>Расчёт заготовки</h2>${p.bought ? '<p class="warn">Заготовка покупная — расчёт прутка не нужен, считайте только если режете из прутка.</p>' : ''}${calcHTML(p.calc, true)}
    ${dis ? '' : '<button data-act="calcToMat">Записать расчёт в поле «Материал»</button>'}</div>
  <div class="card"><h2>Сетапы</h2>
    ${!machines.length ? `<div class="warn">Список станков пуст, поэтому в поле «Станок» нечего выбирать. ${S.me && S.me.isAdmin ? '<button class="link" data-act="seedMachines">Заполнить стандартным списком станков</button>' : 'Попросите администратора заполнить список во вкладке «Команда».'}</div>` : ''}
    ${(p.setups || []).map((s, i) => `<div class="setup">
      <div class="sh">Сетап ${i + 1}${s.type ? ' · ' + esc(s.type) : ''}</div>
      <label>Тип<select data-bind="setups.${i}.type" ${dis}><option value="">—</option>${SETUP_TYPES.map(t => `<option${t === s.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Станок<select data-bind="setups.${i}.machine" ${dis}><option value="">—</option>${machines.map(m => `<option value="${m.id}"${m.id === s.machine ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <label>Время (чч:мм:сс)<input class="tmask" inputmode="numeric" autocomplete="off" placeholder="00:00:00" data-bind="setups.${i}.time" value="${esc(fmtT(s.time))}" ${dis}></label>
      <label>Заметка<input data-bind="setups.${i}.note" value="${esc(s.note)}" ${dis}></label>
      <div class="pg"><label>Имя файла ПУ<input data-bind="setups.${i}.program" value="${esc(s.program)}" ${dis}></label>${dis ? '' : `<button class="x" title="Вставить артикул" data-act="progFromArt" data-arg="${i}">= арт.</button>`}</div>
      ${dis ? '' : `<button class="x danger" data-act="delSetup" data-arg="${i}">✕</button>`}</div>`).join('') || '<p class="muted">Сетапов нет.</p>'}
    ${dis ? '' : '<button data-act="addSetup">+ Сетап</button>'}
    <p class="muted">Сетапы нумеруются по порядку. Время на одну деталь по машинному таймеру: вводите вручную, только цифры — двоеточия расставятся сами (7 мин 15 с = 000715, 1 ч 15 мин 13 с = 011513); позже оно будет обновляться из отчётов операторов.</p></div>
  ${p.harden && p.hardenAllowance ? '<div class="card"><h2>Чистовая обработка после закалки</h2>' + finishSetupsHTML(p.finishSetups || [], machines, dis) + (dis ? '' : '<button data-act="addFinishSetup">+ Чистовой сетап</button>') + '<p class="muted">Сетапы чистовой обработки после закалки. Заполняются так же, как обычные сетапы.</p></div>' : ''}
  <div class="card"><h2>Слесарные операции</h2>
    <p class="muted">Прогнать резьбу, пескоструйка, снять заусенцы и т. п. Покрытия (оксидирование, краска, анодирование) — не здесь, а в поле «Покрытие» вверху.</p>
    ${(p.steps || []).map((s, i) => `<div class="step"><label>Операция ${i + 1}<input data-bind="steps.${i}" value="${esc(s)}" ${dis}></label>${dis ? '' : `<button class="x danger" data-act="delStep" data-arg="${i}">✕</button>`}${isCoatName(s) && !dis ? `<div class="warn" style="grid-column:1/-1;margin:0">Это покрытие, а не слесарная операция. <button class="link" data-act="moveCoat" data-arg="${i}">Перенести в «Покрытие»</button></div>` : ''}</div>`).join('') || '<p class="muted">Нет.</p>'}
    ${dis ? '' : '<button data-act="addStep">+ Операция</button>'}</div>
  ${used.length ? `<div class="card"><h2>Входит в изделия</h2>${used.map(u => `<a href="#/project/${u.id}">${esc(u.name)}</a>`).join('<br>')}</div>` : ''}
  ${formErr ? `<div class="err">${esc(formErr)}</div>` : ''}
  <div class="bar">${dis ? '' : '<button class="primary" data-act="savePart">Сохранить</button>'}
    ${p.id && can('catalog', 3) ? '<button class="danger" data-act="delPart">Удалить</button>' : ''}</div>`;
}
function viewProject() {
  const p = draft, dis = can('catalog', 2) ? '' : 'disabled';
  const parts = S.parts.slice().sort(byName);
  return `<a class="back" href="#/projects">← Изделия</a><h1>${p.id ? 'Изделие' : 'Новое изделие'}</h1>
  <div class="card"><div class="row"><label>Артикул<input data-bind="art" value="${esc(p.art)}" ${dis}></label>
    <label>Название<input data-bind="name" value="${esc(p.name)}" ${dis}></label></div></div>
  <div class="card"><h2>Состав (детали)</h2>
    ${(p.items || []).map((it, i) => { const pt = partById(it.partId); return `<div class="pitem">
      <div class="pi">${pt ? thumbHTML(pt.drawing, !!pt.drawing) : ''}<div class="tx2">${pt ? `<a href="#/part/${pt.id}">${pt.art ? `<span class="art">${esc(pt.art)}</span>` : ''}${esc(pt.name)}</a>${partLines(pt)}` : '<span class="muted">деталь удалена</span>'}</div></div>
      <label>Шт на 1 изделие<input inputmode="numeric" data-bind="items.${i}.qty" value="${esc(it.qty)}" ${dis}></label>
      ${dis ? '' : `<button class="x danger" data-act="delItem" data-arg="${i}">✕</button>`}</div>`; }).join('') || '<p class="muted">Деталей в составе нет.</p>'}
    ${dis ? '' : `<div class="bar"><div class="grow"><select id="addPart"><option value="">— выбрать из каталога —</option>${parts.map(x => `<option value="${x.id}">${esc((x.art ? x.art + ' · ' : '') + x.name)}</option>`).join('')}</select></div>
      <button data-act="addItem">Добавить</button><button data-act="newPartFor">+ Новая деталь</button></div>`}</div>
  <div class="card"><h2>Сборка</h2>
    <label>Заметки по сборке<textarea data-bind="note" ${dis}>${esc(p.note)}</textarea></label>
    ${(p.files || []).map((f, i) => fileBlock(f, 'files.' + i, dis)).join('')}
    ${dis ? '' : '<input type="file" data-file="files" accept="application/pdf,image/*"><p class="muted">Сборочные чертежи: PDF или фото, до 8 МБ.</p>'}</div>
  ${formErr ? `<div class="err">${esc(formErr)}</div>` : ''}
  <div class="bar">${dis ? '' : '<button class="primary" data-act="saveProject">Сохранить</button>'}
    ${p.id && can('catalog', 3) ? '<button class="danger" data-act="delProject">Удалить</button>' : ''}</div>`;
}
function viewCalc() {
  return `<h1>Калькулятор материала</h1><div class="card">${calcHTML(draft.calc, false)}
    <div class="bar" style="margin-top:12px"><button data-act="copyCalc">Скопировать</button><button data-act="resetCalc">Сбросить</button></div></div>`;
}
function viewStub(t, d) { return `<h1>${t}</h1><div class="card muted">${d}</div>`; }
function viewTeam() {
  if (!S.me.isAdmin) return viewStub('Команда', 'Только для администратора.');
  const users = S.users.slice().sort(byName);
  const tplOpts = '<option value="">— шаблон —</option>' + Object.keys(TPL).map(k => `<option value="${k}">${TPL[k].name}</option>`).join('');
  const permSel = (u, b) => `<label>${BLOCKS[b]}<select data-u="${u.id}" data-f="perms.${b}">${LEVELS.map((n, i) => `<option value="${i}"${((u.perms || {})[b] || 0) === i ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`;
  return `<h1>Команда</h1>
  <div class="card"><h2>Добавить человека</h2>
    <div class="row"><label>Имя<input id="nuName"></label><label>Логин (латиница)<input id="nuLogin" autocapitalize="none"></label>
    <label>Пароль (от 6 символов)<input id="nuPass" type="text" autocomplete="off"></label>
    <label>Шаблон прав<select id="nuTpl">${tplOpts}</select></label></div>
    ${formErr ? `<div class="err">${esc(formErr)}</div>` : ''}
    <button class="primary" data-act="addUser">Создать</button></div>
  ${users.map(u => `<div class="user"><div class="row">
      <label>Имя<input data-u="${u.id}" data-f="name" value="${esc(u.name)}"></label>
      <div><div class="muted">Логин</div><div class="mono">${esc(u.login)}</div></div></div>
    <div style="margin:6px 0"><label style="display:inline-block;margin-right:16px"><input type="checkbox" data-u="${u.id}" data-f="active" ${u.active ? 'checked' : ''} ${u.id === S.me.uid ? 'disabled' : ''}>Активен</label>
      <label style="display:inline-block"><input type="checkbox" data-u="${u.id}" data-f="isAdmin" ${u.isAdmin ? 'checked' : ''} ${u.id === S.me.uid ? 'disabled' : ''}>Администратор</label></div>
    <div class="perms">${Object.keys(BLOCKS).map(b => permSel(u, b)).join('')}<label>Применить шаблон<select data-u="${u.id}" data-f="tpl">${tplOpts}</select></label></div></div>`).join('')}
  <div class="card"><h2>Станки</h2>
    ${S.machines.slice().sort(byName).map(m => `<div class="step"><label>Название<input data-m="${m.id}" value="${esc(m.name)}"></label><button class="x danger" data-act="delMachine" data-arg="${m.id}">✕</button></div>`).join('') || '<p class="muted">Список пуст.</p>'}
    <div class="bar"><div class="grow"><input id="newMachine" placeholder="Новый станок"></div><button data-act="addMachine">Добавить</button>
    ${S.machines.length ? '' : '<button data-act="seedMachines">Заполнить стандартным списком</button>'}</div></div>
  <p class="muted">Забыли пароль у человека: отключите его здесь и создайте заново под новым логином.</p>`;
}

/* ───────── Рендер ───────── */
const NAV = [['projects', 'Изделия', () => can('catalog', 1)], ['parts', 'Детали', () => can('catalog', 1)],
  ['progress', 'В работе', () => can('launches', 1)], ['done', 'Готовые', () => can('launches', 1)],
  ['report', 'Отчёт', () => can('reports', 2)], ['locksmith', 'Слесарка', () => can('launches', 1)],
  ['calc', 'Калькулятор', () => true], ['team', 'Команда', () => S.me && S.me.isAdmin]];
function render() { renderMain(); setTimeout(hydrate, 0); }
function renderMain() {
  const top = $('#top'), view = $('#view');
  if (S.me === undefined) return;
  if (!S.me) { top.hidden = true; if (!$('#lg')) view.innerHTML = viewLogin(); return; }
  if (S.me.missing || S.me.error || S.me.active === false) { top.hidden = true; view.innerHTML = viewNoProfile(); return; }
  top.hidden = false; $('#whoName').textContent = (S.me.name || S.me.login) + ' · ' + VER;
  const r = route(); const sec = r.seg[0] || (can('catalog', 1) ? 'projects' : 'progress');
  const navOn = n => n === sec || (sec === 'part' && n === 'parts') || (sec === 'project' && n === 'projects') || ((sec === 'launch' || sec === 'launch-new' || sec === 'print') && n === 'progress');
  $('#nav').innerHTML = NAV.filter(n => n[2]()).map(n => `<a href="#/${n[0]}" class="${navOn(n[0]) ? 'on' : ''}">${n[1]}</a>`).join('');
  const key = location.hash || '#/';
  const needCat = ['projects', 'parts', 'part', 'project'].includes(sec);
  if (needCat && !can('catalog', 1)) { view.innerHTML = viewStub('Нет доступа', 'У вас нет доступа к каталогу.'); return; }
  if (sec === 'part' || sec === 'project') {
    const isPart = sec === 'part', id = r.seg[1];
    if (draftKey !== key) {
      let rec;
      if (id === 'new') rec = isPart ? { art: '', name: '', mat: '', note: '', calc: Object.assign(defaultCalc(), { qty: '1', spare: '0' }), setups: [], finishSetups: [], steps: [], drawing: null }
        : { art: '', name: '', note: '', items: [], files: [] };
      else { const src = isPart ? S.parts : S.projects; const f = src.find(x => x.id === id); if (!f) { view.innerHTML = S.ready[isPart ? 'parts' : 'projects'] ? viewStub('Не найдено', 'Такой записи нет.') : '<p class="muted pad">Загрузка…</p>'; return; } rec = clone(f); if (isPart) { rec.calc = rec.calc || defaultCalc(); rec.setups = rec.setups || []; rec.finishSetups = rec.finishSetups || []; rec.steps = rec.steps || []; } else { rec.items = rec.items || []; rec.files = rec.files || []; } }
      if (isPart && rec.calc && !rec.calc.matUser) { const g = guessMaterial(rec.mat); if (g) rec.calc.mat = g.id; }
      draft = rec; draft._del = []; draftKey = key; formErr = '';
      if (id !== 'new') draft.id = id;
    }
    view.innerHTML = isPart ? viewPart() : viewProject();
    return;
  }
  if (sec === 'calc') { if (draftKey !== key) { draft = { calc: calcState }; draftKey = key; } view.innerHTML = viewCalc(); return; }
  draft = null; draftKey = null;
  if (sec === 'parts') view.innerHTML = viewParts();
  else if (sec === 'projects') view.innerHTML = viewProjects();
  else if (sec === 'team') view.innerHTML = viewTeam();
  else if (sec === 'progress') view.innerHTML = viewLaunches('active');
  else if (sec === 'done') view.innerHTML = viewLaunches('done');
  else if (sec === 'launch') { view.innerHTML = viewLaunch(r.seg[1]); return; }
  else if (sec === 'launch-new') { view.innerHTML = viewLaunchNew(); return; }
  else if (sec === 'report') { view.innerHTML = viewReport(); return; }
  else if (sec === 'locksmith') { view.innerHTML = viewLocksmith(); return; }
  else if (sec === 'print') { view.innerHTML = viewPrint(r.seg[1]); return; }
  else view.innerHTML = viewStub('Не найдено', 'Такой страницы нет.');
}

/* ───────── Запуски (В работе) ───────── */
function launchProgress(launch) {
  // подсчёт прогресса по отчётам: ключ partId_stageKey -> qty done
  const reps = S.reports.filter(r => r.launchId === launch.id);
  const done = {};
  reps.forEach(r => (r.entries || []).forEach(e => {
    const k = e.partId + '_' + (e.stageKey || 'setup_' + (e.setupIdx || 0));
    done[k] = (done[k] || 0) + (e.done || 0);
  }));
  // обратная совместимость: старые отчёты со слесаркой
  reps.forEach(r => (r.locksmith || []).forEach(e => {
    const k = e.partId + '_lock_' + (e.stepIdx || 0);
    done[k] = (done[k] || 0) + (e.done || 0);
  }));
  return { done };
}
function launchPct(launch) {
  const { done } = launchProgress(launch);
  let total = 0, completed = 0;
  (launch.items || []).forEach(it => {
    const pt = partById(it.partId);
    const stages = partStages(pt);
    stages.forEach(st => { total += it.qtyTotal; completed += Math.min(it.qtyTotal, done[it.partId + '_' + st.key] || 0); });
    if (!stages.length) { total += it.qtyTotal; }
  });
  return total ? Math.round(completed / total * 100) : 0;
}
function progressBar(val, max) {
  const pct = max ? Math.min(100, Math.round(val / max * 100)) : 0;
  const cls = pct >= 100 ? 'pb-done' : pct > 0 ? 'pb-wip' : 'pb-zero';
  return `<div class="pb ${cls}"><div class="pb-fill" style="width:${pct}%"></div><span class="pb-txt">${val}/${max} (${pct}%)</span></div>`;
}
const PRI_LABELS = { asap: '🔴 Очень срочная', urgent: '🟠 Срочная', normal: '', low: '🔵 Несрочная' };
const PRI_CSS = { asap: 'pri-asap', urgent: 'pri-urgent', normal: '', low: 'pri-low' };
function priTag(p) { if (!p || p === 'normal') return ''; return `<span class="tag ${PRI_CSS[p] || ''}">${PRI_LABELS[p] || p}</span>`; }
function deadlineStr(ts) { if (!ts) return ''; const d = new Date(ts); return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
function deadlineTag(ts) {
  if (!ts) return '';
  const now = Date.now(), d = new Date(ts), diff = ts - now;
  const cls = diff < 0 ? 'dl-over' : diff < 86400000 ? 'dl-soon' : '';
  return `<span class="dl ${cls}">⏰ ${deadlineStr(ts)}</span>`;
}
const PRI_ORDER = { asap: 0, urgent: 1, normal: 2, low: 3 };
const SORT_ACTIVE = [
  { id: 'pri', label: 'Срочность' },
  { id: 'deadline', label: 'Дедлайн' },
  { id: 'date', label: 'Дата запуска' },
  { id: 'alpha', label: 'Алфавит' },
  { id: 'progress', label: 'Прогресс' }
];
const SORT_DONE = [
  { id: 'finished', label: 'Дата завершения' },
  { id: 'date', label: 'Дата запуска' },
  { id: 'alpha', label: 'Алфавит' },
  { id: 'qty', label: 'Тираж' }
];
let sortState = { active: { key: 'date', dir: -1 }, done: { key: 'finished', dir: -1 } };
function sortLaunches(items, status) {
  const st = sortState[status] || sortState.active;
  const s = st.key, d = st.dir;
  return items.slice().sort((a, b) => {
    let r = 0;
    if (s === 'pri') { r = (PRI_ORDER[a.priority] ?? 2) - (PRI_ORDER[b.priority] ?? 2); }
    else if (s === 'deadline') { r = (a.deadline || Infinity) - (b.deadline || Infinity); }
    else if (s === 'date') { r = (a.created || 0) - (b.created || 0); }
    else if (s === 'finished') { r = (a.finished || 0) - (b.finished || 0); }
    else if (s === 'alpha') { r = String(a.projectName || '').localeCompare(String(b.projectName || ''), 'ru'); }
    else if (s === 'progress') { r = launchPct(a) - launchPct(b); }
    else if (s === 'qty') { r = (a.qty || 0) - (b.qty || 0); }
    if (r === 0) r = (a.created || 0) - (b.created || 0);
    return r * d;
  });
}
function viewLaunches(status) {
  const filtered = S.launches.filter(l => l.status === status);
  const isActive = status === 'active';
  const items = sortLaunches(filtered, isActive ? 'active' : 'done');
  const title = isActive ? 'В работе' : 'Готовые';
  const modes = isActive ? SORT_ACTIVE : SORT_DONE;
  const st = sortState[isActive ? 'active' : 'done'];
  const sortBtns = modes.map(m => {
    const cur = st.key === m.id;
    const arrow = cur ? (st.dir === 1 ? ' ↑' : ' ↓') : '';
    return `<button class="chip${cur ? ' active' : ''}" data-act="setSort" data-arg="${m.id}">${m.label}${arrow}</button>`;
  }).join('');
  const compact = isActive && viewMode.active === 'compact';
  return `<h1>${title}</h1>
    ${isActive && can('launches', 2) ? `<div class="bar"><div class="grow"></div><a class="btn primary" href="#/launch-new">+ Запуск</a></div>` : ''}
    ${filtered.length > 1 ? `<div class="sort-bar">${isActive ? viewToggleBtn('active') : ''}${sortBtns}</div>` : (isActive ? `<div class="sort-bar">${viewToggleBtn('active')}</div>` : '')}
    <div class="list${compact ? ' list-compact' : ''}">${items.map(l => {
      const pct = launchPct(l);
      const d = l.created ? new Date(l.created).toLocaleDateString('ru-RU') : '';
      const proj = S.projects.find(p => p.id === l.projectId);
      const projFile = proj && (proj.files || []).length ? proj.files[0] : null;
      let th;
      if (projFile) { th = thumbHTML(projFile); }
      else { const pts = (l.items || []).map(it => partById(it.partId)).filter(p => p && p.drawing);
        th = pts.length ? pts.map(p => thumbHTML(p.drawing)).join('') : '<span class="thumb none"></span>'; }
      if (compact && !expandedCards.has(l.id)) {
        const rep = lastReportInfo(l.id);
        return `<div class="item hasth launch-item launch-compact"><a class="lc-link" href="#/launch/${l.id}"><div class="launch-thumbs">${th}</div></a>
          <div class="tx"><a class="lc-title" href="#/launch/${l.id}"><div class="t">${l.projectArt ? `<span class="art">${esc(l.projectArt)}</span>` : ''}${esc(l.projectName)} ${priTag(l.priority)}</div></a>
          <div class="s"><b>${l.qty} штук</b> · ${d}${l.deadline ? ' · ' + deadlineTag(l.deadline) : ''}</div>
          ${progressBar(pct, 100)}
          ${rep ? `<div class="s last-rep">📋 ${esc(rep.date)}, ${esc(rep.user)}: ${esc(rep.summary)}</div>` : ''}
          <button class="link expand-btn" data-act="toggleExpand" data-arg="${l.id}">▾ Развернуть</button></div></div>`;
      }
      const partsInfo = (l.items || []).map(it => {
        const pt = partById(it.partId);
        if (!pt) return '';
        return `<div class="launch-part-info"><div class="lpi-hdr"><div><b>${pt.art ? `<span class="art">${esc(pt.art)}</span>` : ''}${esc(pt.name)}</b> · ${it.qtyTotal} штук</div></div>${partLines(pt)}</div>`;
      }).join('');
      const isExpanded = compact && expandedCards.has(l.id);
      const expandBtn = isExpanded ? `<button class="link expand-btn" data-act="toggleExpand" data-arg="${l.id}">▴ Свернуть</button>` : '';
      return `<a class="item hasth launch-item${isExpanded ? ' expanded' : ''}" href="#/launch/${l.id}"><div class="launch-thumbs">${th}</div>
        <div class="tx"><div class="t">${l.projectArt ? `<span class="art">${esc(l.projectArt)}</span>` : ''}${esc(l.projectName)} ${priTag(l.priority)}</div>
        <div class="s"><b>${l.qty} штук</b> · ${d}${l.deadline ? ' · ' + deadlineTag(l.deadline) : ''}</div>
        ${progressBar(pct, 100)}${partsInfo}${expandBtn}</div></a>`;
    }).join('') || `<p class="muted">${isActive ? 'Нет активных запусков.' : 'Нет завершённых запусков.'}</p>`}</div>`;
}
function viewLaunchNew() {
  if (!can('launches', 2)) return viewStub('Нет доступа', 'У вас нет прав на создание запусков.');
  const projects = S.projects.slice().sort(byName);
  return `<div class="card"><h2>Новый запуск</h2>
    <label>Изделие<select id="lnProj"><option value="">— выберите —</option>${projects.map(p => `<option value="${p.id}">${p.art ? p.art + ' ' : ''}${esc(p.name)}</option>`).join('')}</select></label>
    <label>Тираж, шт<input id="lnQty" type="number" min="1" value="1" inputmode="numeric"></label>
    <label>Срочность<select id="lnPri"><option value="normal">Обычная</option><option value="urgent">Срочная</option><option value="asap">Очень срочная</option><option value="low">Несрочная</option></select></label>
    <label>Готово к (дата и время)<input id="lnDeadline" type="datetime-local"></label>
    <div id="lnPreview"></div>
    ${formErr ? `<div class="err">${esc(formErr)}</div>` : ''}
    <div class="btns"><button class="primary" data-act="createLaunch">Запустить</button> <a href="#/progress">Отмена</a></div></div>`;
}
function viewLaunch(id) {
  const l = S.launches.find(x => x.id === id);
  if (!l) return S.ready.launches ? viewStub('Не найдено', 'Запуск не найден.') : '<p class="muted pad">Загрузка…</p>';
  const { done, lockDone } = launchProgress(l);
  const pct = launchPct(l);
  const isActive = l.status === 'active';
  return `<div class="card"><div class="btns" style="float:right">
    ${isActive && can('launches', 2) ? `<button data-act="finishLaunch" data-arg="${l.id}">Завершить ✓</button>` : ''}
    ${!isActive && can('launches', 2) ? `<button data-act="reopenLaunch" data-arg="${l.id}">Вернуть в работу</button>` : ''}
    <a class="btn" href="#/print/${l.id}">🖨 Печать</a>
    </div>
    <h2>${l.projectArt ? `<span class="art">${esc(l.projectArt)}</span> ` : ''}${esc(l.projectName)} ${priTag(l.priority)}</h2>
    <div class="s"><b>${l.qty} штук</b> · ${l.created ? new Date(l.created).toLocaleDateString('ru-RU') : ''} · ${l.createdByName || ''}${l.deadline ? ` · ${deadlineTag(l.deadline)}` : ''}</div>
    <div style="margin:12px 0">${progressBar(pct, 100)}</div>
    <h3>Детали</h3>
    ${(l.items || []).map(it => {
      const pt = partById(it.partId);
      const stages = partStages(pt);
      const noteHTML = pt && pt.note && pt.notePri === 'high' ? `<div class="s s-high">⚠ ${esc(pt.note)}</div>` : '';
      let curGroup = '';
      const stagesHTML = stages.map(st => {
        const d = done[it.partId + '_' + st.key] || 0;
        const groupHdr = st.group && st.group !== curGroup ? (curGroup = st.group, `<div class="li-grp">${esc(st.group)}</div>`) : '';
        return groupHdr + `<div class="li-op"><span>${esc(st.label)}</span>${progressBar(d, it.qtyTotal)}</div>`;
      }).join('');
      return `<div class="li-part">
        <div class="li-hdr pi">${pt ? thumbHTML(pt.drawing, !!pt.drawing) : ''}<div class="tx2"><a href="#/part/${it.partId}">${it.partArt ? `<span class="art">${esc(it.partArt)}</span>` : ''}${esc(it.partName)}</a><div class="s"><b>${it.qtyTotal} штук</b> (${it.qtyPer} на изделие)</div></div></div>
        ${noteHTML}${stagesHTML}</div>`;
    }).join('')}
    <a href="#/progress">← Назад</a></div>`;
}
// Все этапы детали: сетапы, слесарка, закалка, покрытие
function partStages(pt) {
  if (!pt) return [];
  const stages = [];
  const setups = pt.setups || [];
  setups.forEach((su, si) => {
    const mn = su.machine ? machineName(su.machine) : '';
    stages.push({ key: 'setup_' + si, label: (su.type || 'сетап ' + (si + 1)) + (mn ? ' · ' + mn : ''), group: 'Обработка' });
  });
  if (!setups.length) stages.push({ key: 'setup_0', label: 'обработка', group: 'Обработка' });
  const work = partWork(pt);
  work.work.forEach((w, wi) => stages.push({ key: 'lock_' + wi, label: w, group: 'Слесарка' }));
  if (pt.harden) {
    stages.push({ key: 'harden', label: 'закалка' + (pt.hardenType ? ' (' + pt.hardenType + ')' : ''), group: 'Закалка' });
    if (pt.hardenAllowance) {
      const fs = pt.finishSetups || [];
      if (fs.length) fs.forEach((su, fi) => {
        const mn = su.machine ? machineName(su.machine) : '';
        stages.push({ key: 'finish_' + fi, label: 'чистовая ' + (su.type || 'сетап ' + (fi + 1)) + (mn ? ' · ' + mn : ''), group: 'Закалка' });
      });
      else stages.push({ key: 'finish_0', label: 'чистовая обработка после закалки', group: 'Закалка' });
    }
  }
  if (work.coats.length) work.coats.forEach((c, ci) => stages.push({ key: 'coat_' + ci, label: c, group: 'Покрытие' }));
  return stages;
}
function viewReport() {
  if (!can('reports', 2)) return viewStub('Нет доступа', 'У вас нет прав на создание отчётов.');
  const activeLaunches = S.launches.filter(l => l.status === 'active');
  // собрать все детали из активных запусков
  const rows = [];
  activeLaunches.forEach(l => {
    const { done } = launchProgress(l);
    (l.items || []).forEach(it => {
      const pt = partById(it.partId);
      if (!pt) return;
      const stages = partStages(pt);
      const pending = stages.filter(st => (done[it.partId + '_' + st.key] || 0) < it.qtyTotal);
      if (!pending.length) return;
      rows.push({ launch: l, it, pt, stages, pending, done });
    });
  });
  return `<div class="card"><h2>Вечерний отчёт</h2>
    ${rows.length ? rows.map(r => {
      const noteHTML = r.pt.notePri === 'high' ? `<div class="s s-high">⚠ ${esc(r.pt.note)}</div>` : '';
      return `<div class="rp-row">
        <div class="rp-part pi">${thumbHTML(r.pt.drawing, !!r.pt.drawing)}<div class="tx2"><b>${r.it.partArt ? esc(r.it.partArt) + ' ' : ''}${esc(r.it.partName)}</b>
          <div class="s">${esc(r.launch.projectName)} · <b>${r.it.qtyTotal} штук</b></div></div></div>
        ${noteHTML}
        ${r.pending.map(st => {
          const d = r.done[r.it.partId + '_' + st.key] || 0;
          const remain = r.it.qtyTotal - d;
          return `<div class="rp-stage">
            <div class="s">${esc(st.label)} · осталось ${remain} шт</div>
            ${progressBar(d, r.it.qtyTotal)}
            <label>Сделано, шт<input class="rp-done" type="number" min="0" max="${remain}" data-li="${r.launch.id}" data-pi="${r.it.partId}" data-sk="${st.key}" inputmode="numeric" value="0"></label>
          </div>`;
        }).join('')}
      </div>`;
    }).join('') + `<button class="primary" data-act="submitReport" style="margin-top:16px">Сохранить отчёт</button>`
    : '<p class="muted">Все детали по активным запускам готовы, либо активных запусков нет.</p>'}</div>`;
}
function viewLocksmith() {
  const activeLaunches = S.launches.filter(l => l.status === 'active');
  const rows = [];
  activeLaunches.forEach(l => {
    const { done } = launchProgress(l);
    (l.items || []).forEach(it => {
      const pt = partById(it.partId);
      if (!pt) return;
      // все этапы кроме сетапов: слесарка, закалка, покрытие
      const stages = partStages(pt).filter(st => !st.key.startsWith('setup_'));
      const pending = stages.filter(st => (done[it.partId + '_' + st.key] || 0) < it.qtyTotal)
        .map(st => ({ ...st, done: done[it.partId + '_' + st.key] || 0, remain: it.qtyTotal - (done[it.partId + '_' + st.key] || 0) }));
      if (!pending.length) return;
      rows.push({ launch: l, it, pt, pending });
    });
  });
  return `<div class="card"><h2>Слесарка / Закалка / Покрытие</h2>
    ${rows.length ? rows.map(r => {
      const noteHTML = r.pt.notePri === 'high' ? `<div class="s s-high">⚠ ${esc(r.pt.note)}</div>` : '';
      return `<div class="lk-row">
        <div class="lk-hdr pi">${thumbHTML(r.pt.drawing, !!r.pt.drawing)}<div class="tx2"><b>${r.it.partArt ? esc(r.it.partArt) + ' ' : ''}${esc(r.it.partName)}</b>
          <div class="s">${esc(r.launch.projectName)} · <b>${r.it.qtyTotal} штук</b></div></div></div>
        ${noteHTML}
        ${r.pending.map(o => `<div class="lk-op">
          <span>${esc(o.label)}</span> <span class="muted">· ${o.group || ''} · осталось ${o.remain} шт</span>
          ${progressBar(o.done, r.it.qtyTotal)}
          <label>Сделано<input class="lk-done" type="number" min="0" max="${o.remain}" data-li="${r.launch.id}" data-pi="${r.it.partId}" data-sk="${o.key}" inputmode="numeric" value="0"></label>
        </div>`).join('')}
      </div>`;
    }).join('') + `<button class="primary" data-act="submitLocksmith" style="margin-top:16px">Сохранить</button>`
    : '<p class="muted">Нет незавершённых операций (слесарка, закалка, покрытие).</p>'}</div>`;
}
function viewPrint(id) {
  const l = S.launches.find(x => x.id === id);
  if (!l) return viewStub('Не найдено', 'Запуск не найден.');
  const d = l.created ? new Date(l.created).toLocaleDateString('ru-RU') : '';
  return `<div class="print-sheet">
    <h1>Задание на производство</h1>
    <p><b>${l.projectArt ? esc(l.projectArt) + ' ' : ''}${esc(l.projectName)}</b> · Тираж: ${l.qty} шт · ${d}</p>
    <table class="print-tbl"><thead><tr><th>Деталь</th><th>Кол-во</th><th>Материал</th><th>Сетапы</th><th>Слесарка</th><th>Примечание</th></tr></thead><tbody>
    ${(l.items || []).map(it => {
      const pt = partById(it.partId);
      const setups = pt ? (pt.setups || []).map((s, i) => `${i + 1}. ${s.type || '?'} ${machineName(s.machine)}`).join('<br>') : '';
      const work = pt ? partWork(pt) : { work: [] };
      return `<tr><td>${it.partArt ? esc(it.partArt) + ' ' : ''}${esc(it.partName)}</td>
        <td>${it.qtyTotal}</td><td>${pt ? esc(pt.mat || '—') : '—'}</td><td>${setups || '—'}</td>
        <td>${work.work.length ? work.work.map(esc).join('<br>') : '—'}</td>
        <td>${pt && pt.note ? (pt.notePri === 'high' ? '⚠ ' : '') + esc(pt.note) : ''}</td></tr>`;
    }).join('')}
    </tbody></table>
    <button class="no-print" onclick="window.print()">🖨 Печать</button>
    <a class="btn no-print" href="#/launch/${l.id}">← Назад</a></div>`;
}

/* ───────── Показ чертежей ───────── */
const blobP = new Map(), prevP = new Map(), prevCache = new Map(), pvMeta = {}, thumbDone = new Set();
const isPdf = m => /pdf/i.test(m.type || '') || /\.pdf$/i.test(m.name || '');
const isImg = m => /^image\//.test(m.type || '');
function reg(m) { pvMeta[m.id] = m; return m; }
function fileBlob(m) {
  if (!blobP.has(m.id)) blobP.set(m.id, B.getFile(m.id).catch(e => { blobP.delete(m.id); throw e; }));
  return blobP.get(m.id);
}
const PDFJS = ['pdfjs/', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/'];
let pdfjsP = null, pdfjsDead = false;
function loadPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsDead) return Promise.reject(new Error('pdf.js недоступен'));
  if (pdfjsP) return pdfjsP;
  pdfjsP = (async () => {
    for (const base of PDFJS) {
      try {
        await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = base + 'pdf.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('load')); setTimeout(() => rej(new Error('таймаут')), 8000); document.head.appendChild(sc); });
        if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; return window.pdfjsLib; }
      } catch (e) { }
    }
    pdfjsP = null; pdfjsDead = true; throw new Error('pdf.js недоступен');
  })();
  return pdfjsP;
}
async function openPdf(blob) { const lib = await loadPdfjs(); return lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise; }
async function pdfPageCanvas(pdf, n, cssWidth) {
  const page = await pdf.getPage(n), v1 = page.getViewport({ scale: 1 });
  const dpr = Math.min(2, window.devicePixelRatio || 1), vp = page.getViewport({ scale: cssWidth / v1.width * dpr });
  const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  return cv;
}
async function makeThumb(blob, meta) {
  try {
    let src, w, h;
    if (isImg(meta)) { src = await createImageBitmap(blob); w = src.width; h = src.height; }
    else if (isPdf(meta)) { src = await pdfPageCanvas(await openPdf(blob), 1, 1200); w = src.width; h = src.height; }
    else return null;
    const k = Math.min(1, 800 / Math.max(w, h)), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(src, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.9);
  } catch (e) { return null; }
}
function getPreview(meta) {
  if (!prevP.has(meta.id)) {
    prevP.set(meta.id, (async () => {
      const blob = await fileBlob(meta); let url;
      if (isImg(meta)) url = URL.createObjectURL(blob);
      else url = (await pdfPageCanvas(await openPdf(blob), 1, 1200)).toDataURL('image/jpeg', 0.92);
      prevCache.set(meta.id, url);
      backfillThumb(meta, blob);
      return url;
    })().catch(e => { prevP.delete(meta.id); throw e; }));
  }
  return prevP.get(meta.id);
}
// у чертежей без миниатюры или со старой размытой — перегенерируем и тихо сохраняем
async function backfillThumb(meta, blob) {
  if (meta.thumb && meta.thumb.length > 25000 || thumbDone.has(meta.id) || !can('catalog', 2)) return;
  thumbDone.add(meta.id);
  const t = await makeThumb(blob, meta); if (!t) return;
  meta.thumb = t;
  for (const [col, list] of [['parts', S.parts], ['projects', S.projects]]) {
    for (const rec of list) {
      const n = clone(rec); let hit = false;
      if (n.drawing && n.drawing.id === meta.id) { n.drawing.thumb = t; hit = true; }
      (n.files || []).forEach(f => { if (f.id === meta.id) { f.thumb = t; hit = true; } });
      if (hit) { try { await B.save(col, rec.id, n); } catch (e) { } }
    }
  }
}
const frameUrl = new Map();
async function pdfFrame(meta) {
  if (!frameUrl.has(meta.id)) frameUrl.set(meta.id, URL.createObjectURL(await fileBlob(meta)));
  return frameUrl.get(meta.id);
}
const frameHTML = url => `<iframe class="pvframe" src="${url}"></iframe>`;
function previewHTML(meta) {
  reg(meta);
  if (frameUrl.has(meta.id)) return `<div class="pv framed">${frameHTML(frameUrl.get(meta.id))}</div>`;
  const c = prevCache.get(meta.id);
  if (c) return `<div class="pv ready" data-act="view" data-arg="${meta.id}"><img src="${c}" alt="${esc(meta.name)}"></div>`;
  if (!isImg(meta) && !isPdf(meta)) return '';
  return `<div class="pv" data-pv="${meta.id}"><span class="muted">Загружаю чертёж…</span></div>`;
}
function thumbHTML(meta, clickable) {
  if (!meta) return '<span class="thumb none"></span>';
  reg(meta);
  const act = clickable ? ` data-act="view" data-arg="${meta.id}"` : '';
  return meta.thumb ? `<img class="thumb" src="${meta.thumb}" alt=""${act}>` : `<span class="thumb none" data-bf="${meta.id}"${act}>📄</span>`;
}
let bfChain = Promise.resolve();
function hydrate() {
  document.querySelectorAll('[data-bf]:not([data-busy])').forEach(el => {
    el.dataset.busy = '1'; const meta = pvMeta[el.dataset.bf];
    if (!meta || !can('catalog', 2) || thumbDone.has(meta.id)) return;
    bfChain = bfChain.then(async () => {
      try {
        const blob = await fileBlob(meta);
        // Для фото — сразу показываем превью в миниатюре, не ждём backfill
        if (isImg(meta) && el.isConnected && !meta.thumb) {
          const url = URL.createObjectURL(blob);
          const img = document.createElement('img');
          img.className = el.className.replace('none', '').trim() || 'thumb';
          img.src = url;
          if (el.dataset.act) { img.dataset.act = el.dataset.act; img.dataset.arg = el.dataset.arg; }
          el.replaceWith(img);
        }
        await backfillThumb(meta, blob);
        // После генерации — обновляем DOM напрямую, если элемент ещё на месте
        if (meta.thumb && el.isConnected) {
          const img = document.createElement('img');
          img.className = el.className.replace('none', '').trim() || 'thumb';
          img.src = meta.thumb;
          if (el.dataset.act) { img.dataset.act = el.dataset.act; img.dataset.arg = el.dataset.arg; }
          el.replaceWith(img);
        }
      } catch (e) { }
    });
  });
  document.querySelectorAll('[data-pv]:not([data-busy])').forEach(el => {
    el.dataset.busy = '1'; const meta = pvMeta[el.dataset.pv]; if (!meta) return;
    getPreview(meta).then(url => {
      if (!el.isConnected) return;
      el.classList.add('ready'); el.dataset.act = 'view'; el.dataset.arg = meta.id;
      el.innerHTML = `<img src="${url}" alt="${esc(meta.name)}">`;
    }).catch(async e => {
      console.warn('превью чертежа', e);
      if (isPdf(meta)) {
        try { const u = await pdfFrame(meta); if (el.isConnected) { el.classList.add('framed'); el.innerHTML = frameHTML(u); } return; } catch (e2) { e = e2; }
      }
      if (el.isConnected) el.innerHTML = '<span class="muted">Не удалось показать чертёж: ' + esc((e && e.message) || e) + '. Нажмите «В новой вкладке».</span>';
    });
  });
}
function closeViewer() { const v = $('#viewer'); if (v) v.remove(); document.body.classList.remove('noscroll'); }
async function openViewer(id) {
  const meta = pvMeta[id]; if (!meta) return;
  closeViewer();
  const v = document.createElement('div'); v.id = 'viewer';
  v.innerHTML = `<div class="vbar"><b>${esc(meta.name)}</b><span class="grow"></span><button class="x" data-act="openFile" data-arg="${meta.id}">В новой вкладке</button><button class="x primary" data-act="vclose">Закрыть</button></div><div class="vbody"><p class="pad" style="color:#fff">Загружаю…</p></div>`;
  document.body.appendChild(v); document.body.classList.add('noscroll');
  const body = v.querySelector('.vbody');
  try {
    const blob = await fileBlob(meta);
    if (isImg(meta)) {
      const url = prevCache.get(meta.id) || URL.createObjectURL(blob);
      body.innerHTML = `<img src="${url}" alt="">`;
    } else if (isPdf(meta)) {
      let pdf;
      try { pdf = await openPdf(blob); } catch (e0) {
        const u = await pdfFrame(meta); body.innerHTML = `<iframe class="vframe" src="${u}"></iframe>`; return;
      }
      body.innerHTML = '';
      const w = Math.min(1400, window.innerWidth - 16);
      for (let n = 1; n <= Math.min(pdf.numPages, 30); n++) {
        const cv = await pdfPageCanvas(pdf, n, w); if (!v.isConnected) return;
        cv.className = 'vpage'; body.appendChild(cv);
      }
    } else body.innerHTML = '<p class="pad" style="color:#fff">Этот тип файла в приложении не показывается. Нажмите «В новой вкладке».</p>';
  } catch (e) { console.warn(e); if (v.isConnected) body.innerHTML = '<p class="pad" style="color:#fff">Не удалось показать. Нажмите «В новой вкладке».</p>'; }
}
const projThumb = p => {
  const f = (p.files || []).find(x => x.thumb); if (f) return f;
  for (const it of (p.items || [])) { const pt = partById(it.partId); if (pt && pt.drawing && pt.drawing.thumb) return pt.drawing; }
  if ((p.files || [])[0]) return p.files[0];
  for (const it of (p.items || [])) { const pt = partById(it.partId); if (pt && pt.drawing) return pt.drawing; }
  return null;
};

/* ───────── Файлы ───────── */
async function shrinkImage(file) {
  if (!/^image\//.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
    return blob || file;
  } catch (e) { return file; }
}


/* ───────── Покрытия и подсказка о нескольких марках ───────── */
const COATS = [['оксидирование', 'воронение,оксид,окс'], ['анодирование', 'анодир,анод'], ['краска', 'покраска,порошков,эмаль']];
function normCoat(text) {
  return String(text || '').split(/\s*[,;/]\s*/).map(x => x.trim()).filter(Boolean).map(x => {
    const n = nrm(x);
    for (const [name, al] of COATS) if (nrm(name) === n || al.split(',').some(a => n.startsWith(nrm(a)))) return name;
    return x;
  }).filter((x, i, a) => a.indexOf(x) === i).join(', ');
}
function coatOptions(seg) {
  const q = nrm(seg).replace(/ /g, '');
  const hit = COATS.filter(([n, al]) => !q || [n].concat(al.split(',')).some(k => nrm(k).replace(/ /g, '').startsWith(q))).map(c => c[0]);
  return hit;
}
function gradesIn(text) {
  const parts = String(text || '').split(/\s*(?:[,;/]|(?:^|\s)или(?=\s|$))\s*/i).filter(Boolean);
  const ids = []; let first = '';
  for (const p of parts) {
    let g = guessMaterial(p);
    if (!g && first && /^[0-9а-яa-z\-]{2,}$/i.test(p.trim()) && !/^(круг|труба|шестигр|лист|плита|угол)/i.test(p.trim())) g = guessMaterial(first + ' ' + p);
    if (g && !/без марки/.test(g.name) && !ids.includes(g.id)) ids.push(g.id);
    if (!first && /^(сталь|ст)(?=\s|\d|$)/i.test(p.trim())) first = 'сталь';
  }
  return ids;
}

/* ───────── Чтение основной надписи чертежа ───────── */
function parseTitle(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const clean = v => (v || '').replace(/_{2,}/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,;:.\-]+|[\s,;:]+$/g, '');
  const take = (re) => { const m = t.match(re); return m ? clean(m[1]).slice(0, 80) : ''; };
  const stop = '(?=\\s*(?:МАТЕРИАЛ|ЗАГОТОВКА|ДОП\\.?\\s*ОБРАБОТКА|ПОКРЫТИЕ|ПРИМЕЧАНИЕ|S\\s*=|У6|ДЕТАЛЬ|ЛИСТ\\s*:|КОЛ-ВО|Время|АРТ(?=\\s|$)|Н\\.?\\s*контр|Лит\\.|Масса)|\\s*$)';
  const mat = take(new RegExp('МАТЕРИАЛ\\s*:\\s*(.*?)' + stop, 'i'));
  const blank = take(new RegExp('ЗАГОТОВКА\\s*:\\s*(.*?)' + stop, 'i'));
  const dop = take(new RegExp('ДОП\\.?\\s*ОБРАБОТКА\\s*:\\s*(.*?)' + stop, 'i'));
  const cp = take(new RegExp('ПОКРЫТИЕ\\s*:\\s*(.*?)' + stop, 'i'));
  const coat = [dop, cp].filter(Boolean).join(', ');
  return { mat, blank, coat };
}
function blankShape(b) {
  const x = String(b || '').toLowerCase().replace(/[хx×*]/g, 'х').replace(/,/g, '.');
  let m;
  if ((m = x.match(/(?:^|[^а-я])(?:ш|шестигр\S*)\s*(\d+(?:\.\d+)?)/))) return { shape: 'hex', dims: { S: m[1] } };
  if ((m = x.match(/^\s*(?:ш)(\d+)/))) return { shape: 'hex', dims: { S: m[1] } };
  if ((m = x.match(/труб\S*[^\d]*(\d+(?:\.\d+)?)\s*х\s*(\d+(?:\.\d+)?)/))) return { shape: 'tube', dims: { D: m[1], T: m[2] } };
  if ((m = x.match(/круг\S*\s*(\d+(?:\.\d+)?)/))) return { shape: 'round', dims: { D: m[1] } };
  if ((m = x.match(/угол\S*\s*(\d+(?:\.\d+)?)\s*х\s*(\d+(?:\.\d+)?)\s*х\s*(\d+(?:\.\d+)?)/))) return { shape: 'angle', dims: { A: m[1], B: m[2], T: m[3] } };
  if ((m = x.match(/квадрат\S*\s*(\d+(?:\.\d+)?)/))) return { shape: 'square', dims: { A: m[1] } };
  return null;
}
async function readTitleBlock(blob) {
  const pdf = await openPdf(blob); let all = '';
  for (let n = 1; n <= Math.min(pdf.numPages, 3); n++) {
    const pg = await pdf.getPage(n), tc = await pg.getTextContent();
    all += ' ' + tc.items.map(i => i.str).join(' ');
    const r = parseTitle(all); if (r.mat || r.blank) break;
  }
  return parseTitle(all);
}
async function autoFillFromDrawing(blob) {
  try {
    if (!draft || draft.mat === undefined || !isPdf(blob)) return;
    const d0 = draft, r = await readTitleBlock(blob);
    if (draft !== d0 || (!r.mat && !r.blank && !r.coat)) return;
    const got = [];
    if (!String(draft.mat || '').trim() && (r.mat || r.blank)) {
      draft.mat = [r.mat, r.blank].filter(Boolean).join(', '); got.push('материал'); 
      if (draft.calc && !draft.calc.matUser) { const g = guessMaterial(r.mat); if (g) draft.calc.mat = g.id; }
      const sh = draft.calc && blankShape(r.blank);
      if (sh) { draft.calc.shape = sh.shape; draft.calc.dims = Object.assign(defaultDims(sh.shape), sh.dims); got.push('заготовка'); }
    }
    if (!String(draft.coat || '').trim() && r.coat) { draft.coat = normCoat(r.coat); got.push('покрытие'); }
    if (gradesIn(draft.mat).length > 1) got.push('⚠ указано несколько марок — проверьте');
    if (got.length) { toast('Из чертежа подставлено: ' + got.join(', ')); render(); }
  } catch (e) { console.warn('title block', e); }
}
async function attach(input) {
  const file = input.files && input.files[0]; if (!file || !draft) return;
  const kind = input.dataset.file;
  try {
    toast('Загрузка файла…');
    const blob = await shrinkImage(file);
    if (blob.size > 8 * 1024 * 1024) { toast('Файл больше 8 МБ'); input.value = ''; return; }
    const meta = await B.saveFile(blob, file.name.replace(/\.(heic|png|webp|jpe?g)$/i, '') + (blob !== file ? '.jpg' : file.name.match(/\.[^.]+$/) ? file.name.match(/\.[^.]+$/)[0] : ''));
    if (kind === 'drawing') { if (draft.drawing) draft._del.push(draft.drawing.id); draft.drawing = meta; }
    else { draft.files = draft.files || []; draft.files.push(meta); }
    toast('Файл загружен'); render();
    makeThumb(blob, meta).then(t => { if (t) meta.thumb = t; });
    if (kind === 'drawing') autoFillFromDrawing(blob);
  } catch (e) { console.error(e); toast('Не удалось загрузить: ' + (e.message || e)); }
}
async function openFile(id) {
  let w = null; try { w = window.open('', '_blank'); } catch (e) { }
  try {
    const blob = await B.getFile(id); const url = URL.createObjectURL(blob);
    if (w) w.location = url; else location.href = url;
  } catch (e) { if (w) w.close(); toast('Не удалось открыть файл'); }
}

/* ───────── Сохранение ───────── */
const stamp = r => { r.updatedAt = Date.now(); r.updatedBy = S.me.uid; if (!r.createdAt) r.createdAt = r.updatedAt; };
async function cleanupFiles() { for (const id of (draft._del || [])) { try { await B.removeFile(id); } catch (e) { } } }
async function savePart() {
  const p = clone(draft);
  if (!p.name.trim()) { formErr = 'Укажите название'; return render(); }
  p.name = p.name.trim(); p.art = (p.art || '').trim();
  p.setups = (p.setups || []).map(s => { const e = s.time === '' || s.time == null || String(s.time).trim() === ''; const sec = e ? '' : Math.round(parseT(s.time) * 60); return Object.assign({}, s, { timeSec: sec, time: e ? '' : sec / 60 }); });
  p.finishSetups = (p.finishSetups || []).map(s => { const e = s.time === '' || s.time == null || String(s.time).trim() === ''; const sec = e ? '' : Math.round(parseT(s.time) * 60); return Object.assign({}, s, { timeSec: sec, time: e ? '' : sec / 60 }); });
  const del = draft._del; delete p._del; stamp(p);
  const addTo = route().q.get('addTo');
  const id = await B.save('parts', p.id || null, p);
  await cleanupFiles(); void del;
  if (addTo) {
    const pr = S.projects.find(x => x.id === addTo);
    if (pr) { const n = clone(pr); n.items = (n.items || []).concat([{ partId: id, qty: 1 }]); stamp(n); await B.save('projects', addTo, n); }
    draftKey = null; location.hash = '#/project/' + addTo; return;
  }
  toast('Сохранено'); draftKey = null; location.hash = '#/parts';
}
async function saveProject(stay) {
  const p = clone(draft);
  if (!p.name.trim()) { formErr = 'Укажите название'; render(); return null; }
  p.name = p.name.trim(); p.art = (p.art || '').trim();
  p.items = (p.items || []).map(i => ({ partId: i.partId, qty: Math.max(1, Math.round(num(i.qty)) || 1) }));
  delete p._del; stamp(p);
  const id = await B.save('projects', p.id || null, p);
  await cleanupFiles();
  if (!stay) { toast('Сохранено'); draftKey = null; location.hash = '#/projects'; }
  return id;
}

/* ───────── Действия ───────── */
const ACT = {
  async login() {
    const l = $('#lg').value, p = $('#pw').value;
    if (!l || !p) return;
    try { await B.login(l, p); } catch (e) {
      const c = e && e.code || '';
      const m = ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-email'].includes(c) ? 'Неверный логин или пароль'
        : c === 'auth/operation-not-allowed' ? 'В Firebase не включён вход по Email/Password'
        : c === 'auth/network-request-failed' ? 'Нет связи с Firebase (' + c + '). Нажмите «Проверить связь с Google» ниже.'
        : c === 'auth/too-many-requests' ? 'Слишком много попыток, подождите несколько минут'
        : 'Ошибка входа: ' + (c || (e && e.message) || e);
      $('#view').innerHTML = viewLogin(m);
    }
  },
  async diag() {
    const out = $('#diag'); out.textContent = 'Проверяю…';
    const hosts = ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firestore.googleapis.com', 'www.googleapis.com', 'www.gstatic.com', 'firebaseapp.com'];
    const lines = [];
    for (const h of hosts) {
      const t = Date.now();
      try { await Promise.race([fetch('https://' + h + '/', { mode: 'no-cors', cache: 'no-store' }), new Promise((_, rj) => setTimeout(() => rj(new Error('таймаут 10 с')), 10000))]); lines.push('✓ ' + h + ' (' + (Date.now() - t) + ' мс)'); }
      catch (e) { lines.push('✗ ' + h + ' — ' + (e.message || e)); }
      out.textContent = lines.join('\n');
    }
    lines.push('Онлайн: ' + navigator.onLine); out.textContent = lines.join('\n');
  },
  async logout() { S.me = null; await B.logout(); },
  addSetup() { draft.setups.push({ type: '', machine: '', program: '', time: '', note: '' }); render(); },
  delSetup(i) { draft.setups.splice(i, 1); render(); },
  progFromArt(i) { draft.setups[i].program = draft.art || ''; render(); },
  addFinishSetup() { draft.finishSetups = draft.finishSetups || []; draft.finishSetups.push({ type: '', machine: '', program: '', time: '', note: '' }); render(); },
  delFinishSetup(i) { draft.finishSetups.splice(i, 1); render(); },
  addStep() { draft.steps.push(''); render(); },
  delStep(i) { draft.steps.splice(i, 1); render(); },
  moveCoat(i) { const n = normCoat(draft.steps[i]); draft.steps.splice(i, 1); draft.coat = normCoat([draft.coat, n].filter(Boolean).join(', ')); render(); toast('Перенесено в «Покрытие»'); },
  calcToMat() {
    const c = draft.calc, r = calc(c), t = `${r.mat.name}, ${r.shape.name} ${dimsText(c)}`;
    const cur = (draft.mat || '').trim();
    if (cur && cur !== t && !confirm('Заменить текст в поле «Материал»?\n\nСейчас: ' + cur + '\nБудет: ' + t)) return;
    draft.mat = t; render(); toast('Записано в «Материал»');
  },
  savePart, delPart: async () => {
    if (!confirm('Удалить деталь «' + draft.name + '»?')) return;
    const used = S.projects.filter(pr => (pr.items || []).some(i => i.partId === draft.id));
    if (used.length && !confirm('Деталь входит в изделия: ' + used.map(u => u.name).join(', ') + '. Всё равно удалить?')) return;
    for (const f of [draft.drawing].filter(Boolean)) { try { await B.removeFile(f.id); } catch (e) { } }
    await B.remove('parts', draft.id); draftKey = null; location.hash = '#/parts';
  },
  rmFile(key) {
    if (key === 'drawing') { draft._del.push(draft.drawing.id); draft.drawing = null; }
    else { const i = +key.split('.')[1]; draft._del.push(draft.files[i].id); draft.files.splice(i, 1); }
    render();
  },
  openFile(id) { openFile(id); },
  view(id) { openViewer(id); },
  vclose() { closeViewer(); },
  addItem() {
    const v = $('#addPart').value; if (!v) return;
    if (draft.items.some(i => i.partId === v)) return toast('Эта деталь уже в составе');
    draft.items.push({ partId: v, qty: '1' }); render();
  },
  delItem(i) { draft.items.splice(i, 1); render(); },
  async newPartFor() {
    const id = await saveProject(true); if (!id) return;
    draftKey = null; location.hash = '#/part/new?addTo=' + id;
  },
  saveProject: () => saveProject(false),
  delProject: async () => {
    if (!confirm('Удалить изделие «' + draft.name + '»? Детали останутся в каталоге.')) return;
    for (const f of (draft.files || [])) { try { await B.removeFile(f.id); } catch (e) { } }
    await B.remove('projects', draft.id); draftKey = null; location.hash = '#/projects';
  },
  async copyCalc() {
    const t = calcSummary(draft.calc);
    try { await navigator.clipboard.writeText(t); toast('Скопировано'); }
    catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); toast('Скопировано'); } catch (x) { } a.remove(); }
  },
  resetCalc() { calcState = defaultCalc(); draft.calc = calcState; render(); },
  async addUser() {
    const name = $('#nuName').value.trim(), login = $('#nuLogin').value.trim().toLowerCase(), pass = $('#nuPass').value, tpl = $('#nuTpl').value;
    formErr = '';
    if (!name) formErr = 'Укажите имя';
    else if (!/^[a-z0-9._-]{2,30}$/.test(login)) formErr = 'Логин: латиница, цифры, . _ - (от 2 символов)';
    else if (pass.length < 6) formErr = 'Пароль — от 6 символов';
    if (!formErr) {
      try {
        await B.createUser(login, pass, { name, active: true, isAdmin: false, perms: clone((TPL[tpl] || TPL.viewer).perms), createdAt: Date.now() });
        toast('Пользователь создан'); return;
      } catch (e) { formErr = e.code === 'auth/email-already-in-use' ? 'Такой логин уже есть' : e.code === 'auth/weak-password' ? 'Слишком простой пароль' : 'Ошибка: ' + (e.message || e); }
    }
    render();
  },
  async addMachine() { const v = $('#newMachine').value.trim(); if (!v) return; await B.save('machines', null, { name: v }); },
  async seedMachines() { for (const n of SEED_MACHINES) await B.save('machines', null, { name: n }); },
  async delMachine(id) { if (confirm('Удалить станок из списка?')) await B.remove('machines', id); },
  async createLaunch() {
    const projId = $('#lnProj').value, qty = parseInt($('#lnQty').value) || 0;
    const pri = $('#lnPri') ? $('#lnPri').value : 'normal';
    const dlVal = $('#lnDeadline') ? $('#lnDeadline').value : '';
    const deadline = dlVal ? new Date(dlVal).getTime() : '';
    formErr = '';
    if (!projId) formErr = 'Выберите изделие';
    else if (qty < 1) formErr = 'Тираж должен быть ≥ 1';
    if (formErr) { render(); return; }
    const proj = S.projects.find(p => p.id === projId);
    if (!proj) { formErr = 'Изделие не найдено'; render(); return; }
    // проверить дубликат
    const dup = S.launches.find(l => l.projectId === projId && l.status === 'active');
    if (dup && !$('#lnForce')) {
      showModal('Такое изделие уже в работе',
        `<p><b>${esc(proj.art ? proj.art + ' ' : '')}${esc(proj.name)}</b> — активный запуск на <b>${dup.qty} штук</b> (${new Date(dup.created).toLocaleDateString('ru-RU')})</p>`,
        [
          { label: 'Создать отдельный запуск', act: 'launchForce', cls: 'primary' },
          { label: 'Объединить (+' + qty + ' шт к существующему)', act: 'launchMerge', arg: dup.id },
          { label: 'Отмена', act: 'modalClose' }
        ]);
      return;
    }
    await doCreateLaunch(projId, proj, qty, pri, deadline);
  },
  async launchForce() {
    closeModal();
    const projId = $('#lnProj').value, qty = parseInt($('#lnQty').value) || 0;
    const pri = $('#lnPri') ? $('#lnPri').value : 'normal';
    const dlVal = $('#lnDeadline') ? $('#lnDeadline').value : '';
    const deadline = dlVal ? new Date(dlVal).getTime() : '';
    const proj = S.projects.find(p => p.id === projId);
    if (!proj) return;
    await doCreateLaunch(projId, proj, qty, pri, deadline);
  },
  async launchMerge(dupId) {
    closeModal();
    const qty = parseInt($('#lnQty').value) || 0;
    const dup = S.launches.find(l => l.id === dupId);
    if (!dup) return;
    const d = clone(dup);
    const oldQty = d.qty;
    d.qty = oldQty + qty;
    d.items = (d.items || []).map(it => {
      const newTotal = it.qtyPer * d.qty;
      return Object.assign({}, it, { qtyTotal: newTotal });
    });
    await B.save('launches', dupId, d);
    toast('Объединено: ' + oldQty + ' + ' + qty + ' = ' + d.qty + ' шт');
    location.hash = '#/launch/' + dupId;
  },
  modalClose() { closeModal(); },
  setSort(s) {
    const r = route();
    const tab = r.seg[0] === 'done' ? 'done' : 'active';
    const st = sortState[tab];
    if (st.key === s) { st.dir *= -1; }
    else { st.key = s; st.dir = (s === 'date' || s === 'finished') ? -1 : 1; }
    render();
  },
  setCatSort(arg) {
    const [cat, key] = arg.split(':');
    const st = catSort[cat];
    if (!st) return;
    if (st.key === key) { st.dir *= -1; }
    else { st.key = key; st.dir = (key === 'date') ? -1 : 1; }
    render();
  },
  toggleView(section) {
    viewMode[section] = viewMode[section] === 'full' ? 'compact' : 'full';
    expandedCards.clear();
    render();
  },
  toggleExpand(id) {
    if (expandedCards.has(id)) expandedCards.delete(id); else expandedCards.add(id);
    render();
  },
  async finishLaunch(id) {
    if (!confirm('Завершить запуск? Он переедет в «Готовые».')) return;
    const l = S.launches.find(x => x.id === id); if (!l) return;
    const d = clone(l); d.status = 'done'; d.finished = Date.now();
    await B.save('launches', id, d); toast('Запуск завершён');
  },
  async reopenLaunch(id) {
    const l = S.launches.find(x => x.id === id); if (!l) return;
    const d = clone(l); d.status = 'active'; delete d.finished;
    await B.save('launches', id, d); toast('Запуск возвращён в работу');
  },
  async submitReport() {
    const inputs = document.querySelectorAll('.rp-done');
    const entries = [];
    inputs.forEach(inp => {
      const v = parseInt(inp.value) || 0;
      if (v <= 0) return;
      entries.push({ partId: inp.dataset.pi, stageKey: inp.dataset.sk, done: v, launchId: inp.dataset.li });
    });
    if (!entries.length) { toast('Нечего сохранять'); return; }
    // группируем по запуску
    const byLaunch = {};
    entries.forEach(e => { (byLaunch[e.launchId] = byLaunch[e.launchId] || []).push(e); });
    for (const [lid, ents] of Object.entries(byLaunch)) {
      const data = { launchId: lid, date: new Date().toISOString().slice(0, 10), userId: S.me.uid, userName: S.me.name || S.me.login, created: Date.now(), entries: ents };
      await B.save('reports', null, data);
    }
    toast('Отчёт сохранён'); render();
  },
  async submitLocksmith() {
    const inputs = document.querySelectorAll('.lk-done');
    const entries = [];
    inputs.forEach(inp => {
      const v = parseInt(inp.value) || 0;
      if (v <= 0) return;
      entries.push({ partId: inp.dataset.pi, stageKey: inp.dataset.sk, done: v, launchId: inp.dataset.li });
    });
    if (!entries.length) { toast('Нечего сохранять'); return; }
    const byLaunch = {};
    entries.forEach(e => { (byLaunch[e.launchId] = byLaunch[e.launchId] || []).push(e); });
    for (const [lid, ents] of Object.entries(byLaunch)) {
      const data = { launchId: lid, date: new Date().toISOString().slice(0, 10), userId: S.me.uid, userName: S.me.name || S.me.login, created: Date.now(), entries: ents };
      await B.save('reports', null, data);
    }
    toast('Сохранено'); render();
  }
};

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const f = ACT[t.dataset.act]; if (!f) return;
  e.preventDefault();
  const arg = t.dataset.arg;
  Promise.resolve(f(arg != null && /^\d+$/.test(arg) ? +arg : arg)).catch(err => { console.error(err); toast('Ошибка: ' + (err.message || err)); });
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { listQuery = t.value; const pos = t.selectionStart; render(); const q = $('#q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } return; }
  if (t.classList && t.classList.contains('tmask')) { const d = t.value.replace(/\D/g, '').slice(-6); t.value = /[1-9]/.test(d) ? maskT(d) : ''; }
  const p = t.dataset && t.dataset.bind; if (!p || !draft) return;
  setPath(draft, p, t.type === 'checkbox' ? t.checked : t.value);
  if (p === 'calc.len') draft.calc.lenSet = true;
  if (p.startsWith('calc.')) refreshCalc();
  if (p === 'mat' && draft.calc && !draft.calc.matUser) {
    const g = guessMaterial(draft.mat);
    if (g && g.id !== draft.calc.mat) { draft.calc.mat = g.id; const ci = document.querySelector('.cb-in'); if (ci) ci.value = g.name; refreshCalc(); }
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.file) return attach(t);
  if (t.dataset.bind && /^setups\.\d+\.machine$/.test(t.dataset.bind) && draft) {
    const i = +t.dataset.bind.split('.')[1], st = draft.setups[i], m = S.machines.find(x => x.id === t.value);
    if (st && m && !st.type) { const g = guessType(m.name); if (g) { st.type = g; render(); return; } }
  }
  if (t.dataset.bind && /^finishSetups\.\d+\.machine$/.test(t.dataset.bind) && draft) {
    const i = +t.dataset.bind.split('.')[1], st = (draft.finishSetups || [])[i], m = S.machines.find(x => x.id === t.value);
    if (st && m && !st.type) { const g = guessType(m.name); if (g) { st.type = g; render(); return; } }
  }
  if ((t.dataset.bind === 'bought' || t.dataset.bind === 'notePri' || t.dataset.bind === 'harden') && draft) { render(); return; }
  if (t.dataset.bind === 'calc.shape' && draft) { draft.calc.dims = defaultDims(t.value); render(); return; }
  if (t.dataset.bind && t.dataset.bind.startsWith('steps.') && draft && isCoatName(t.value)) { render(); return; }
  if (t.id === 'lnProj') {
    const el = $('#lnPreview'); if (!el) return;
    const proj = S.projects.find(p => p.id === t.value);
    if (!proj) { el.innerHTML = ''; return; }
    el.innerHTML = '<b>Детали в составе:</b>' + (proj.items || []).map(it => {
      const pt = partById(it.partId); return `<div class="s">${pt ? (pt.art ? esc(pt.art) + ' ' : '') + esc(pt.name) : 'удалена'} × ${it.qty}</div>`;
    }).join('');
    return;
  }
  if (t.dataset.u) return userChange(t);
  if (t.dataset.m) { const m = S.machines.find(x => x.id === t.dataset.m); if (m && t.value.trim()) B.save('machines', m.id, { name: t.value.trim() }); }
});
async function userChange(t) {
  const u = S.users.find(x => x.id === t.dataset.u); if (!u) return;
  const n = clone(u); delete n.id; n.perms = n.perms || {};
  const f = t.dataset.f;
  if (f === 'active' || f === 'isAdmin') n[f] = t.checked;
  else if (f === 'name') n.name = t.value.trim() || u.name;
  else if (f === 'tpl') { if (!TPL[t.value]) return; n.perms = clone(TPL[t.value].perms); }
  else if (f.startsWith('perms.')) n.perms[f.slice(6)] = +t.value;
  await B.save('users', u.id, n); toast('Сохранено');
}
window.addEventListener('hashchange', () => { listQuery = ''; render(); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'lg' || e.target.id === 'pw')) ACT.login(); });

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeViewer(); });

/* ───────── Выбор материала вводом первых букв ───────── */
function cbShow(box, q) {
  const list = box.querySelector('.cb-list'), items = findMaterials(q), nq = nrm(q);
  let h = items.map(m => `<div class="cb-opt" data-id="${m.id}"><span>${esc(m.name)}</span><small>${m.d} г/см³</small></div>`).join('');
  if (q.trim() && !items.some(m => nrm(m.name) === nq)) h += `<div class="cb-opt cb-custom" data-id="custom" data-name="${esc(q.trim())}"><span>Свой материал: «${esc(q.trim())}»</span><small>указать плотность</small></div>`;
  list.innerHTML = h || '<div class="cb-empty">Ничего не найдено</div>'; list.hidden = false;
}
function cbPick(box, opt) {
  if (!opt || !draft || !draft.calc) return;
  draft.calc.matUser = true;
  if (opt.dataset.id === 'custom') { draft.calc.mat = 'custom'; draft.calc.matName = opt.dataset.name; if (draft.calc.density == null) draft.calc.density = ''; render(); return; }
  draft.calc.mat = opt.dataset.id;
  box.querySelector('.cb-in').value = matOf(draft.calc).name; box.querySelector('.cb-list').hidden = true; refreshCalc();
}
document.addEventListener('focusin', e => { const t = e.target; if (t.classList && t.classList.contains('cb-in')) { t.select(); cbShow(t.closest('.cb'), ''); } });
document.addEventListener('input', e => { const t = e.target; if (t.classList && t.classList.contains('cb-in')) cbShow(t.closest('.cb'), t.value); });
document.addEventListener('mousedown', e => { const o = e.target.closest('.cb-opt'); if (o && !o.dataset.coat) { e.preventDefault(); cbPick(o.closest('.cb'), o); } });
document.addEventListener('focusout', e => {
  const t = e.target; if (!t.classList || !t.classList.contains('cb-in')) return;
  setTimeout(() => { const box = t.closest('.cb'); if (!box) return; box.querySelector('.cb-list').hidden = true; if (draft && draft.calc) t.value = matOf(draft.calc).name; }, 120);
});
document.addEventListener('keydown', e => {
  const t = e.target; if (!t.classList || !t.classList.contains('cb-in')) return;
  const box = t.closest('.cb'), list = box.querySelector('.cb-list'), opts = [...list.querySelectorAll('.cb-opt')];
  let i = opts.findIndex(o => o.classList.contains('on'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if (list.hidden) cbShow(box, t.value);
    const os = [...list.querySelectorAll('.cb-opt')]; if (!os.length) return;
    i = e.key === 'ArrowDown' ? Math.min(os.length - 1, i + 1) : Math.max(0, i - 1);
    os.forEach(o => o.classList.remove('on')); os[i].classList.add('on'); os[i].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') { e.preventDefault(); cbPick(box, opts[i >= 0 ? i : 0]); }
  else if (e.key === 'Escape') { list.hidden = true; }
});
document.addEventListener('click', e => { const im = e.target.closest('#viewer .vbody img'); if (im) im.classList.toggle('full'); });


/* ───────── Покрытие: подсказки по первым буквам ───────── */
function csShow(inp) {
  if (!inp.parentElement) return;
  const list = inp.parentElement.querySelector('.cb-list'); if (!list) return;
  const i = inp.value.lastIndexOf(','), seg = inp.value.slice(i + 1).trim();
  const have = inp.value.slice(0, i + 1).split(',').map(x => x.trim());
  const opts = coatOptions(seg).filter(n => !have.includes(n));
  list.innerHTML = opts.map(n => `<div class="cb-opt" data-coat="${esc(n)}"><span>${esc(n)}</span></div>`).join('');
  list.hidden = !opts.length;
}
function csPick(inp, name) {
  const i = inp.value.lastIndexOf(','), head = i >= 0 ? inp.value.slice(0, i).trim() : '';
  inp.value = (head ? head + ', ' : '') + name;
  if (draft) draft.coat = inp.value;
  inp.parentElement.querySelector('.cb-list').hidden = true;
}
document.addEventListener('focusin', e => { const t = e.target; if (t.classList && t.classList.contains('cs-in')) csShow(t); });
document.addEventListener('input', e => { const t = e.target; if (t.classList && t.classList.contains('cs-in')) csShow(t); });
document.addEventListener('mousedown', e => { const o = e.target.closest && e.target.closest('[data-coat]'); if (o) { e.preventDefault(); csPick(o.closest('.cs').querySelector('.cs-in'), o.dataset.coat); } });
document.addEventListener('focusout', e => { const t = e.target; if (!t.classList || !t.classList.contains('cs-in')) return; setTimeout(() => { const l = t.parentElement && t.parentElement.querySelector('.cb-list'); if (l) l.hidden = true; if (draft) { const n = normCoat(t.value); if (n !== t.value) { t.value = n; draft.coat = n; } } }, 120); });
document.addEventListener('keydown', e => {
  const t = e.target; if (!t.classList || !t.classList.contains('cs-in') || e.key !== 'Enter') return;
  e.preventDefault(); const o = t.parentElement.querySelector('[data-coat]'); if (o) csPick(t, o.dataset.coat);
});

/* ───────── Запуск ───────── */
let unsubs = [];
function startWatch() {
  stopWatch();
  const w = (col, key, need) => {
    if (!need) { S[key] = []; S.ready[key] = true; return; }
    unsubs.push(B.watch(col, rows => { S[key] = rows; S.ready[key] = true; if (key === 'machines') fixMachineNames(rows); if (draft && draftKey === location.hash && key !== 'machines') return; render(); }, () => { S[key] = []; S.ready[key] = true; render(); }));
  };
  w('users', 'users', true); w('machines', 'machines', true);
  w('parts', 'parts', can('catalog', 1)); w('projects', 'projects', can('catalog', 1));
  w('launches', 'launches', can('launches', 1)); w('reports', 'reports', true);
}
function fixMachineNames(rows) {
  rows.forEach(m => { if (/nex[us]{1,2}\s?55/i.test(m.name) && m.name !== 'Metalltec Nexus 55' && !m._fx) { m._fx = 1; Promise.resolve(B.save('machines', m.id, { name: 'Metalltec Nexus 55' })).catch(() => {}); } });
}
function stopWatch() { unsubs.forEach(u => u()); unsubs = []; S.users = S.machines = S.parts = S.projects = S.launches = S.reports = []; S.ready = {}; }
B.onAuth(u => {
  const was = S.me && S.me.uid;
  S.me = u;
  if (u && !u.missing && !u.error && u.active !== false) { if (was !== u.uid || !unsubs.length) startWatch(); }
  else stopWatch();
  draft = null; draftKey = null; render();
});
S.me = undefined;
})();
