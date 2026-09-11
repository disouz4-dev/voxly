"use strict";

// Diario do Voxly: tudo que acontece numa noite, num arquivo por dia. Nasceu
// do "as musicas sumiram" de 11/09, que nao teve como ser explicado depois:
// nada registrava quem tirou os pedidos da fila, nem de qual maquina.

const test = require("node:test");
const assert = require("node:assert");
const { linhaDoDiario, nomeDoArquivo, arquivosVencidos, diferencas } = require("../src/diario");

const T = Date.parse("2026-09-11T22:15:30.250-03:00");

test("uma linha é um JSON com hora, origem, evento e dados", () => {
  const l = JSON.parse(linhaDoDiario({ t: T, origem: "gerencia", evento: "fila.pedido", dados: { musica: "Chop Suey!" } }));
  assert.strictEqual(l.origem, "gerencia");
  assert.strictEqual(l.evento, "fila.pedido");
  assert.strictEqual(l.dados.musica, "Chop Suey!");
  assert.strictEqual(l.t, T);
  assert.match(l.hora, /^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  assert.strictEqual(l.nivel, "info");
});

test("uma linha nunca quebra: sem quebra de linha dentro", () => {
  const l = linhaDoDiario({ t: T, origem: "palco", evento: "console", dados: { msg: "a\nb\r\nc" } });
  assert.ok(!l.includes("\n"));
});

test("erro vira mensagem e pilha, não {}", () => {
  const l = JSON.parse(linhaDoDiario({ t: T, origem: "main", evento: "erro", dados: { erro: new Error("sem rede") } }));
  assert.strictEqual(l.dados.erro.mensagem, "sem rede");
  assert.ok(l.dados.erro.pilha);
});

test("dado circular ou gigante não derruba o diário", () => {
  const a = { nome: "x" }; a.eu = a;
  const l = JSON.parse(linhaDoDiario({ t: T, origem: "main", evento: "x", dados: { a, texto: "y".repeat(10000) } }));
  assert.strictEqual(l.dados.a.eu, "[circular]");
  assert.ok(l.dados.texto.length < 2100);
});

test("arquivo do dia pelo relógio local", () => {
  assert.strictEqual(nomeDoArquivo(new Date(2026, 8, 11, 23, 59)), "voxly-2026-09-11.jsonl");
  assert.strictEqual(nomeDoArquivo(new Date(2026, 8, 12, 0, 1)), "voxly-2026-09-12.jsonl");
});

test("guarda 30 dias: o resto vai embora, e só arquivos do diário", () => {
  const hoje = new Date(2026, 8, 11);
  const nomes = ["voxly-2026-09-11.jsonl", "voxly-2026-08-13.jsonl", "voxly-2026-08-12.jsonl",
                 "voxly-2025-01-01.jsonl", "outra-coisa.txt", "voxly-lixo.jsonl"];
  assert.deepStrictEqual(arquivosVencidos(nomes, hoje, 30).sort(), ["voxly-2025-01-01.jsonl", "voxly-2026-08-12.jsonl"]);
});

test("diferenças entre duas versões de um pedido: só o que mudou", () => {
  const antes = { status: "aguardando", ordemFila: 3, musica: "Toxicity", tipo: "normal" };
  const depois = { status: "confirmando", ordemFila: 3, musica: "Toxicity", tipo: "normal", confirmandoAte: 5 };
  assert.deepStrictEqual(diferencas(antes, depois), {
    status: ["aguardando", "confirmando"], confirmandoAte: [undefined, 5],
  });
});

test("diferenças de Timestamp do Firestore comparam pelo valor", () => {
  const ts = ms => ({ toMillis: () => ms, toDate: () => new Date(ms) });
  assert.deepStrictEqual(diferencas({ criadoEm: ts(1) }, { criadoEm: ts(1) }), {});
});
