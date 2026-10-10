// Адаптер Firebase. Приложение работает только через window.Backend,
// поэтому для тестов подменяется на backend-mem.js.
(function () {
  const cfg = window.FIREBASE_CONFIG;
  firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const DOM = '@prod.local';
  const CHUNK = 650000; // символов base64 в одном документе (лимит документа ~1 МБ)
  const clean = o => JSON.parse(JSON.stringify(o));

  const B = {
    onAuth(cb) {
      auth.onAuthStateChanged(async u => {
        if (!u) return cb(null);
        try {
          const d = await db.collection('users').doc(u.uid).get();
          cb(d.exists ? Object.assign({ uid: u.uid }, d.data()) : { uid: u.uid, missing: true });
        } catch (e) { cb({ uid: u.uid, error: e.message }); }
      });
    },
    login(l, p) { return auth.signInWithEmailAndPassword(l.trim().toLowerCase() + DOM, p); },
    logout() { return auth.signOut(); },

    watch(col, cb, onErr) {
      return db.collection(col).onSnapshot(
        s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data()))),
        e => { console.error(col, e); if (onErr) onErr(e); }
      );
    },
    async save(col, id, data) {
      data = clean(data); delete data.id;
      if (id) { await db.collection(col).doc(id).set(data); return id; }
      const r = await db.collection(col).add(data); return r.id;
    },
    async remove(col, id) { await db.collection(col).doc(id).delete(); },

    // Админ создаёт пользователя через вторую копию приложения, чтобы не выйти самому.
    async createUser(login, pass, profile) {
      login = login.trim().toLowerCase();
      let sec;
      try { sec = firebase.app('sec'); } catch (e) { sec = firebase.initializeApp(cfg, 'sec'); }
      const cred = await sec.auth().createUserWithEmailAndPassword(login + DOM, pass);
      const uid = cred.user.uid;
      await sec.auth().signOut();
      await db.collection('users').doc(uid).set(clean(Object.assign({ login }, profile)));
      return uid;
    },

    // Файлы: кусками по ~650 КБ в Firestore
    async saveFile(blob, name) {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1] || '');
        r.onerror = () => rej(r.error);
        r.readAsDataURL(blob);
      });
      const n = Math.max(1, Math.ceil(b64.length / CHUNK));
      const ref = db.collection('files').doc();
      for (let i = 0; i < n; i++) {
        await db.collection('filechunks').doc(ref.id + '_' + i).set({ fileId: ref.id, n: i, data: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
      }
      await ref.set({ name, type: blob.type || 'application/octet-stream', size: blob.size, chunks: n });
      return { id: ref.id, name, type: blob.type || 'application/octet-stream', size: blob.size };
    },
    async getFile(id) {
      const m = await db.collection('files').doc(id).get();
      if (!m.exists) throw new Error('Файл не найден');
      const { chunks, type } = m.data();
      const parts = await Promise.all(Array.from({ length: chunks }, (_, i) => db.collection('filechunks').doc(id + '_' + i).get()));
      const bin = atob(parts.map(p => p.data().data).join(''));
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new Blob([u8], { type });
    },
    async removeFile(id) {
      const m = await db.collection('files').doc(id).get();
      if (m.exists) {
        for (let i = 0; i < m.data().chunks; i++) await db.collection('filechunks').doc(id + '_' + i).delete();
        await db.collection('files').doc(id).delete();
      }
    }
  };
  window.Backend = B;
})();
