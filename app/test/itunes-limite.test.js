"use strict";

// O iTunes limita requisicoes por IP. Numa casa cheia, com a fila andando, um
// pedido por download somaria rapido — e estourar o limite devolve 403 para
// TODAS as chamadas seguintes, inclusive o autocomplete do app do cantor, que
// e a parte que o publico ve.

const test = require("node:test");
const assert = require("node:assert");
const { criarBuscaItunes } = require("../src/identificacao");

function falso(resposta = [{ artistName: "Periphery", trackName: "Satellites" }]) {
  const chamadas = [];
  const buscar = async (url) => {
    chamadas.push(url);
    return { ok: true, json: async () => ({ results: resposta }) };
  };
  return { buscar, chamadas };
}

test("mesma consulta nao vai duas vezes na rede", async () => {
  const { buscar, chamadas } = falso();
  const busca = criarBuscaItunes({ buscar });
  const a = await busca("Periphery Satellites");
  const b = await busca("Periphery Satellites");
  assert.deepStrictEqual(a, b);
  assert.strictEqual(chamadas.length, 1, "a segunda tem que sair do cache");
});

test("cache tambem guarda o resultado vazio", async () => {
  const { buscar, chamadas } = falso([]);
  const busca = criarBuscaItunes({ buscar });
  await busca("nada disso existe");
  await busca("nada disso existe");
  assert.strictEqual(chamadas.length, 1, "senao um titulo ruim bate na rede a cada tentativa");
});

test("passado o limite do minuto, para de pedir em vez de tomar 403", async () => {
  const { buscar, chamadas } = falso();
  let t = 0;
  const busca = criarBuscaItunes({ buscar, limitePorMinuto: 3, agora: () => t });
  for (let i = 0; i < 3; i++) await busca(`Periphery Satellites ${i}`);
  assert.strictEqual(chamadas.length, 3);

  assert.strictEqual(await busca("Periphery Satellites 4"), null, "a quarta nao sai");
  assert.strictEqual(chamadas.length, 3);
});

test("a janela anda: um minuto depois volta a pedir", async () => {
  const { buscar, chamadas } = falso();
  let t = 0;
  const busca = criarBuscaItunes({ buscar, limitePorMinuto: 2, agora: () => t });
  await busca("Periphery Satellites um"); await busca("Periphery Satellites dois");
  assert.strictEqual(await busca("Periphery Satellites tres"), null);
  t = 61000;
  assert.ok(await busca("Periphery Satellites tres"), "passada a janela, a consulta sai");
  assert.strictEqual(chamadas.length, 3);
});

test("acerto no cache nao gasta cota", async () => {
  const { buscar, chamadas } = falso();
  let t = 0;
  const busca = criarBuscaItunes({ buscar, limitePorMinuto: 2, agora: () => t });
  await busca("Periphery Satellites um");
  await busca("Periphery Satellites um"); await busca("Periphery Satellites um");   // cache
  assert.ok(await busca("Periphery Satellites dois"), "ainda ha cota para uma consulta nova");
  assert.strictEqual(chamadas.length, 2);
});

test("erro da rede nao derruba o download", async () => {
  const busca = criarBuscaItunes({ buscar: async () => { throw new Error("ECONNREFUSED"); } });
  assert.strictEqual(await busca("qualquer"), null);
});
