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

const S = { me: null, users: [], machines: [], parts: [], projects: [], ready: {}, denied: {} };
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
function route() { const h = location.hash.replace(/^#\/?/, ''); const [path, qs] = h.split('?'); return { seg: path.split('/').filter(Boolean), q: new URLSearchParams(qs || '') }; }
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru');
const partById = id => S.parts.find(p => p.id === id);
const machineName = id => { const m = S.machines.find(x => x.id === id); return m ? m.name : ''; };

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
  const items = S.parts.filter(p => !q || (p.art + ' ' + p.name + ' ' + p.mat).toLowerCase().includes(q)).sort(byName);
  return `<h1>Детали</h1>${listBar('Поиск по артикулу, названию, материалу', '#/part/new', can('catalog', 2), '+ Деталь')}
    <div class="list">${items.map(p => `<a class="item hasth" href="#/part/${p.id}">${thumbHTML(p.drawing)}<div class="tx"><div class="t">${p.art ? `<span class="art">${esc(p.art)}</span>` : ''}${esc(p.name)}</div>
      ${partLines(p)}</div></a>`).join('') || '<p class="muted">Деталей пока нет.</p>'}</div>`;
}
function viewProjects() {
  const q = listQuery.toLowerCase();
  const items = S.projects.filter(p => !q || (p.art + ' ' + p.name).toLowerCase().includes(q)).sort(byName);
  return `<h1>Изделия</h1>${listBar('Поиск по названию, артикулу', '#/project/new', can('catalog', 2), '+ Изделие')}
    <div class="list">${items.map(p => `<a class="item hasth" href="#/project/${p.id}">${thumbHTML(projThumb(p))}<div class="tx"><div class="t">${p.art ? `<span class="art">${esc(p.art)}</span>` : ''}${esc(p.name)}</div>
      <div class="s">деталей в составе: ${(p.items || []).length}${(p.files || []).length ? ' · чертежей сборки: ' + p.files.length : ''}</div>
      ${(() => { const hn = (p.items || []).map(i => { const pt = partById(i.partId); return pt && pt.notePri === 'high' && String(pt.note || '').trim() ? pt : null; }).filter(Boolean); return hn.length ? hn.map(pt => `<div class="s s-high">⚠ ${esc(pt.art || pt.name)}: ${clip(String(pt.note).replace(/\s+/g, ' ').trim(), 100)}</div>`).join('') : ''; })()}</div></a>`).join('') || '<p class="muted">Изделий пока нет.</p>'}</div>`;
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
  const st = p.setups || [];
  if (!st.length) return 'сетапов на станках: нет';
  const tm = x => { const t = String(x == null ? '' : x).trim(); if (!t) return 'время не указано'; const sec = Math.round((typeof x === 'number' ? x : parseT(t)) * 60); return 'тайм ' + hms(sec); };
  return 'сетапов на станках: ' + st.length + st.map((u, i) => ` · сетап ${i + 1}${u.type ? ' (' + esc(u.type) + ')' : ''} — ${tm(u.time)}`).join('');
}
function partLines(p) {
  const w = partWork(p), bits = [];
  let m = esc(p.mat || 'материал не указан');
  if (p.calc && !p.bought) { const r = calc(p.calc); if (r.pieceLen > 0) m += ` · длина заготовки ${fmt(r.pieceLen, 0)} мм`; }
  if (p.bought) m = 'покупная заготовка: ' + m;
  return `<div class="s">${m}</div>
    <div class="s">${setupsLine(p)}${p.drawing ? '' : ' · нет чертежа'}</div>
    ${p.harden ? `<div class="s">закалка: ${esc(p.hardenType || 'тип не указан')}${p.hardenHRC ? ', ' + esc(p.hardenHRC) + ' HRC' : ''}${p.hardenAllowance ? ' · с припуском' : ''}</div>` : ''}
    <div class="s">${w.work.length ? 'слесарка (' + w.work.length + '): ' + clip(w.work.join(' → '), 110) : 'слесарка: не указана'}</div>`
    + (w.coats.length ? `<div class="s">покрытие: ${esc(w.coats.join(', '))}</div>` : '')
    + (String(p.note || '').trim() ? `<div class="s${p.notePri === 'high' ? ' s-high' : ''}">${p.notePri === 'high' ? '⚠ ' : ''}примечание: ${clip(String(p.note).replace(/\s+/g, ' ').trim(), 140)}</div>` : '');
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
  ['progress', 'В работе', () => true], ['done', 'Готовые', () => true], ['calc', 'Калькулятор', () => true], ['team', 'Команда', () => S.me && S.me.isAdmin]];
function render() { renderMain(); setTimeout(hydrate, 0); }
function renderMain() {
  const top = $('#top'), view = $('#view');
  if (S.me === undefined) return;
  if (!S.me) { top.hidden = true; if (!$('#lg')) view.innerHTML = viewLogin(); return; }
  if (S.me.missing || S.me.error || S.me.active === false) { top.hidden = true; view.innerHTML = viewNoProfile(); return; }
  top.hidden = false; $('#whoName').textContent = (S.me.name || S.me.login) + ' · ' + VER;
  const r = route(); const sec = r.seg[0] || (can('catalog', 1) ? 'projects' : 'progress');
  $('#nav').innerHTML = NAV.filter(n => n[2]()).map(n => `<a href="#/${n[0]}" class="${n[0] === sec || (sec === 'part' && n[0] === 'parts') || (sec === 'project' && n[0] === 'projects') ? 'on' : ''}">${n[1]}</a>`).join('');
  const key = location.hash || '#/';
  const needCat = ['projects', 'parts', 'part', 'project'].includes(sec);
  if (needCat && !can('catalog', 1)) { view.innerHTML = viewStub('Нет доступа', 'У вас нет доступа к каталогу.'); return; }
  if (sec === 'part' || sec === 'project') {
    const isPart = sec === 'part', id = r.seg[1];
    if (draftKey !== key) {
      let rec;
      if (id === 'new') rec = isPart ? { art: '', name: '', mat: '', note: '', calc: Object.assign(defaultCalc(), { qty: '1', spare: '0' }), setups: [], steps: [], drawing: null }
        : { art: '', name: '', note: '', items: [], files: [] };
      else { const src = isPart ? S.parts : S.projects; const f = src.find(x => x.id === id); if (!f) { view.innerHTML = S.ready[isPart ? 'parts' : 'projects'] ? viewStub('Не найдено', 'Такой записи нет.') : '<p class="muted pad">Загрузка…</p>'; return; } rec = clone(f); if (isPart) { rec.calc = rec.calc || defaultCalc(); rec.setups = rec.setups || []; rec.steps = rec.steps || []; } else { rec.items = rec.items || []; rec.files = rec.files || []; } }
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
  else if (sec === 'progress') view.innerHTML = viewStub('В работе', 'Запуски и прогресс по деталям появятся в следующей части.');
  else if (sec === 'done') view.innerHTML = viewStub('Готовые', 'Завершённые запуски с хронометражем появятся в следующей части.');
  else view.innerHTML = viewStub('Не найдено', 'Такой страницы нет.');
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
    bfChain = bfChain.then(async () => { try { await backfillThumb(meta, await fileBlob(meta)); } catch (e) { } });
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
  async delMachine(id) { if (confirm('Удалить станок из списка?')) await B.remove('machines', id); }
};

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const f = ACT[t.dataset.act]; if (!f) return;
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
  if ((t.dataset.bind === 'bought' || t.dataset.bind === 'notePri' || t.dataset.bind === 'harden') && draft) { render(); return; }
  if (t.dataset.bind === 'calc.shape' && draft) { draft.calc.dims = defaultDims(t.value); render(); return; }
  if (t.dataset.bind && t.dataset.bind.startsWith('steps.') && draft && isCoatName(t.value)) { render(); return; }
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
}
function fixMachineNames(rows) {
  rows.forEach(m => { if (/nex[us]{1,2}\s?55/i.test(m.name) && m.name !== 'Metalltec Nexus 55' && !m._fx) { m._fx = 1; Promise.resolve(B.save('machines', m.id, { name: 'Metalltec Nexus 55' })).catch(() => {}); } });
}
function stopWatch() { unsubs.forEach(u => u()); unsubs = []; S.users = S.machines = S.parts = S.projects = []; S.ready = {}; }
B.onAuth(u => {
  const was = S.me && S.me.uid;
  S.me = u;
  if (u && !u.missing && !u.error && u.active !== false) { if (was !== u.uid || !unsubs.length) startWatch(); }
  else stopWatch();
  draft = null; draftKey = null; render();
});
S.me = undefined;
})();
