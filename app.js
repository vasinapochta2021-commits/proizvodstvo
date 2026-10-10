(function () {
'use strict';
const B = window.Backend;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
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
const SEED_MACHINES = ['Metalltec TC45', 'Metalltec Nexsus 55 (приводной инструмент, ось C)', 'Metalltec CK-36',
  'Китайский токарный станок', 'Фрезерный станок ЧПУ', 'Токарный 16К20', 'Токарный ИЖ',
  'Фрезерный универсальный (малый)', 'Фрезерный универсальный (большой)'];

const S = { me: null, users: [], machines: [], parts: [], projects: [], ready: {}, denied: {} };
function can(b, l) { const m = S.me; if (!m) return false; if (m.isAdmin) return true; return ((m.perms || {})[b] || 0) >= l; }

/* ───────── Калькулятор материала ───────── */
const MATERIALS = [
  { id: 'steel', name: 'Сталь (конструкционная)', d: 7.85 }, { id: 'inox', name: 'Нержавеющая сталь', d: 7.9 },
  { id: 'alu', name: 'Алюминий', d: 2.7 }, { id: 'dural', name: 'Дюраль (Д16)', d: 2.78 },
  { id: 'brass', name: 'Латунь', d: 8.5 }, { id: 'bronze', name: 'Бронза', d: 8.8 },
  { id: 'copper', name: 'Медь', d: 8.94 }, { id: 'ti', name: 'Титан', d: 4.5 },
  { id: 'caprolon', name: 'Капролон', d: 1.15 }, { id: 'pom', name: 'Полиацеталь (POM)', d: 1.41 },
  { id: 'ptfe', name: 'Фторопласт (PTFE)', d: 2.2 }, { id: 'zedex', name: 'Зедекс', d: 1.3 }
];
const SHAPES = {
  round: { name: 'Круг', dims: [['D', 'Диаметр D, мм', 30]], area: v => Math.PI * v.D * v.D / 4 },
  square: { name: 'Квадрат', dims: [['A', 'Сторона A, мм', 30]], area: v => v.A * v.A },
  hex: { name: 'Шестигранник', dims: [['S', 'Под ключ S, мм', 27]], area: v => v.S * v.S * Math.sqrt(3) / 2 },
  tube: { name: 'Труба', dims: [['D', 'Наружный D, мм', 40], ['T', 'Стенка T, мм', 5]], area: v => Math.PI / 4 * (v.D * v.D - Math.pow(v.D - 2 * v.T, 2)) },
  strip: { name: 'Полоса / лист', dims: [['W', 'Ширина W, мм', 50], ['T', 'Толщина T, мм', 10]], area: v => v.W * v.T },
  profile: { name: 'Профильная труба', dims: [['A', 'Сторона A, мм', 40], ['B', 'Сторона B, мм', 40], ['T', 'Стенка T, мм', 3]], area: v => v.A * v.B - (v.A - 2 * v.T) * (v.B - 2 * v.T) }
};
function defaultDims(shape) { const o = {}; SHAPES[shape].dims.forEach(([k, , d]) => o[k] = String(d)); return o; }
function defaultCalc() { return { mat: 'steel', shape: 'round', dims: defaultDims('round'), qty: '1', spare: '0', len: '100', kerf: '3', face: '1', tail: '0', bar: '' }; }
function calc(c) {
  const sh = SHAPES[c.shape] || SHAPES.round, dv = {};
  sh.dims.forEach(([k]) => dv[k] = num((c.dims || {})[k]));
  const area = Math.max(0, sh.area(dv));
  const m = MATERIALS.find(x => x.id === c.mat) || MATERIALS[0];
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
      <div class="muted">длина заготовки на 1 деталь (деталь + рез + торцовка) и её масса; ${fmt(r.kgPerM, 3)} кг/м</div>`;
  }
  let h = `<div class="big">${fmt(r.massKg, 2)} кг · ${fmt(r.totalMm / 1000, 3)} м</div><dl>
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
      <label>Материал<select data-bind="calc.mat">${MATERIALS.map(m => `<option value="${m.id}"${m.id === c.mat ? ' selected' : ''}>${esc(m.name)} · ${m.d}</option>`).join('')}</select></label>
      <label>Сечение<select data-bind="calc.shape" data-re="1">${Object.keys(SHAPES).map(k => `<option value="${k}"${k === c.shape ? ' selected' : ''}>${SHAPES[k].name}</option>`).join('')}</select></label>
    </div>
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
      <div class="s">${esc(p.mat || 'материал не указан')} · установов: ${(p.setups || []).length}${p.drawing ? '' : ' · нет чертежа'}</div></div></a>`).join('') || '<p class="muted">Деталей пока нет.</p>'}</div>`;
}
function viewProjects() {
  const q = listQuery.toLowerCase();
  const items = S.projects.filter(p => !q || (p.art + ' ' + p.name).toLowerCase().includes(q)).sort(byName);
  return `<h1>Изделия</h1>${listBar('Поиск по названию, артикулу', '#/project/new', can('catalog', 2), '+ Изделие')}
    <div class="list">${items.map(p => `<a class="item hasth" href="#/project/${p.id}">${thumbHTML(projThumb(p))}<div class="tx"><div class="t">${p.art ? `<span class="art">${esc(p.art)}</span>` : ''}${esc(p.name)}</div>
      <div class="s">деталей в составе: ${(p.items || []).length}${(p.files || []).length ? ' · чертежей сборки: ' + p.files.length : ''}</div></div></a>`).join('') || '<p class="muted">Изделий пока нет.</p>'}</div>`;
}
function fileBlock(meta, key, dis) {
  if (!meta) return '<div class="file"><span class="muted">нет файла</span></div>';
  return previewHTML(meta) + `<div class="file"><span>📎 ${esc(meta.name)}</span><button class="x" data-act="openFile" data-arg="${meta.id}">В новой вкладке</button>${dis ? '' : `<button class="x danger" data-act="rmFile" data-arg="${key}">Убрать</button>`}</div>`;
}
function viewPart() {
  const p = draft, dis = can('catalog', 2) ? '' : 'disabled';
  const used = S.projects.filter(pr => (pr.items || []).some(i => i.partId === p.id));
  const machines = S.machines.slice().sort(byName);
  return `<a class="back" href="#/parts">← Детали</a><h1>${p.id ? 'Деталь' : 'Новая деталь'}</h1>
  <div class="card">
    <div class="row"><label>Артикул<input data-bind="art" value="${esc(p.art)}" ${dis}></label>
    <label>Название<input data-bind="name" value="${esc(p.name)}" ${dis}></label></div>
    <label>Материал (как писать в наряде)<input data-bind="mat" value="${esc(p.mat)}" placeholder="Сталь 40, круг Ø30" ${dis}></label>
    <label>Заметка<textarea data-bind="note" ${dis}>${esc(p.note)}</textarea></label>
  </div>
  <div class="card"><h2>Чертёж</h2>${fileBlock(p.drawing, 'drawing', dis)}
    ${dis ? '' : '<input type="file" data-file="drawing" accept="application/pdf,image/*">'}
    <p class="muted">PDF или фото, до 8 МБ. STEP/DXF добавим позже.</p></div>
  <div class="card"><h2>Расчёт заготовки</h2>${calcHTML(p.calc, true)}
    ${dis ? '' : '<button data-act="calcToMat">Записать в «Материал»</button>'}</div>
  <div class="card"><h2>Установы</h2>
    ${(p.setups || []).map((s, i) => `<div class="setup">
      <label>Станок<select data-bind="setups.${i}.machine" ${dis}><option value="">—</option>${machines.map(m => `<option value="${m.id}"${m.id === s.machine ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <div class="pg"><label>Программа<input data-bind="setups.${i}.program" value="${esc(s.program)}" ${dis}></label>${dis ? '' : `<button class="x" title="Вставить артикул" data-act="progFromArt" data-arg="${i}">= арт.</button>`}</div>
      <label>Время, мин<input inputmode="decimal" data-bind="setups.${i}.time" value="${esc(s.time)}" ${dis}></label>
      <label>Заметка<input data-bind="setups.${i}.note" value="${esc(s.note)}" ${dis}></label>
      ${dis ? '' : `<button class="x danger" data-act="delSetup" data-arg="${i}">✕</button>`}</div>`).join('') || '<p class="muted">Установов нет.</p>'}
    ${dis ? '' : '<button data-act="addSetup">+ Установ</button>'}
    <p class="muted">Время на одну деталь по машинному таймеру. Изменили режимы — поправьте здесь, прошлые цифры пересчитаются.</p></div>
  <div class="card"><h2>Слесарные операции</h2>
    ${(p.steps || []).map((s, i) => `<div class="step"><label>Операция ${i + 1}<input data-bind="steps.${i}" value="${esc(s)}" ${dis}></label>${dis ? '' : `<button class="x danger" data-act="delStep" data-arg="${i}">✕</button>`}</div>`).join('') || '<p class="muted">Нет.</p>'}
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
      <div class="pi">${pt ? thumbHTML(pt.drawing, !!pt.drawing) : ''}<div>${pt ? `<a href="#/part/${pt.id}">${pt.art ? `<span class="art">${esc(pt.art)}</span>` : ''}${esc(pt.name)}</a>` : '<span class="muted">деталь удалена</span>'}</div></div>
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
  top.hidden = false; $('#whoName').textContent = S.me.name || S.me.login;
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
const PDFJS = ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/'];
let pdfjsP = null;
function loadPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsP) return pdfjsP;
  pdfjsP = (async () => {
    for (const base of PDFJS) {
      try {
        await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = base + 'pdf.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('load')); setTimeout(() => rej(new Error('таймаут')), 8000); document.head.appendChild(sc); });
        if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; return window.pdfjsLib; }
      } catch (e) { }
    }
    pdfjsP = null; throw new Error('pdf.js недоступен');
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
    else if (isPdf(meta)) { src = await pdfPageCanvas(await openPdf(blob), 1, 260); w = src.width; h = src.height; }
    else return null;
    const k = Math.min(1, 240 / Math.max(w, h)), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(src, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.6);
  } catch (e) { return null; }
}
function getPreview(meta) {
  if (!prevP.has(meta.id)) {
    prevP.set(meta.id, (async () => {
      const blob = await fileBlob(meta); let url;
      if (isImg(meta)) url = URL.createObjectURL(blob);
      else url = (await pdfPageCanvas(await openPdf(blob), 1, 1000)).toDataURL('image/jpeg', 0.85);
      prevCache.set(meta.id, url);
      backfillThumb(meta, blob);
      return url;
    })().catch(e => { prevP.delete(meta.id); throw e; }));
  }
  return prevP.get(meta.id);
}
// у чертежей, загруженных раньше, миниатюры нет — дорисовываем и тихо сохраняем
async function backfillThumb(meta, blob) {
  if (meta.thumb || thumbDone.has(meta.id) || !can('catalog', 2)) return;
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
function previewHTML(meta) {
  reg(meta);
  const c = prevCache.get(meta.id);
  if (c) return `<div class="pv ready" data-act="view" data-arg="${meta.id}"><img src="${c}" alt="${esc(meta.name)}"></div>`;
  if (!isImg(meta) && !isPdf(meta)) return '';
  return `<div class="pv" data-pv="${meta.id}"><span class="muted">Загружаю чертёж…</span></div>`;
}
function thumbHTML(meta, clickable) {
  if (!meta) return '<span class="thumb none"></span>';
  reg(meta);
  const act = clickable ? ` data-act="view" data-arg="${meta.id}"` : '';
  return meta.thumb ? `<img class="thumb" src="${meta.thumb}" alt=""${act}>` : `<span class="thumb none"${act}>📄</span>`;
}
function hydrate() {
  document.querySelectorAll('[data-pv]:not([data-busy])').forEach(el => {
    el.dataset.busy = '1'; const meta = pvMeta[el.dataset.pv]; if (!meta) return;
    getPreview(meta).then(url => {
      if (!el.isConnected) return;
      el.classList.add('ready'); el.dataset.act = 'view'; el.dataset.arg = meta.id;
      el.innerHTML = `<img src="${url}" alt="${esc(meta.name)}">`;
    }).catch(e => {
      console.warn('превью чертежа', e);
      if (el.isConnected) el.innerHTML = '<span class="muted">Не удалось показать чертёж на странице. Нажмите «В новой вкладке».</span>';
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
      const pdf = await openPdf(blob); body.innerHTML = '';
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
  return (p.files || [])[0] || null;
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
  p.setups = (p.setups || []).map(s => Object.assign({}, s, { time: s.time === '' || s.time == null ? '' : num(s.time) }));
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
  addSetup() { draft.setups.push({ machine: '', program: '', time: '', note: '' }); render(); },
  delSetup(i) { draft.setups.splice(i, 1); render(); },
  progFromArt(i) { draft.setups[i].program = draft.art || ''; render(); },
  addStep() { draft.steps.push(''); render(); },
  delStep(i) { draft.steps.splice(i, 1); render(); },
  calcToMat() { const c = draft.calc, r = calc(c); draft.mat = `${r.mat.name}, ${r.shape.name} ${dimsText(c)}`; render(); toast('Записано в «Материал»'); },
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
  const p = t.dataset && t.dataset.bind; if (!p || !draft) return;
  setPath(draft, p, t.type === 'checkbox' ? t.checked : t.value);
  if (p.startsWith('calc.')) document.querySelectorAll('[data-calcres]').forEach(el => el.innerHTML = calcResultHTML(draft.calc, el.dataset.calcres === '1'));
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.file) return attach(t);
  if (t.dataset.bind === 'calc.shape' && draft) { draft.calc.dims = defaultDims(t.value); render(); return; }
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
document.addEventListener('click', e => { const im = e.target.closest('#viewer .vbody img'); if (im) im.classList.toggle('full'); });

/* ───────── Запуск ───────── */
let unsubs = [];
function startWatch() {
  stopWatch();
  const w = (col, key, need) => {
    if (!need) { S[key] = []; S.ready[key] = true; return; }
    unsubs.push(B.watch(col, rows => { S[key] = rows; S.ready[key] = true; if (draft && draftKey === location.hash) return; render(); }, () => { S[key] = []; S.ready[key] = true; render(); }));
  };
  w('users', 'users', true); w('machines', 'machines', true);
  w('parts', 'parts', can('catalog', 1)); w('projects', 'projects', can('catalog', 1));
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
