"use strict";

// Filtro das sugestoes do iTunes/Deezer. Vivia copiado, quase letra por letra,
// na Gerencia e no app do cantor — e a copia do cantor ja tinha divergido
// (nao pulava faixa sem nome). Agora e um arquivo so, e estes testes fixam o
// comportamento dos dois lados.

const test = require("node:test");
const assert = require("node:assert");
const { normalizar, palavras } = require("../src/texto");
const { filtrarSugestoes, RE_VERSAO_INDESEJADA } = require("../src/sugestoes");

const faixa = (artistName, trackName) => ({ artistName, trackName });

test("normalizar tira acento, caixa e pontuação", () => {
  assert.strictEqual(normalizar("  Legião   Urbana — Índios! "), "legiao urbana indios");
});

test("apóstrofo some em vez de partir a palavra: \"don't\" e \"dont\" são iguais", () => {
  assert.strictEqual(normalizar("Don't Stop"), "dont stop");
  assert.strictEqual(normalizar("Don’t Stop"), "dont stop");
  assert.strictEqual(normalizar("Donʼt Stop"), "dont stop");
});

test("palavras separa o texto normalizado", () => {
  assert.deepStrictEqual(palavras("It's My Life (Bon Jovi)"), ["its", "my", "life", "bon", "jovi"]);
  assert.deepStrictEqual(palavras(""), []);
  assert.deepStrictEqual(palavras(null), []);
});

test("resultado tem que conter todas as palavras digitadas, entre artista e música", () => {
  // Buscar "scarlet periphery" trazia qualquer musica com "scarlet".
  const r = filtrarSugestoes("scarlet periphery", [
    faixa("Scarlet Pleasure", "Deja Vu"),
    faixa("Periphery", "Scarlet"),
  ]);
  assert.deepStrictEqual(r, [{ artista: "Periphery", musica: "Scarlet" }]);
});

test("ao vivo, remix, acústico, karaokê e afins ficam de fora", () => {
  const r = filtrarSugestoes("creep", [
    faixa("Radiohead", "Creep (Live at Glastonbury)"),
    faixa("Radiohead", "Creep - Acoustic"),
    faixa("Radiohead", "Creep (Remastered 2009)"),
    faixa("Karaoke Hits", "Creep (Karaoke Version)"),
    faixa("Radiohead", "Creep"),
  ]);
  assert.deepStrictEqual(r, [{ artista: "Radiohead", musica: "Creep" }]);
});

test("a mesma faixa repetida em vários álbuns aparece uma vez", () => {
  const r = filtrarSugestoes("zombie", [
    faixa("The Cranberries", "Zombie"),
    faixa("The Cranberries", "Zombie"),
    faixa("the cranberries", "ZOMBIE"),
  ]);
  assert.strictEqual(r.length, 1);
});

test("no máximo cinco sugestões", () => {
  const muitas = Array.from({ length: 12 }, (_, i) => faixa("Queen", `Song ${i}`));
  assert.strictEqual(filtrarSugestoes("queen", muitas).length, 5);
  assert.strictEqual(filtrarSugestoes("queen", muitas, { limite: 3 }).length, 3);
});

test("faixa sem nome é pulada", () => {
  assert.deepStrictEqual(filtrarSugestoes("queen", [faixa("Queen", ""), faixa("Queen", null)]), []);
});

test("quem digita sem apóstrofo acha a música com apóstrofo", () => {
  const r = filtrarSugestoes("dont stop me", [faixa("Queen", "Don't Stop Me Now")]);
  assert.deepStrictEqual(r, [{ artista: "Queen", musica: "Don't Stop Me Now" }]);
});

test("palavras de até duas letras não filtram (\"u2\", \"of\" não derrubam a busca)", () => {
  const r = filtrarSugestoes("u2 one", [faixa("U2", "One")]);
  assert.strictEqual(r.length, 1);
});

test("resposta vazia ou torta vira lista vazia", () => {
  assert.deepStrictEqual(filtrarSugestoes("x", null), []);
  assert.deepStrictEqual(filtrarSugestoes("x", [null, "lixo"]), []);
});

test("a regra de versão indesejada não pega palavra no meio de outra", () => {
  // "Alive" contem "live"; "Editor" contem "edit".
  assert.ok(!RE_VERSAO_INDESEJADA.test("Alive"));
  assert.ok(!RE_VERSAO_INDESEJADA.test("Editor"));
  assert.ok(RE_VERSAO_INDESEJADA.test("Alive (Live)"));
});
