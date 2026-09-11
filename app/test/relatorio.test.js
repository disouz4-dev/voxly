"use strict";

// Resumo permanente de uma noite, gravado ANTES de a faxina apagar a sessao.
//
// apagarSessao deleta fila, presencas e historico de uma vez. E o unico lugar
// que parecia guardar algo para sempre — historico/{uid}/apresentacoes — nunca
// recebeu nada: a regra exige que quem grava seja o proprio cantor, e quem grava
// e o host. Ou seja, toda noite ate aqui foi perdida por inteiro.

const test = require("node:test");
const assert = require("node:assert");
const { resumirSessao } = require("../src/relatorio");

const T = h => Date.parse(`2026-09-10T${h}:00-03:00`);

const SESSAO = {
  id: "2026-09-10-GGATRN",
  nomeCasa: "Rock Bar do Diego", codigo: "GGATRN",
  horarioInicio: T("20:00"), horarioTermino: T("23:59"),
};
const PRESENCAS = [
  { uid: "a", nomeArtistico: "Leo" },
  { uid: "b", nomeArtistico: "Mari Riff" },
  { uid: "c", nomeArtistico: "Tuca" },          // entrou e nao pediu nada
];
const FILA = [
  { cantorUid: "a", nomeArtistico: "Leo",       musica: "Tempo Perdido",     artista: "Legião Urbana", status: "cantada" },
  { cantorUid: "b", nomeArtistico: "Mari Riff", musica: "Bohemian Rhapsody", artista: "Queen",         status: "cantada" },
  { cantorUid: "a", nomeArtistico: "Leo",       musica: "Epitáfio",          artista: "Titãs",         status: "cancelada" },
  { cantorUid: "b", nomeArtistico: "Mari Riff", musica: "Enter Sandman",     artista: "Metallica",     status: "aguardando" },
];
const HISTORICO = [
  { cantorUid: "b", nomeArtistico: "Mari Riff", musica: "Bohemian Rhapsody", artista: "Queen",         horario: T("21:10") },
  { cantorUid: "a", nomeArtistico: "Leo",       musica: "Tempo Perdido",     artista: "Legião Urbana", horario: T("20:40"),
    duoCom: { nomeArtistico: "Tuca" } },
];

test("conta a noite", () => {
  const r = resumirSessao({ sessao: SESSAO, fila: FILA, presencas: PRESENCAS, historico: HISTORICO });
  assert.strictEqual(r.participantes, 3, "quem entrou conta, mesmo sem pedir");
  assert.strictEqual(r.cantaram, 2);
  assert.strictEqual(r.pedidos, 4);
  assert.strictEqual(r.cantadas, 2);
  assert.strictEqual(r.naoCantadas, 2, "cancelada e aguardando sobrando no fim da noite");
});

test("guarda a casa e o horario planejado", () => {
  const r = resumirSessao({ sessao: SESSAO, fila: [], presencas: [], historico: [] });
  assert.strictEqual(r.sessaoId, "2026-09-10-GGATRN");
  assert.strictEqual(r.nomeCasa, "Rock Bar do Diego");
  assert.strictEqual(r.inicioPlanejado, T("20:00"));
  assert.strictEqual(r.terminoPlanejado, T("23:59"));
});

test("as musicas cantadas saem na ordem em que foram cantadas", () => {
  const r = resumirSessao({ sessao: SESSAO, fila: FILA, presencas: PRESENCAS, historico: HISTORICO });
  assert.deepStrictEqual(r.musicas.map(m => m.musica), ["Tempo Perdido", "Bohemian Rhapsody"]);
  assert.strictEqual(r.musicas[0].cantor, "Leo");
  assert.strictEqual(r.musicas[0].dupla, "Tuca");
});

test("horario real da noite: primeira e ultima musica", () => {
  const r = resumirSessao({ sessao: SESSAO, fila: FILA, presencas: PRESENCAS, historico: HISTORICO });
  assert.strictEqual(r.primeiraMusica, T("20:40"));
  assert.strictEqual(r.ultimaMusica, T("21:10"));
});

test("placar por cantor: pediu e cantou", () => {
  const r = resumirSessao({ sessao: SESSAO, fila: FILA, presencas: PRESENCAS, historico: HISTORICO });
  const leo = r.cantores.find(c => c.nome === "Leo");
  const tuca = r.cantores.find(c => c.nome === "Tuca");
  assert.deepStrictEqual({ pediu: leo.pediu, cantou: leo.cantou }, { pediu: 2, cantou: 1 });
  assert.deepStrictEqual({ pediu: tuca.pediu, cantou: tuca.cantou }, { pediu: 0, cantou: 0 });
});

test("aceita Timestamp do Firestore, nao so milissegundos", () => {
  const ts = ms => ({ toDate: () => new Date(ms) });
  const r = resumirSessao({
    sessao: { ...SESSAO, horarioInicio: ts(T("20:00")) },
    fila: [], presencas: [],
    historico: [{ cantorUid: "a", nomeArtistico: "Leo", musica: "X", artista: "Y", horario: ts(T("22:00")) }],
  });
  assert.strictEqual(r.inicioPlanejado, T("20:00"));
  assert.strictEqual(r.primeiraMusica, T("22:00"));
});

test("noite vazia nao quebra", () => {
  const r = resumirSessao({ sessao: { id: "x" } });
  assert.strictEqual(r.participantes, 0);
  assert.strictEqual(r.cantadas, 0);
  assert.deepStrictEqual(r.musicas, []);
  assert.strictEqual(r.primeiraMusica, null);
});

test("cantor sem uid ainda e contado pelo nome", () => {
  // Cantor adicionado a mao pelo KJ nao tem conta: o uid e "manual_..." e ha
  // registros antigos sem uid nenhum. O nome e o que sobra para agrupar.
  const r = resumirSessao({
    sessao: { id: "x" },
    fila: [{ nomeArtistico: "Dona Cida", musica: "Livin' On A Prayer", status: "cantada" }],
    historico: [{ nomeArtistico: "Dona Cida", musica: "Livin' On A Prayer", horario: T("21:00") }],
  });
  assert.strictEqual(r.participantes, 1);
  assert.strictEqual(r.cantores[0].cantou, 1);
});
