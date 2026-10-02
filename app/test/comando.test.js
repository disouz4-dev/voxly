const test = require("node:test");
const assert = require("node:assert");
const { ACOES, comandoValido, julgarComando, normalizarEmail, mesmoDono } = require("../src/comando");

const agora = new Date(2026, 9, 2, 23, 30, 0).getTime();
const cmd = (extra = {}) => ({ acao: "tocar", criadoEm: agora, ...extra });

test("so as acoes conhecidas passam", () => {
  for (const acao of Object.keys(ACOES)) {
    const alvo = ACOES[acao].alvo ? { alvoId: "item1" } : {};
    assert.ok(comandoValido({ acao, ...alvo }), acao);
  }
  for (const ruim of [null, {}, { acao: "apagarTudo" }, { acao: "" }, "tocar"]) {
    assert.strictEqual(comandoValido(ruim), false, JSON.stringify(ruim));
  }
});

test("acao destrutiva sem alvo nao vale", () => {
  assert.strictEqual(comandoValido({ acao: "pular" }), false);
  assert.strictEqual(comandoValido({ acao: "cantarNaProxima", alvoId: "" }), false);
  assert.ok(comandoValido({ acao: "pular", alvoId: "x" }));
});

test("o Play sobe quando o comando acabou de chegar", () => {
  assert.deepStrictEqual(julgarComando(cmd(), { agora }), { fazer: true, alvo: null });
});

test("comando velho e comando do futuro sao descartados", () => {
  assert.strictEqual(julgarComando(cmd({ criadoEm: agora - 120000 }), { agora }).fazer, false);
  assert.strictEqual(julgarComando(cmd({ criadoEm: agora + 60000 }), { agora }).fazer, false);
  // Dentro da janela, passa.
  assert.strictEqual(julgarComando(cmd({ criadoEm: agora - 30000 }), { agora }).fazer, true);
});

test("pular so vale para a musica que o celular estava vendo", () => {
  const pular = cmd({ acao: "pular", alvoId: "m1" });
  assert.strictEqual(julgarComando(pular, { agora, estado: { itemNoPalco: "m1" } }).fazer, true);
  // A musica virou entre o toque e a chegada: nao pula a de outra pessoa.
  assert.strictEqual(julgarComando(pular, { agora, estado: { itemNoPalco: "m2" } }).fazer, false);
  assert.strictEqual(julgarComando(pular, { agora, estado: {} }).fazer, false);
});

test("cantar na proxima vale tambem para quem esta sendo chamado", () => {
  const adiar = cmd({ acao: "cantarNaProxima", alvoId: "m9" });
  assert.strictEqual(julgarComando(adiar, { agora, estado: { chamandoId: "m9" } }).fazer, true);
  assert.strictEqual(julgarComando(adiar, { agora, estado: { chamandoId: "outro" } }).fazer, false);
});

test("timestamp do Firestore tambem e entendido", () => {
  const comToMillis = cmd({ criadoEm: { toMillis: () => agora - 1000 } });
  assert.strictEqual(julgarComando(comToMillis, { agora }).fazer, true);
});

test("e-mail do dono: caixa e espaco nao podem trancar ele para fora", () => {
  assert.strictEqual(normalizarEmail("  Diego@Gmail.COM "), "diego@gmail.com");
  assert.ok(mesmoDono("diegodisouza10@gmail.com", " DiegoDiSouza10@Gmail.com "));
  assert.strictEqual(mesmoDono("", ""), false);
  assert.strictEqual(mesmoDono(null, "a@b.com"), false);
  assert.strictEqual(mesmoDono("a@b.com", "c@d.com"), false);
});
