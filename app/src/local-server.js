// ============================================================
// Voxly - Servidor local (LAN)
// Serve o app dos cantores + API offline com fallback do Firestore.
// Porta padrão: 8030
// Endpoints:
//   GET  /api/sessoes/:id
//   PATCH /api/sessoes/:id
//   GET  /api/sessoes/:id/:colecao            (fila, presencas, convites, historico)
//   POST /api/sessoes/:id/:colecao            { ...dados }
//   PATCH /api/sessoes/:id/:colecao/:docId    { ...dados }  (merge parcial)
//   DELETE /api/sessoes/:id/:colecao/:docId
//   GET  /api/:colecao/:docId                 (cantores, configuracoes, artistas)
//   PUT  /api/:colecao/:docId                 { ...dados }  (set completo)
//   GET  /api/eventos?sessao=:id              (Server-Sent Events)
// ============================================================

const http   = require("http");
const path   = require("path");
const fs     = require("fs");
const os     = require("os");

const PORT            = 8030;
const WEB_PUBLIC_DIR  = path.join(__dirname, "..", "..", "web", "public");

class ServidorLocal {
  constructor(opcoes = {}) {
    this.porta          = opcoes.porta || PORT;
    this.dirPublico     = opcoes.dirPublico || WEB_PUBLIC_DIR;
    this.caminhoDados   = opcoes.caminhoDados || null; // arquivo JSON de persistência
    this.dados          = {};  // { [caminhoCompleto]: doc }
    this.ouvintesSSE    = new Set();
    this._salvarTimer   = null;
    this.servidor       = null;
  }

  // ── Persistência ──────────────────────────────────────────
  carregar() {
    try {
      if (this.caminhoDados && fs.existsSync(this.caminhoDados)) {
        this.dados = JSON.parse(fs.readFileSync(this.caminhoDados, "utf8"));
      }
    } catch(e) {
      console.warn("[LOCAL] Falha ao carregar dados:", e.message);
    }
  }

  salvar() {
    if (!this.caminhoDados) return;
    clearTimeout(this._salvarTimer);
    this._salvarTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(this.caminhoDados), { recursive: true });
        fs.writeFileSync(this.caminhoDados, JSON.stringify(this.dados));
      } catch(e) {
        console.warn("[LOCAL] Falha ao salvar dados:", e.message);
      }
    }, 300);
  }

  // ── Acesso aos dados ──────────────────────────────────────
  _chave(...partes)        { return partes.join("/"); }
  _getChave(chave)         { return this.dados[chave]; }
  _setChave(chave, valor)  { this.dados[chave] = valor; this.salvar(); this._emitirValor(chave); }

  _caminhosDe(colecao) {
    return Object.keys(this.dados)
      .filter(c => c.startsWith(colecao + "/") && c.split("/").length === colecao.split("/").length + 1)
      .sort();
  }

  // ── Eventos (SSE) ─────────────────────────────────────────
  _emitirValor(chave) {
    const payload = { chave, doc: this.dados[chave] ? { id: chave.split("/").pop(), ...this.dados[chave] } : null };
    const msg = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of this.ouvintesSSE) {
      try { res.write(msg); } catch(e) { this.ouvintesSSE.delete(res); }
    }
  }

  _bisbilhotarFila(res) { this.ouvintesSSE.add(res); res.on("close", () => this.ouvintesSSE.delete(res)); }

  // ── Roteamento ────────────────────────────────────────────
  iniciar() {
    this.carregar();

    this.servidor = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${this.porta}`);
      const caminho = url.pathname;

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

      // SSE
      if (caminho === "/api/eventos" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });
        res.write(":ok\n\n");
        this._bisbilhotarFila(res);
        return;
      }

      // API
      if (caminho.startsWith("/api/")) {
        this._tratarApi(req, res, url, caminho);
        return;
      }

      // Estáticos (app dos cantores)
      this._tratarEstatico(req, res, caminho);
    });

    // Sem este tratamento, porta ocupada (tipicamente outra instancia do Voxly
    // ainda aberta) virava excecao nao capturada e derrubava o app inteiro.
    this.servidor.on("error", (e) => {
      if (e.code === "EADDRINUSE") {
        console.error(`[LOCAL] Porta ${this.porta} ja esta em uso. ` +
          `O modo offline por LAN fica indisponivel nesta instancia.`);
      } else {
        console.error("[LOCAL] Erro no servidor:", e.message);
      }
      this.servidor = null;
    });

    this.servidor.listen(this.porta, "0.0.0.0", () => {
      const ip = this._ipLocal();
      console.log(`[LOCAL] Servidor LAN: http://${ip}:${this.porta}`);
    });
  }

  _ipLocal() {
    const nets = os.networkInterfaces();
    for (const ifaces of Object.values(nets)) {
      for (const i of ifaces || []) {
        if (i.family === "IPv4" && !i.internal) return i.address;
      }
    }
    return "127.0.0.1";
  }

  urlWeb() { return `http://${this._ipLocal()}:${this.porta}`; }

  _lerCorpo(req) {
    return new Promise((resolve) => {
      let corpo = "";
      req.on("data", c => { corpo += c; if (corpo.length > 5e6) req.destroy(); });
      req.on("end", () => {
        try { resolve(corpo ? JSON.parse(corpo) : {}); }
        catch(e) { resolve({}); }
      });
      req.on("error", () => resolve({}));
    });
  }

  async _tratarApi(req, res, url, caminho) {
    const partes = caminho.split("/").filter(Boolean); // ["api", ...]

    // ── Datastore genérico p/ shim do app (perfil do cantor) ──
    // GET  /api/store?path=colecao/docId            → { status, doc|docs }
    // GET  /api/store?prefix=colecao                → { docs: [ {id,...} ] }
    // PUT  /api/store?path=colecao/docId  body      → upsert (merge)
    // DELETE /api/store?path=colecao/docId
    if (partes.length === 2 && partes[1] === "store") {
      const pathC = url.searchParams.get("path");
      const prefix = url.searchParams.get("prefix");

      if (req.method === "GET" && prefix) {
        const docs = this._caminhosDe(prefix).map(c => ({ id: c.split("/").pop(), ...this._getChave(c) }));
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ docs }));
        return;
      }

      if (pathC && req.method === "GET") {
        const doc = this._getChave(pathC);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ status: doc ? "ok" : "missing", doc: doc || null }));
        return;
      }

      if (pathC && req.method === "PUT") {
        const corpo = await this._lerCorpo(req);
        const merge = corpo.__merge !== undefined ? corpo.__merge : true;
        delete corpo.__merge;
        const base = this._getChave(pathC) || {};
        this._setChave(pathC, merge ? { ...base, ...corpo } : corpo);
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (pathC && req.method === "DELETE") {
        delete this.dados[pathC];
        this.salvar();
        this._emitirValor(pathC);
        res.statusCode = 204; res.end();
        return;
      }
    }

    // GET /api/:colecao/:docId  (coleções top: cantores, configuracoes, artistas, historico)
    if ((req.method === "GET" || req.method === "PUT") && partes.length === 3) {
      const colecao = partes[1], docId = decodeURIComponent(partes[2]);
      const chave = this._chave(colecao, docId);
      if (req.method === "GET") {
        const doc = this._getChave(chave);
        if (!doc) { res.statusCode = 404; res.end("{}"); return; }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ id: docId, ...doc }));
        return;
      }
      const corpo = await this._lerCorpo(req);
      this._setChave(chave, { ...(this._getChave(chave) || {}), ...corpo });
      res.end(JSON.stringify({ id: docId }));
      return;
    }

    // GET /api/historico/:uid/apresentacoes  (subcoleção top)
    if (req.method === "GET" && partes.length === 4 && partes[1] === "historico" && partes[3] === "apresentacoes") {
      const uid = partes[2];
      const da = this._caminhosDe(this._chave("historico", uid, "apresentacoes"));
      const docs = da.map(c => ({ id: c.split("/").pop(), ...this._getChave(c) }));
      docs.sort((a, b) => (b.data && a.data ? b.data - a.data : 0));
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ docs: docs.slice(0, 20) }));
      return;
    }

    // Rotas aninhadas: sessoes/:sessao/:colecao[/:docId]
    if (partes.length >= 4 && partes[1] === "sessoes") {
      const sessao = partes[2], colecao = partes[3], docId = partes[4] ? decodeURIComponent(partes[4]) : null;
      const base = this._chave("sessoes", sessao, colecao);

      if (req.method === "GET" && !docId) {
        const docs = this._caminhosDe(base).map(c => ({ id: c.split("/").pop(), ...this._getChave(c) }));
        for (const d of docs) d["_colecao"] = colecao;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ docs }));
        return;
      }

      if (req.method === "POST") {
        const corpo = await this._lerCorpo(req);
        const novoId = corpo.id || (Math.random().toString(36).slice(2, 10));
        delete corpo.id;
        this._setChave(this._chave(base, novoId), corpo);
        res.end(JSON.stringify({ id: novoId }));
        this._emitirSessao(sessao);
        return;
      }

      if (docId && req.method === "PATCH") {
        const corpo = await this._lerCorpo(req);
        const chave = this._chave(base, docId);
        this._setChave(chave, { ...(this._getChave(chave) || {}), ...corpo });
        res.end(JSON.stringify({ id: docId }));
        this._emitirSessao(sessao);
        return;
      }

      if (docId && req.method === "DELETE") {
        delete this.dados[this._chave(base, docId)];
        this.salvar();
        this._emitirValor(this._chave(base, docId));
        this._emitirSessao(sessao);
        res.statusCode = 204; res.end();
        return;
      }
    }

    // GET /api/sessoes/:sessao (documento da sessão)
    if (req.method === "GET" && partes.length === 3 && partes[1] === "sessoes") {
      const sessao = partes[2];
      const doc = this._getChave(this._chave("sessoes", sessao));
      if (!doc) { res.statusCode = 404; res.end("{}"); return; }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ id: sessao, ...doc }));
      return;
    }

    if (req.method === "PATCH" && partes.length === 3 && partes[1] === "sessoes") {
      const corpo = await this._lerCorpo(req);
      const sessao = partes[2];
      this._setChave(this._chave("sessoes", sessao), { ...(this._getChave(this._chave("sessoes", sessao)) || {}), ...corpo });
      this._emitirSessao(sessao);
      res.end(JSON.stringify({ id: sessao }));
      return;
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end("{}");
  }

  _emitirSessao(sessao) {
    for (const c of this._caminhosDe(this._chave("sessoes", sessao))) this._emitirValor(c);
  }

  _tratarEstatico(req, res, caminho) {
    let alvo = caminho === "/" ? "/index.html" : caminho;
    alvo = decodeURIComponent(alvo.split("?")[0]);

    const arquivo = path.join(this.dirPublico, alvo);
    // Evita path traversal
    if (!arquivo.startsWith(this.dirPublico)) { res.statusCode = 403; res.end(); return; }

    if (!fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
      if (fs.existsSync(path.join(this.dirPublico, "index.html"))) {
        const idx = path.join(this.dirPublico, "index.html");
        this._enviarArquivo(res, idx);
        return;
      }
      res.statusCode = 404; res.end("não encontrado");
      return;
    }

    this._enviarArquivo(res, arquivo);
  }

  _enviarArquivo(res, arquivo) {
    const tipos = {
      ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
      ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
      ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
    };
    res.setHeader("Content-Type", tipos[path.extname(arquivo).toLowerCase()] || "application/octet-stream");
    fs.createReadStream(arquivo).pipe(res);
  }

  encerrar() {
    if (this.servidor) this.servidor.close();
  }
}

module.exports = ServidorLocal;