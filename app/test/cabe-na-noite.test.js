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
// A regra, dita por ele em 06/11: "a ultima musica da fila pode furar ate 5min
// do limite imposto; se tiver faltando 1 min para preencher o tempo, e alguem
// colocar uma musica de 7 min ela nao entra, mas se colocar uma de 4 min ela
// entra".
//
// Ou seja: o que tem teto e o ATRASO DO FIM da musica, nao a hora de comecar.
//   fim_da_musica = inicio_previsto + duracao
//   entra se fim_da_musica <= termino + 5 min
//
// Com 1 min faltando: musica de 7 min termina 6 min depois do fim (passa dos 5,
// nao entra); a de 4 min termina 3 min depois (entra).

const test = require("node:test");
const assert = require("node:assert");
const { cabeOutraMusica, TOLERANCIA_MS } = require("../src/sessao-regras");

const min = n => n * 60 * 1000;
const AGORA = Date.UTC(2026, 10, 6, 3, 38);          // 00:38 em Sao Paulo
const FIM   = Date.UTC(2026, 10, 6, 4, 0);           // 01:00

test("a tolerancia da regra e a mesma de 5 min que ja existia", () => {
  assert.strictEqual(TOLERANCIA_MS, min(5));
});

test("o exemplo dele: falta 1 min, a de 7 min NAO entra", () => {
  const r = cabeOutraMusica({
    termino: FIM,
    fimDaFila: FIM - min(1),   // a fila termina 1 min antes do limite
    duracaoS: 7 * 60,
    agora: AGORA,
  });
  assert.strictEqual(r.cabe, false);
  assert.strictEqual(r.atrasoMin, 6, "7 min comecando a 1 do fim terminam 6 depois");
});

test("o exemplo dele: falta 1 min, a de 4 min ENTRA", () => {
  const r = cabeOutraMusica({
    termino: FIM,
    fimDaFila: FIM - min(1),
    duracaoS: 4 * 60,
    agora: AGORA,
  });
  assert.strictEqual(r.cabe, true, "termina 3 min depois do fim, dentro dos 5");
});

test("furar exatamente 5 min ainda entra; 5 min e um segundo, nao", () => {
  const base = { termino: FIM, fimDaFila: FIM, agora: AGORA };
  assert.strictEqual(cabeOutraMusica({ ...base, duracaoS: 5 * 60 }).cabe, true);
  assert.strictEqual(cabeOutraMusica({ ...base, duracaoS: 5 * 60 + 1 }).cabe, false);
});

test("o caso de 05/11: fila que termina 03:31 nao aceita nem musica curta", () => {
  const r = cabeOutraMusica({
    termino: FIM,
    fimDaFila: AGORA + min(173),   // as 2h53 de fila que havia
    duracaoS: 3 * 60,
    agora: AGORA,
  });
  assert.strictEqual(r.cabe, false);
  assert.ok(r.atrasoMin > 60, `atraso medido: ${r.atrasoMin} min — ele falou de "mais de uma hora"`);
});

test("fila curta: entra, com atraso zero", () => {
  const r = cabeOutraMusica({ termino: FIM, fimDaFila: AGORA + min(5), duracaoS: 4 * 60, agora: AGORA });
  assert.strictEqual(r.cabe, true);
  assert.strictEqual(r.atrasoMin, 0);
});

test("fila vazia: conta a partir de agora", () => {
  // 22 min de noite pela frente e uma musica de 4 min: entra.
  assert.strictEqual(cabeOutraMusica({ termino: FIM, fimDaFila: null, duracaoS: 4 * 60, agora: AGORA }).cabe, true);
  // Uma hora depois do fim, nao entra nem a curta.
  assert.strictEqual(cabeOutraMusica({ termino: FIM, fimDaFila: null, duracaoS: 4 * 60, agora: FIM + min(60) }).cabe, false);
});

test("fila que terminaria antes de agora nao adianta o relogio", () => {
  const r = cabeOutraMusica({ termino: FIM, fimDaFila: AGORA - min(90), duracaoS: 4 * 60, agora: AGORA });
  assert.strictEqual(r.cabe, true);
});

test("sem duracao conhecida, vale a media de uma faixa de karaoke", () => {
  // O catalogo nao traz duracao de toda musica. A media (PADRAO_S, 4 min) e a
  // mesma que a previsao da fila usa — e, pelo exemplo dele, 4 min entra.
  const r = cabeOutraMusica({ termino: FIM, fimDaFila: FIM - min(1), agora: AGORA });
  assert.strictEqual(r.cabe, true);
  const r2 = cabeOutraMusica({ termino: FIM, fimDaFila: FIM - min(1), duracaoS: null, agora: AGORA });
  assert.strictEqual(r2.cabe, true);
});

test("sessao sem termino declarado aceita (sessao antiga)", () => {
  assert.strictEqual(cabeOutraMusica({ termino: null, fimDaFila: AGORA + min(500), duracaoS: 9 * 60, agora: AGORA }).cabe, true);
});

test("sem previsao da fila, vale so o relogio", () => {
  // A Gerencia ainda nao publicou: nao se barra por engano quem tem direito.
  assert.strictEqual(cabeOutraMusica({ termino: FIM, fimDaFila: undefined, duracaoS: 4 * 60, agora: AGORA }).cabe, true);
  assert.strictEqual(cabeOutraMusica({ termino: FIM, fimDaFila: NaN, duracaoS: 4 * 60, agora: AGORA }).cabe, true);
});

test("duracao torta nao derruba a conta: cai na media", () => {
  for (const d of [0, -30, "sete minutos", Infinity]) {
    const r = cabeOutraMusica({ termino: FIM, fimDaFila: FIM - min(1), duracaoS: d, agora: AGORA });
    assert.strictEqual(r.cabe, true, `duracaoS=${d} tinha de cair na media de 4 min`);
  }
});

test("aceita Timestamp do Firestore e Date, nao so numero", () => {
  const comoTimestamp = ms => ({ toDate: () => new Date(ms) });
  const r = cabeOutraMusica({
    termino: comoTimestamp(FIM),
    fimDaFila: new Date(AGORA + min(173)),
    duracaoS: 4 * 60,
    agora: AGORA,
  });
  assert.strictEqual(r.cabe, false);
});

test("quanto falta da noite, em minutos", () => {
  const r = cabeOutraMusica({ termino: FIM, fimDaFila: AGORA + min(10), duracaoS: 4 * 60, agora: AGORA });
  assert.strictEqual(r.restamMin, 22, "de 00:38 para 01:00 sao 22 minutos");
});
