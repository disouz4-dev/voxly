"use strict";

// Uma só execução por chave, mesmo com vários pedindo ao mesmo tempo.
//
// Show de 22/10: a busca no YouTube saía duplicada e chegou a 20 processos
// yt-dlp empilhados, com nada escrevendo em disco. A causa não era ouvinte
// duplicado: são TRÊS portas de entrada para a mesma busca — o KJ clicando
// "Procurar versões", o pedido de busca do app do cantor, e o download
// automático quando o item entra na fila. Cada uma tinha a sua própria guarda,
// com chave diferente (`_procurando` por item, `_buscasAtendidas` por doc,
// `_baixando` por item), então nenhuma via a outra.
//
// A tranca tem de ficar onde os três passam: o processo principal. Quem chega
// depois RECEBE A MESMA promessa, em vez de abrir outro processo.

const test = require("node:test");
const assert = require("node:assert");
const { criarRegistroEmCurso } = require("../src/em-curso");

const espera = (ms) => new Promise(r => setTimeout(r, ms));

test("dois pedidos ao mesmo tempo viram UMA execucao", async () => {
  const reg = criarRegistroEmCurso();
  let execucoes = 0;
  const trabalho = async () => { execucoes++; await espera(20); return "resultado"; };

  const [a, b] = await Promise.all([reg.obter("mesma", trabalho), reg.obter("mesma", trabalho)]);

  assert.strictEqual(execucoes, 1, "o segundo tinha que pegar a promessa do primeiro");
  assert.strictEqual(a, "resultado");
  assert.strictEqual(b, "resultado");
});

test("chaves diferentes rodam em paralelo, cada uma a sua", async () => {
  const reg = criarRegistroEmCurso();
  let execucoes = 0;
  const trabalho = async () => { execucoes++; await espera(10); return execucoes; };

  await Promise.all([reg.obter("uma", trabalho), reg.obter("outra", trabalho)]);

  assert.strictEqual(execucoes, 2);
});

// Durante o show o KJ clica de novo em segundos. Repetir a busca inteira (162 s
// medidos) para dar a mesma resposta é o que empilhava processo.
test("repetir pouco depois reaproveita o resultado", async () => {
  const reg = criarRegistroEmCurso({ validadeMs: 1000 });
  let execucoes = 0;
  const trabalho = async () => { execucoes++; return "cache"; };

  assert.strictEqual(await reg.obter("k", trabalho), "cache");
  assert.strictEqual(await reg.obter("k", trabalho), "cache");
  assert.strictEqual(execucoes, 1);
});

test("passada a validade, busca de novo", async () => {
  const reg = criarRegistroEmCurso({ validadeMs: 15 });
  let execucoes = 0;
  const trabalho = async () => { execucoes++; return execucoes; };

  await reg.obter("k", trabalho);
  await espera(30);
  await reg.obter("k", trabalho);

  assert.strictEqual(execucoes, 2);
});

// Guardar a falha faria uma queda de rede de um segundo virar "sem karaokê"
// pelos minutos seguintes, com o KJ no sufoco achando que a música não existe.
test("erro nao fica guardado: a proxima tentativa roda de novo", async () => {
  const reg = criarRegistroEmCurso({ validadeMs: 10000 });
  let execucoes = 0;
  const trabalho = async () => {
    execucoes++;
    if (execucoes === 1) throw new Error("rede caiu");
    return "deu certo";
  };

  await assert.rejects(() => reg.obter("k", trabalho), /rede caiu/);
  assert.strictEqual(await reg.obter("k", trabalho), "deu certo");
  assert.strictEqual(execucoes, 2);
});

test("quem espera junto recebe o mesmo erro", async () => {
  const reg = criarRegistroEmCurso();
  const trabalho = async () => { await espera(10); throw new Error("falhou"); };

  const [a, b] = await Promise.allSettled([reg.obter("k", trabalho), reg.obter("k", trabalho)]);

  assert.strictEqual(a.status, "rejected");
  assert.strictEqual(b.status, "rejected");
  assert.match(b.reason.message, /falhou/);
});

test("sem validade declarada, so junta quem pede ao mesmo tempo", async () => {
  const reg = criarRegistroEmCurso();   // validade 0: nada de cache
  let execucoes = 0;
  const trabalho = async () => { execucoes++; return execucoes; };

  await reg.obter("k", trabalho);
  await reg.obter("k", trabalho);

  assert.strictEqual(execucoes, 2, "terminada a primeira, a segunda roda");
});

test("chave vazia nao agrupa coisas diferentes", async () => {
  const reg = criarRegistroEmCurso();
  let execucoes = 0;
  const trabalho = async () => { execucoes++; await espera(5); return execucoes; };

  await Promise.all([reg.obter("", trabalho), reg.obter(null, trabalho), reg.obter(undefined, trabalho)]);

  assert.strictEqual(execucoes, 3, "sem chave, cada pedido e por conta propria");
});

test("diz quantos estao em curso, para a tela e o teto saberem", async () => {
  const reg = criarRegistroEmCurso();
  assert.strictEqual(reg.emCurso(), 0);
  const p = reg.obter("k", async () => { await espera(20); return 1; });
  assert.strictEqual(reg.emCurso(), 1);
  await p;
  assert.strictEqual(reg.emCurso(), 0, "terminou, saiu da conta");
});
