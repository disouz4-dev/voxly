"use strict";

// Cache e teto por minuto, num lugar so. O teto existia, mas so no caminho da
// renomeacao — que quase nunca roda. Quem estoura o IP e o autocomplete do KJ,
// que dispara a cada 300ms de digitacao. E um 403 do iTunes derruba tambem o
// autocomplete do app do cantor, que e a parte que o publico ve.

const test = require("node:test");
const assert = require("node:assert");
const { criarConsultaLimitada } = require("../src/limite");

test("mesma chave nao repete a consulta", async () => {
  let n = 0;
  const c = criarConsultaLimitada({ consultar: async () => { n++; return ["r"]; } });
  await c("drown"); await c("drown"); await c("DROWN");
  assert.strictEqual(n, 1, "a chave e insensivel a caixa");
});

test("guarda tambem o resultado vazio", async () => {
  let n = 0;
  const c = criarConsultaLimitada({ consultar: async () => { n++; return []; } });
  await c("nada"); await c("nada");
  assert.strictEqual(n, 1);
});

test("passado o teto, desiste em vez de insistir", async () => {
  let n = 0, t = 0;
  const c = criarConsultaLimitada({ consultar: async () => { n++; return ["r"]; },
                                    limitePorMinuto: 2, agora: () => t });
  await c("a"); await c("b");
  assert.strictEqual(await c("c"), null);
  assert.strictEqual(n, 2);
  t = 61000;
  assert.deepStrictEqual(await c("c"), ["r"]);
});

test("erro devolve null, nao propaga", async () => {
  const c = criarConsultaLimitada({ consultar: async () => { throw new Error("403"); } });
  assert.strictEqual(await c("x"), null);
});

test("chave vazia nem consulta", async () => {
  let n = 0;
  const c = criarConsultaLimitada({ consultar: async () => { n++; return ["r"]; } });
  assert.strictEqual(await c("  "), null);
  assert.strictEqual(n, 0);
});
