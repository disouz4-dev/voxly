"use strict";

// A fila nao pode aceitar musica que nunca vai tocar.
//
// Show de 05/11, medido no diario: sessao marcada para acabar 01:00, e as 00:38
// havia 40 pedidos pendentes. Pela duracao real das 52 musicas da noite
// (mediana 4,3 min), a fila terminaria 03:31 — 2h30 depois do fim. Cabiam 4
// musicas; as outras 36 nao iam tocar.
//
// O dono, irritado e com razao: "mais uma vez a porra do limite da sessao nao
// foi respeitado, tem mais de uma hora de musicas alem do horario... eu fui
// explicito quanto a isso, isso gera a porra de um transtorno horrivel com os
// clientes". E: "ja e a segunda semana que falha a fila".
//
// A unica barreira que existia era `podePedirMusica`, que so pergunta "ja passou
// do fim?". Enquanto o relogio nao batia 01:00 ela liberava tudo, mesmo com
// 2h50 de fila na frente.
//
// A regra nova olha a PREVISAO: o pedido novo tem de conseguir COMECAR antes do
// fim da sessao. Comecar, nao terminar — a ultima musica da noite atravessar o
// horario e normal; o que nao pode e entrar quem so comecaria depois.

const test = require("node:test");
const assert = require("node:assert");
const { cabeOutraMusica } = require("../src/sessao-regras");

const min = n => n * 60 * 1000;
const AGORA = Date.UTC(2026, 10, 6, 3, 38);          // 00:38 em Sao Paulo
const FIM   = Date.UTC(2026, 10, 6, 4, 0);           // 01:00

test("o caso de 05/11: fila termina 03:31, sessao acaba 01:00 — nao cabe", () => {
  const r = cabeOutraMusica({
    termino: FIM,
    fimDaFila: AGORA + min(173),   // as 2h53 de fila que havia
    agora: AGORA,
  });
  assert.strictEqual(r.cabe, false);
  assert.ok(r.atrasoMin > 60, `o atraso medido foi ${r.atrasoMin} min — ele falou de "mais de uma hora"`);
});

test("fila curta: cabe", () => {
  const r = cabeOutraMusica({ termino: FIM, fimDaFila: AGORA + min(10), agora: AGORA });
  assert.strictEqual(r.cabe, true);
  assert.strictEqual(r.atrasoMin, 0);
});

test("fila vazia: o que vale e a hora de agora", () => {
  assert.strictEqual(cabeOutraMusica({ termino: FIM, fimDaFila: null, agora: AGORA }).cabe, true);
  // Depois do fim, nem com a fila vazia.
  assert.strictEqual(cabeOutraMusica({ termino: FIM, fimDaFila: null, agora: FIM + min(1) }).cabe, false);
});

test("fila que termina EXATAMENTE no fim ainda cabe (comeca em cima da hora)", () => {
  assert.strictEqual(cabeOutraMusica({ termino: FIM, fimDaFila: FIM, agora: AGORA }).cabe, true);
});

test("um minuto depois do fim nao cabe mais", () => {
  const r = cabeOutraMusica({ termino: FIM, fimDaFila: FIM + min(1), agora: AGORA });
  assert.strictEqual(r.cabe, false);
  assert.strictEqual(r.atrasoMin, 1);
});

test("fila que terminaria antes de agora nao adianta o relogio", () => {
  // Previsao velha, ou fila que esvaziou: quem chega agora comeca agora.
  const r = cabeOutraMusica({ termino: FIM, fimDaFila: AGORA - min(90), agora: AGORA });
  assert.strictEqual(r.cabe, true);
});

test("sessao sem termino declarado aceita (sessao antiga)", () => {
  assert.strictEqual(cabeOutraMusica({ termino: null, fimDaFila: AGORA + min(500), agora: AGORA }).cabe, true);
});

test("previsao desconhecida nao barra ninguem", () => {
  // Sem a previsao publicada pela Gerencia, a regra nao pode inventar: barrar
  // por engano tira a musica de quem tinha direito.
  assert.strictEqual(cabeOutraMusica({ termino: FIM, fimDaFila: undefined, agora: AGORA }).cabe, true);
  assert.strictEqual(cabeOutraMusica({ termino: FIM, fimDaFila: NaN, agora: AGORA }).cabe, true);
});

test("aceita Timestamp do Firestore e Date, nao so numero", () => {
  const comoTimestamp = ms => ({ toDate: () => new Date(ms) });
  const r = cabeOutraMusica({
    termino: comoTimestamp(FIM),
    fimDaFila: new Date(AGORA + min(173)),
    agora: AGORA,
  });
  assert.strictEqual(r.cabe, false);
});

test("quanto falta da noite, em minutos", () => {
  const r = cabeOutraMusica({ termino: FIM, fimDaFila: AGORA + min(10), agora: AGORA });
  assert.strictEqual(r.restamMin, 22, "de 00:38 para 01:00 sao 22 minutos");
});
