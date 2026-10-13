// Тестовый адаптер «в памяти» — тот же интерфейс, что у backend.js. В работе не используется.
(function () {
  const clean = o => JSON.parse(JSON.stringify(o));
  const data = {}; // col -> {id: obj}
  const watchers = []; // {col, cb}
  const files = {};
  let seq = 1, authCb = null, cur = null;
  const accounts = {}; // login -> {pass, uid}
  const col = c => (data[c] = data[c] || {});
  const emit = c => watchers.filter(w => w.col === c).forEach(w =>
    w.cb(Object.keys(col(c)).map(id => Object.assign({ id }, clean(col(c)[id])))));

  // стартовый админ
  accounts.admin = { pass: 'admin1', uid: 'u0' };
  col('users').u0 = { name: 'Админ', login: 'admin', active: true, isAdmin: true, perms: {} };

  const B = {
    onAuth(cb) { authCb = cb; setTimeout(() => cb(cur), 0); },
    async login(l, p) {
      l = l.trim().toLowerCase();
      const a = accounts[l];
      if (!a || a.pass !== p) { const e = new Error('bad'); e.code = 'auth/invalid-credential'; throw e; }
      const u = col('users')[a.uid];
      cur = u ? Object.assign({ uid: a.uid }, clean(u)) : { uid: a.uid, missing: true };
      authCb(cur);
    },
    async logout() { cur = null; authCb(null); },
    watch(c, cb) {
      const w = { col: c, cb }; watchers.push(w);
      setTimeout(() => emit(c), 0);
      return () => watchers.splice(watchers.indexOf(w), 1);
    },
    async save(c, id, d) {
      d = clean(d); delete d.id;
      id = id || ('d' + seq++);
      col(c)[id] = d; emit(c); return id;
    },
    async remove(c, id) { delete col(c)[id]; emit('' + c); },
    async list(c, o) {
      o = o || {}; let r = Object.keys(col(c)).map(id => Object.assign({ id }, clean(col(c)[id])));
      if (o.where) r = r.filter(x => x[o.where[0]] === o.where[1]);
      if (o.orderBy) r.sort((a, b) => (b[o.orderBy] || 0) - (a[o.orderBy] || 0));
      if (o.limit) r = r.slice(0, o.limit);
      return r;
    },
    async createUser(login, pass, profile) {
      login = login.trim().toLowerCase();
      if (accounts[login]) { const e = new Error('dup'); e.code = 'auth/email-already-in-use'; throw e; }
      const uid = 'u' + seq++;
      accounts[login] = { pass, uid };
      col('users')[uid] = clean(Object.assign({ login }, profile)); emit('users');
      return uid;
    },
    async saveFile(blob, name) {
      const id = 'f' + seq++;
      files[id] = blob;
      return { id, name, type: blob.type || 'application/octet-stream', size: blob.size || 0 };
    },
    async getFile(id) { return files[id]; },
    async removeFile(id) { delete files[id]; },
    _data: data, _files: files
  };
  window.Backend = B;
})();
