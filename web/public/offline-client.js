// ============================================================
// Voxly - Shim local (fallback offline)
// API compatível com a parte do Firestore usada pelo app do cantor.
// Armazenamento: servidor local do host (mesmo origin — porta 8030).
// Uso:
//   const db = VoxlyLocal.db();   // equivalente a firebase.firestore()
//   db.collection('sessoes').doc(id).get() ...
// ============================================================

(function (global) {
  "use strict";

  const SENTINEL_TS = { __voxlyTs: true };

  // ── Sanitização antes de enviar (Timestamps do Firebase → número) ──
  function sanitizar(v, visitados) {
    if (v == null) return v;
    const t = typeof v;

    if (t === "number" || t === "boolean" || t === "string") return v;

    // Sentinela do Firebase (serverTimestamp)
    if (t === "object" && v._methodName === "serverTimestamp") return SENTINEL_TS;

    // Timestamp do Firebase (seconds/nanoseconds)
    if (t === "object" && typeof v.seconds === "number") return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);

    if (Array.isArray(v)) return v.map(x => sanitizar(x, visitados));

    if (t === "object") {
      if (visitados && visitados.has(v)) return null;
      (visitados || (visitados = new Set())).add(v);
      const out = {};
      for (const k of Object.keys(v)) out[k] = sanitizar(v[k], visitados);
      return out;
    }
    return v;
  }

  function recente() { return SENTINEL_TS; }
  function sessaoStorage() { return global.localStorage; }

  // ── Cache de identidade (cantor offline) ──
  function idCantor() {
    let id = sessaoStorage().getItem("voxly_offline_id");
    if (!id) { id = "off-" + Math.random().toString(36).slice(2, 10); sessaoStorage().setItem("voxly_offline_id", id); }
    return id;
  }

  // ── SSE p/ tempo real ──
  let _es = null;
  const _ouvintes = new Map(); // prefixo -> Set(cb)
  function _notificar(fn) {
    try { fn(); } catch (_) {}
  }
  function _escuta(prefixo, cb) {
    if (!_ouvintes.has(prefixo)) _ouvintes.set(prefixo, new Set());
    _ouvintes.get(prefixo).add(cb);
    _garantirSSE();
    return () => { _ouvintes.get(prefixo)?.delete(cb); };
  }
  function _garantirSSE() {
    if (_es) return;
    _es = new EventSource("/api/eventos");
    _es.onmessage = () => {
      [ ..._ouvintes ].forEach(([prefixo, cbs]) => {
        cbs.forEach(cb => _notificar(cb));
      });
    };
    _es.onerror = () => { /* tenta reconectar sozinho */ };
  }

  // ── Requisições ──
  async function _api(path, metodo, corpo) {
    const url = "/api/store" + path;
    const opts = { method: metodo, headers: {} };
    if (corpo !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(corpo);
    }
    const r = await fetch(url, opts);
    if (r.status === 204) return { status: "ok" };
    const data = await r.json().catch(() => ({}));
    if (!r.ok && data.status !== "missing" && data.status !== "ok") throw new Error("Falha local");
    return data;
  }

  function _caminho(base, extra) {
    const seg = [ ...base, ...(extra || []) ];
    return seg.map(s => encodeURIComponent(s)).join("/");
  }

  // ── Snapshots ──
  function docSnapshot(doc, id) {
    return { id, exists: !!doc, data: () => doc || {}, get: (k) => (doc || {})[k] };
  }
  function querySnapshot(docs) {
    const arr = docs.map(d => ({ id: d.id, exists: true, data: () => { const c = { ...d }; delete c.id; delete c._colecao; return c; } }));
    arr.docs = arr;
    arr.empty = arr.length === 0;
    arr.size = arr.length;
    arr.docChanges = () => [];
    return arr;
  }

  // ── Filtros de consulta ──
  function aplicar(docs, filtros) {
    let r = docs.slice();
    for (const f of filtros) {
      if (f.tipo === "where") {
        if (f.op === "==") r = r.filter(d => d[f.campo] === f.valor);
        else if (f.op === "in") r = r.filter(d => Array.isArray(f.valor) && f.valor.includes(d[f.campo]));
      } else if (f.tipo === "orderBy") {
        const key = f.campo, dir = f.dir === "desc" ? -1 : 1;
        r.sort((a, b) => {
          const av = a[key], bv = b[key];
          if (av == null && bv == null) return 0;
          if (av == null) return dir;
          if (bv == null) return -dir;
          return av < bv ? -dir : av > bv ? dir : 0;
        });
      } else if (f.tipo === "limit") {
        r = r.slice(0, f.n);
      }
    }
    return r;
  }

  // ── Implementação de nós ──
  function NoColecao(caminho) {
    const col = { caminho };

    col.doc = (id) => NoDoc([ ...caminho, id ]);
    col.add = async (dados) => {
      // gera id simples
      const id = dados._id || "d" + Math.random().toString(36).slice(2, 9);
      delete dados._id;
      const corpo = sanitizar(dados);
      corpo.__merge = false;
      await _api("?path=" + _caminho([], [ ...caminho, id ]), "PUT", corpo);
      return { id };
    };
    col.get = async () => {
      const prefixo = _caminho([], caminho);
      const r = await _api("?prefix=" + prefixo, "GET");
      const docs = (r.docs || []).map(d => ({ id: d.id, ...d }));
      return querySnapshot(docs);
    };
    col.where = (campo, op, valor) => Consulta(caminho, [ { tipo: "where", campo, op, valor } ]);
    col.orderBy = (campo, dir) => Consulta(caminho, [ { tipo: "orderBy", campo, dir: dir || "asc" } ]);
    col.limit = (n) => Consulta(caminho, [ { tipo: "limit", n } ]);
    col.onSnapshot = (cb) => {
      const prefixo = _caminho([], caminho);
      async function atualizar() {
        const r = await _api("?prefix=" + prefixo, "GET");
        const docs = (r.docs || []).map(d => ({ id: d.id, ...d }));
        const snap = querySnapshot(docs);
        snap.docChanges = () => [];
        cb(snap);
      }
      atualizar();
      return _escuta(prefixo, atualizar);
    };

    return col;
  }

  function NoDoc(caminho) {
    const doc = { caminho };

    doc.get = async () => {
      const p = _caminho([], caminho);
      const r = await _api("?path=" + p, "GET");
      return docSnapshot(r.doc || null, caminho[caminho.length - 1]);
    };
    doc.set = async (dados, opts) => {
      const corpo = sanitizar(dados);
      corpo.__merge = !!(opts && opts.merge);
      await _api("?path=" + _caminho([], caminho), "PUT", corpo);
    };
    doc.update = async (dados) => {
      const corpo = sanitizar(dados);
      corpo.__merge = true;
      await _api("?path=" + _caminho([], caminho), "PUT", corpo);
    };
    doc.delete = async () => {
      await _api("?path=" + _caminho([], caminho), "DELETE");
    };
    doc.collection = (sub) => NoColecao([ ...caminho, sub ]);
    doc.onSnapshot = (cb) => {
      const p = _caminho([], caminho);
      async function atualizar() {
        const r = await _api("?path=" + p, "GET");
        cb(docSnapshot(r.doc || null, caminho[caminho.length - 1]));
      }
      atualizar();
      return _escuta(p, atualizar);
    };

    return doc;
  }

  function Consulta(caminho, filtros) {
    const q = { caminho, filtros };
    const _pedir = async () => {
      const prefixo = _caminho([], caminho);
      const r = await _api("?prefix=" + prefixo, "GET");
      return (r.docs || []).map(d => ({ id: d.id, ...d }));
    };

    q.where = (campo, op, valor) => Consulta(caminho, [ ...filtros, { tipo: "where", campo, op, valor } ]);
    q.orderBy = (campo, dir) => Consulta(caminho, [ ...filtros, { tipo: "orderBy", campo, dir: dir || "asc" } ]);
    q.limit = (n) => Consulta(caminho, [ ...filtros, { tipo: "limit", n } ]);

    q.get = async () => {
      const docs = aplicar(await _pedir(), filtros);
      return querySnapshot(docs);
    };
    q.onSnapshot = (cb) => {
      const prefixo = _caminho([], caminho);
      async function atualizar() {
        const docs = aplicar(await _pedir(), filtros);
        const snap = querySnapshot(docs);
        snap.docChanges = () => [];
        cb(snap);
      }
      atualizar();
      return _escuta(prefixo, atualizar);
    };

    return q;
  }

  // Lote do Firestore, na medida do servidor local: as operacoes saem em
  // sequencia, na ordem em que foram pedidas. Nao e atomico como o original,
  // mas o pedido de musica usa lote e sem isto quebraria no modo offline.
  function Lote() {
    const ops = [];
    const lote = {
      set: (doc, dados, opts) => { ops.push(() => doc.set(dados, opts)); return lote; },
      update: (doc, dados) => { ops.push(() => doc.update(dados)); return lote; },
      delete: (doc) => { ops.push(() => doc.delete()); return lote; },
      commit: async () => { for (const op of ops) await op(); },
    };
    return lote;
  }

  // ── Raiz ──
  const db = {
    collection: (nome) => NoColecao([ nome ]),
    batch: Lote,
  };

  global.VoxlyLocal = {
    db: () => db,
    FieldValue: { serverTimestamp: recente },
    idCantor,
    sanitizar,
  };
})(window);