const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const lic = require("../src/licenca");

const DIA = lic.DIA;

// Par de chaves criado na hora: nenhuma chave de verdade entra no repositorio.
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const outro = crypto.generateKeyPairSync("ed25519");

const confereCom = (chave) => (corpo, assinatura) => crypto.verify(null, corpo, chave, assinatura);
const confere = confereCom(publicKey);

function emitir(dados, chave = privateKey) {
  const corpo = lic.paraBase64url(Buffer.from(JSON.stringify(dados), "utf8"));
  const assinatura = lic.paraBase64url(crypto.sign(null, Buffer.from(corpo, "utf8"), chave));
  return `${lic.MARCA}.${corpo}.${assinatura}`;
}

const bilhete = (v, extra = {}) => emitir({ i: "maq-1", c: "Casa do Rock", p: "mensal", e: 1000, v, n: 1, ...extra });

// ── Abrir o bilhete ────────────────────────────────────────

test("le um bilhete assinado por quem devia", () => {
  const r = lic.abrirLicenca(bilhete(5000), confere);
  assert.equal(r.ok, true);
  assert.equal(r.instalacao, "maq-1");
  assert.equal(r.casa, "Casa do Rock");
  assert.equal(r.valeAte, 5000);
});

test("recusa bilhete assinado por outra chave", () => {
  const r = lic.abrirLicenca(bilhete(5000, {}), confere);
  assert.equal(r.ok, true);
  const falso = emitir({ i: "maq-1", v: 9e15 }, outro.privateKey);
  assert.deepEqual(lic.abrirLicenca(falso, confere), { ok: false, motivo: "assinatura" });
});

test("recusa bilhete com a validade adulterada", () => {
  const p = lic.partesDaLicenca(bilhete(5000));
  const dados = JSON.parse(lic.deBase64url(p.corpo).toString("utf8"));
  dados.v = 9e15;                                   // "vale ate o ano 287396"
  const corpoNovo = lic.paraBase64url(Buffer.from(JSON.stringify(dados), "utf8"));
  const adulterado = `${lic.MARCA}.${corpoNovo}.${p.assinatura}`;
  assert.deepEqual(lic.abrirLicenca(adulterado, confere), { ok: false, motivo: "assinatura" });
});

test("recusa lixo, vazio e formato errado", () => {
  for (const t of ["", null, "abc", "VOXLY1.so-uma-parte", "OUTRO1.a.b", "VOXLY1..", "a.b.c"]) {
    assert.equal(lic.abrirLicenca(t, confere).ok, false, `devia recusar: ${t}`);
  }
});

test("recusa bilhete sem data de validade, mesmo bem assinado", () => {
  assert.deepEqual(lic.abrirLicenca(emitir({ i: "maq-1" }), confere), { ok: false, motivo: "incompleto" });
});

test("nao estoura se a funcao de conferir der erro", () => {
  const explode = () => { throw new Error("sem chave"); };
  assert.deepEqual(lic.abrirLicenca(bilhete(5000), explode), { ok: false, motivo: "assinatura" });
});

// ── Relogio ────────────────────────────────────────────────

test("o relogio pode adiantar, mas nao volta no tempo", () => {
  assert.equal(lic.relogioDe(1000, 900), 1000);            // normal
  assert.equal(lic.relogioDe(9000, 900), 9000);            // adiantou: aceita
  const dezDias = 10 * DIA;
  assert.equal(lic.relogioDe(dezDias, dezDias + 30 * DIA), dezDias + 30 * DIA); // voltou: ignora
});

test("folga de um dia para fuso e acerto de relogio", () => {
  const agora = 100 * DIA;
  assert.equal(lic.relogioDe(agora - 3600e3, agora), agora - 3600e3);  // uma hora atras: aceita
});

// ── Estado ─────────────────────────────────────────────────

const abrir = (t) => lic.abrirLicenca(t, confere);
const estado = (e) => lic.estadoDaLicenca({ instalacao: "maq-1", cobrando: true, ...e });

test("sem chave de producao o Voxly nao cobra nada", () => {
  const r = lic.estadoDaLicenca({ cobrando: false, agora: 9e12 });
  assert.equal(r.situacao, "aberto");
  assert.equal(r.podeAbrirSessao, true);
});

test("instalacao nova entra no periodo de teste", () => {
  const r = estado({ agora: 1000 * DIA, instaladoEm: 1000 * DIA });
  assert.equal(r.situacao, "teste");
  assert.equal(r.diasRestantes, 14);
  assert.equal(r.podeAbrirSessao, true);
});

test("teste terminado nao abre sessao nova", () => {
  const r = estado({ agora: 1020 * DIA, instaladoEm: 1000 * DIA });
  assert.equal(r.situacao, "sem-licenca");
  assert.equal(r.podeAbrirSessao, false);
});

test("licenca em dia: ativa, sem encher o saco", () => {
  const r = estado({ agora: 1000 * DIA, licenca: abrir(bilhete(1030 * DIA)) });
  assert.equal(r.situacao, "ativa");
  assert.equal(r.diasRestantes, 30);
  assert.equal(r.aviso, "");
  assert.equal(r.casa, "Casa do Rock");
});

test("a uma semana do fim comeca a avisar", () => {
  const r = estado({ agora: 1000 * DIA, licenca: abrir(bilhete(1005 * DIA)) });
  assert.equal(r.situacao, "vencendo");
  assert.equal(r.diasRestantes, 5);
  assert.match(r.aviso, /5 dias/);
  assert.equal(r.podeAbrirSessao, true);
});

test("um dia restante fala no singular", () => {
  const r = estado({ agora: 1000 * DIA, licenca: abrir(bilhete(1001 * DIA)) });
  assert.match(r.aviso, /1 dia\./);
});

test("licenca de outro computador nao vale", () => {
  const deOutra = emitir({ i: "maq-2", c: "Bar Vizinho", v: 9e15, n: 1 });
  const r = estado({ agora: 1000 * DIA, licenca: abrir(deOutra) });
  assert.equal(r.situacao, "outra-maquina");
  assert.equal(r.podeAbrirSessao, false);
});

test("venceu sem conseguir falar com o servidor: tolerancia, o show abre", () => {
  const venceu = 1000 * DIA;
  const r = estado({ agora: venceu + 2 * DIA, licenca: abrir(bilhete(venceu)), ultimoContato: venceu - 5 * DIA });
  assert.equal(r.situacao, "tolerancia");
  assert.equal(r.podeAbrirSessao, true);
  assert.equal(r.diasRestantes, 5);
});

test("venceu e o servidor respondeu depois do vencimento: nao ha o que tolerar", () => {
  const venceu = 1000 * DIA;
  const r = estado({ agora: venceu + 2 * DIA, licenca: abrir(bilhete(venceu)), ultimoContato: venceu + 1 * DIA });
  assert.equal(r.situacao, "vencida");
  assert.equal(r.podeAbrirSessao, false);
});

test("passada a tolerancia, trava", () => {
  const venceu = 1000 * DIA;
  const r = estado({ agora: venceu + 10 * DIA, licenca: abrir(bilhete(venceu)), ultimoContato: 0 });
  assert.equal(r.situacao, "vencida");
  assert.equal(r.podeAbrirSessao, false);
});

test("atrasar o relogio do computador nao ressuscita licenca vencida", () => {
  const venceu = 1000 * DIA;
  const r = estado({
    agora: 990 * DIA,                 // KJ voltou o relogio dez dias
    ultimaVista: venceu + 20 * DIA,   // mas o app ja tinha visto data bem depois
    licenca: abrir(bilhete(venceu)),
    ultimoContato: venceu + 1 * DIA,
  });
  assert.equal(r.situacao, "vencida");
  assert.equal(r.podeAbrirSessao, false);
});

test("bilhete quebrado e tratado como se nao houvesse licenca", () => {
  const r = estado({ agora: 1020 * DIA, instaladoEm: 1000 * DIA, licenca: null });
  assert.equal(r.podeAbrirSessao, false);
});

test("prazos sao ajustaveis sem mexer no codigo", () => {
  const r = estado({ agora: 1000 * DIA, instaladoEm: 1000 * DIA, opcoes: { diasDeTeste: 3 } });
  assert.equal(r.diasRestantes, 3);
});

// ── Recado da barra ────────────────────────────────────────

test("a barra so fala quando ha o que dizer", () => {
  assert.equal(lic.recadoDoTopo({ situacao: "ativa", diasRestantes: 30 }), "");
  assert.equal(lic.recadoDoTopo({ situacao: "aberto" }), "");
  assert.equal(lic.recadoDoTopo(null), "");
  assert.match(lic.recadoDoTopo({ situacao: "teste", diasRestantes: 9 }), /Teste/);
  assert.match(lic.recadoDoTopo({ situacao: "vencendo", diasRestantes: 2 }), /2d/);
  assert.match(lic.recadoDoTopo({ situacao: "vencida" }), /vencida/);
});
