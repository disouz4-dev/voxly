"use strict";

// Teto de trabalhos simultâneos, com prioridade.
//
// Dois problemas vividos no show de 22/10, que são o mesmo problema:
//  - sem teto, cada clique largava um yt-dlp e chegou a 20 processos parados,
//    todos disputando banda e nenhum terminando;
//  - sem ordem, a música que ia tocar em 3 minutos disputava com a que tocaria
//    em 40. Pedido do dono: "a prioridade de download são sempre as músicas
//    mais próximas de serem tocadas".
//
// `prioridade` é a posição na fila de canto: 1 é quem canta primeiro, e número
// menor passa na frente. Quem já está rodando NUNCA é interrompido — cortar um
// download no meio é jogar fora o que já baixou.

const test = require("node:test");
const assert = require("node:assert");
const { criarFilaLimitada } = require("../src/fila-limitada");

const espera = (ms) => new Promise(r => setTimeout(r, ms));

test("respeita o teto de simultaneos", async () => {
  const fila = criarFilaLimitada({ limite: 2 });
  let agora = 0, pico = 0;
  const trabalho = async () => {
    agora++; pico = Math.max(pico, agora);
    await espera(15);
    agora--;
  };

  await Promise.all([1, 2, 3, 4, 5].map(() => fila.correr(trabalho)));

  assert.strictEqual(pico, 2, `rodaram ${pico} de uma vez, o teto era 2`);
});

test("quem vai tocar antes baixa antes", async () => {
  const fila = criarFilaLimitada({ limite: 1 });
  const ordem = [];
  const trabalho = (nome) => async () => { ordem.push(nome); await espera(5); };

  // O primeiro ocupa a vaga; os outros entram na espera fora de ordem.
  const p = [
    fila.correr(trabalho("ocupa"), { prioridade: 99 }),
    fila.correr(trabalho("daqui-40min"), { prioridade: 10 }),
    fila.correr(trabalho("proxima"), { prioridade: 1 }),
    fila.correr(trabalho("daqui-15min"), { prioridade: 4 }),
  ];
  await Promise.all(p);

  assert.deepStrictEqual(ordem, ["ocupa", "proxima", "daqui-15min", "daqui-40min"]);
});

test("empate na prioridade mantem a ordem de chegada", async () => {
  const fila = criarFilaLimitada({ limite: 1 });
  const ordem = [];
  const trabalho = (n) => async () => { ordem.push(n); await espera(3); };

  await Promise.all([
    fila.correr(trabalho("ocupa"), { prioridade: 50 }),
    fila.correr(trabalho("a"), { prioridade: 7 }),
    fila.correr(trabalho("b"), { prioridade: 7 }),
    fila.correr(trabalho("c"), { prioridade: 7 }),
  ]);

  assert.deepStrictEqual(ordem, ["ocupa", "a", "b", "c"]);
});

test("sem prioridade declarada, vai para o fim da fila", async () => {
  const fila = criarFilaLimitada({ limite: 1 });
  const ordem = [];
  const trabalho = (n) => async () => { ordem.push(n); await espera(3); };

  await Promise.all([
    fila.correr(trabalho("ocupa")),
    fila.correr(trabalho("sem-prioridade")),
    fila.correr(trabalho("urgente"), { prioridade: 1 }),
  ]);

  assert.deepStrictEqual(ordem, ["ocupa", "urgente", "sem-prioridade"]);
});

test("o valor volta para quem pediu", async () => {
  const fila = criarFilaLimitada({ limite: 2 });
  assert.strictEqual(await fila.correr(async () => "arquivo.mp4"), "arquivo.mp4");
});

// Um download que falha no meio da noite nao pode travar a fila inteira: era
// assim que o KJ ficava esperando a proxima musica que nunca vinha.
test("trabalho que falha nao prende a vaga nem os proximos", async () => {
  const fila = criarFilaLimitada({ limite: 1 });
  const feitos = [];

  const ruim = fila.correr(async () => { throw new Error("yt-dlp morreu"); });
  const bom = fila.correr(async () => { feitos.push("bom"); return "ok"; });

  await assert.rejects(() => ruim, /yt-dlp morreu/);
  assert.strictEqual(await bom, "ok");
  assert.deepStrictEqual(feitos, ["bom"]);
});

test("trabalho que estoura de forma sincrona tambem libera a vaga", async () => {
  const fila = criarFilaLimitada({ limite: 1 });
  await assert.rejects(() => fila.correr(() => { throw new Error("estourou"); }), /estourou/);
  assert.strictEqual(await fila.correr(async () => "seguinte"), "seguinte");
});

test("conta quantos rodam e quantos esperam", async () => {
  const fila = criarFilaLimitada({ limite: 1 });
  const p1 = fila.correr(async () => { await espera(20); });
  const p2 = fila.correr(async () => { await espera(5); });

  assert.strictEqual(fila.emCurso(), 1);
  assert.strictEqual(fila.esperando(), 1);
  await Promise.all([p1, p2]);
  assert.strictEqual(fila.emCurso(), 0);
  assert.strictEqual(fila.esperando(), 0);
});

test("limite invalido cai no padrao, nao em zero", async () => {
  for (const ruim of [0, -3, null, undefined, "dois", NaN]) {
    const fila = criarFilaLimitada({ limite: ruim });
    // Com limite zero nada rodaria nunca: um erro de configuracao nao pode
    // matar o download da casa.
    assert.strictEqual(await fila.correr(async () => "rodou"), "rodou", `limite ${ruim} travou a fila`);
  }
});
