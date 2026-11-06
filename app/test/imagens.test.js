"use strict";

// As imagens do acervo: foto do artista e capa da música.
//
// Decisão dele em 06/11: "a cópia das imagens tem que ficar no Firebase, não
// tem que nada ficar local". Então a imagem vai DENTRO do documento que já
// existe (`artistas/{slug}`, `capas/{chave}`), pequena, em base64 — e o celular
// só lê do banco: nenhuma chamada ao iTunes, nada no HD, nada no cache do
// aparelho.
//
// A escolha da arte no resultado do iTunes vivia copiada em dois lugares
// (main.js e profile.html) e era exatamente onde o defeito morava: o parâmetro
// era `entity=musicArtist`, que NUNCA devolve `artworkUrl100`. Medido em 06/11
// com Pitty, Seether e Legião Urbana: zero resultados com arte. Aqui a regra
// fica num lugar só, testada.

const test = require("node:test");
const assert = require("node:assert");
const {
  escolherArteDeArtista, escolherArteDeMusica, urlDaArteEm,
  precisaDeImagem, tamanhoDoDataUrl, imagemCabe, LIMITE_IMAGEM_BYTES,
} = require("../src/imagens");

const arte = n => `https://is1-ssl.mzstatic.com/image/thumb/Music/${n}/100x100bb.jpg`;

test("escolhe a arte do artista cujo nome casa exatamente", () => {
  const r = [
    { artistName: "Seether Tribute", artworkUrl100: arte(1) },
    { artistName: "Seether", artworkUrl100: arte(2) },
  ];
  assert.strictEqual(escolherArteDeArtista(r, "Seether"), arte(2));
});

test("sem nome exato, usa o primeiro COM arte", () => {
  const r = [
    { artistName: "Outro", artworkUrl100: null },
    { artistName: "Outro 2", artworkUrl100: arte(3) },
  ];
  assert.strictEqual(escolherArteDeArtista(r, "Seether"), arte(3));
});

test("o caso do defeito: nenhum resultado com arte devolve null", () => {
  // E o que `entity=musicArtist` devolve sempre. Antes isso passava calado por
  // "esse artista nao tem foto".
  const r = [{ artistName: "Pitty" }, { artistName: "Pitty", artworkUrl100: "" }];
  assert.strictEqual(escolherArteDeArtista(r, "Pitty"), null);
});

test("nome do artista ignora acento e caixa", () => {
  const r = [{ artistName: "Legião Urbana", artworkUrl100: arte(4) }];
  assert.strictEqual(escolherArteDeArtista(r, "legiao urbana"), arte(4));
});

test("capa da música prefere o título igual", () => {
  const r = [
    { trackName: "Broken (Live)", artworkUrl100: arte(5) },
    { trackName: "Broken", artworkUrl100: arte(6) },
  ];
  assert.strictEqual(escolherArteDeMusica(r, "Broken"), arte(6));
});

test("capa da música aceita o título que contém o pedido", () => {
  // "Broken (feat. Amy Lee)" e o que o iTunes devolve para "Seether Broken".
  const r = [{ trackName: "Broken (feat. Amy Lee)", artworkUrl100: arte(7) }];
  assert.strictEqual(escolherArteDeMusica(r, "Broken"), arte(7));
});

test("capa: sem nenhum título parecido, o primeiro com arte serve", () => {
  const r = [{ trackName: "Outra coisa", artworkUrl100: arte(8) }];
  assert.strictEqual(escolherArteDeMusica(r, "Broken"), arte(8));
});

test("lista vazia, nula ou torta não estoura", () => {
  for (const r of [[], null, undefined, "nao e lista", [null, undefined]]) {
    assert.strictEqual(escolherArteDeArtista(r, "X"), null);
    assert.strictEqual(escolherArteDeMusica(r, "X"), null);
  }
});

test("o tamanho da arte é trocado na URL", () => {
  assert.strictEqual(urlDaArteEm(arte(9), 120),
    "https://is1-ssl.mzstatic.com/image/thumb/Music/9/120x120bb.jpg");
});

test("URL que não tem o padrão de tamanho volta como está", () => {
  const u = "https://exemplo/arte.jpg";
  assert.strictEqual(urlDaArteEm(u, 120), u);
  assert.strictEqual(urlDaArteEm(null, 120), null);
});

test("documento sem imagem precisa de imagem", () => {
  assert.strictEqual(precisaDeImagem(null), true);
  assert.strictEqual(precisaDeImagem({}), true);
  assert.strictEqual(precisaDeImagem({ img: "" }), true);
});

test("documento com imagem da regra atual não é pedido de novo", () => {
  // A regra entra desde 06/11: imagem de regra anterior volta para a fila, e
  // isso tem teste proprio mais abaixo.
  assert.strictEqual(precisaDeImagem({
    img: "data:image/jpeg;base64,/9j/4AAQ", regra: require("../src/imagens").REGRA_IMAGEM,
  }), false);
});

test("documento marcado como SEM arte não é pedido de novo", () => {
  // Artista que o iTunes nao tem: marca-se e nao se insiste a cada abertura do
  // acervo, senao sao centenas de consultas por noite para nada.
  assert.strictEqual(precisaDeImagem({
    img: null, semArte: true, regra: require("../src/imagens").REGRA_IMAGEM,
  }), false);
});

test("tamanho real do base64, não o da string", () => {
  // 4 caracteres de base64 = 3 bytes.
  assert.strictEqual(tamanhoDoDataUrl("data:image/jpeg;base64,AAAA"), 3);
  assert.strictEqual(tamanhoDoDataUrl("data:image/jpeg;base64,AAAAAAAA"), 6);
  assert.strictEqual(tamanhoDoDataUrl("AAAA"), 0, "sem o cabecalho data: nao conta");
  assert.strictEqual(tamanhoDoDataUrl(null), 0);
});

test("imagem grande não entra no documento", () => {
  // O documento do Firestore tem teto de 1 MB e precisa caber com o resto.
  const grande = "data:image/jpeg;base64," + "A".repeat(Math.ceil(LIMITE_IMAGEM_BYTES * 4 / 3) + 100);
  assert.strictEqual(imagemCabe(grande), false);
  const pequena = "data:image/jpeg;base64," + "A".repeat(4000);
  assert.strictEqual(imagemCabe(pequena), true);
});

test("o limite da imagem é bem menor que o do documento", () => {
  assert.ok(LIMITE_IMAGEM_BYTES < 1048576 / 4,
    `${LIMITE_IMAGEM_BYTES} bytes — tem de sobrar folga no documento de 1 MB`);
});

// ── As chaves dos documentos ──────────────────────────────
// A chave e usada nos DOIS lados: a Gerencia grava, o celular le. Enquanto
// estavam duplicadas, a do artista saia "seether__" de um lado e "seether" do
// outro — a Gerencia gravava num documento e o celular procurava em outro.
// Pego no teste de 06/11, lendo o documento de volta depois de gravar.

const { slugDoNome, chaveDoArtista, chaveDaCapa } = require("../src/imagens");

test("a chave do artista nao leva separador no fim", () => {
  assert.strictEqual(chaveDoArtista("Seether"), "seether");
  assert.notStrictEqual(chaveDoArtista("Seether"), "seether__");
});

test("a chave da capa junta artista e musica", () => {
  assert.strictEqual(chaveDaCapa("Seether", "Broken"), "seether__broken");
});

test("acento, caixa e pontuacao saem da chave", () => {
  assert.strictEqual(chaveDoArtista("Legião Urbana"), "legiao_urbana");
  assert.strictEqual(chaveDaCapa("Pitty", "Me Adora!"), "pitty__me_adora");
  assert.strictEqual(chaveDaCapa("System of a Down", "N.I.B"), "system_of_a_down__n_i_b");
});

test("nome vazio, nulo ou so pontuacao nao estoura", () => {
  assert.strictEqual(slugDoNome(null), "");
  assert.strictEqual(slugDoNome("!!!"), "");
  assert.strictEqual(chaveDaCapa("", ""), "__");
});

test("a chave e estavel: o mesmo nome da sempre o mesmo documento", () => {
  // E o que garante que a Gerencia e o celular se encontrem.
  for (const n of ["Seether", "seether", "SEETHER", " Seether "]) {
    assert.strictEqual(chaveDoArtista(n), "seether", `variacao ${JSON.stringify(n)}`);
  }
});

// ── O canal de karaoke no titulo ──────────────────────────
// Achado por ele em 06/11: "duas musicas do Blink 182 trouxeram thumbnails dos
// canais de karaoke e nao dos albuns". A causa esta no diario do mesmo dia: o
// acervo guarda o canal colado no nome da musica —
//   {"musica": "Highway To Hell - Karaoke Master", "artista": "ACDC"}
// — e era esse texto que ia inteiro para o iTunes. Pedir
// "ACDC Highway To Hell - Karaoke Master" devolve a compilacao do canal, e a
// capa da compilacao e a arte do canal. Duas defesas: limpar o titulo antes de
// perguntar, e RECUSAR resultado de karaoke mesmo assim ("eu quero a foto do
// album da musica. Nunca" a do canal).
//
// `semCanal` (identificacao.js) nao serve aqui: ele precisa saber o nome do
// canal, que so existe no momento do download. Aqui a regra e pelo conteudo.

const {
  tituloLimpo, ehDeKaraoke, termoDaCapa,
} = require("../src/imagens");

test("o canal de karaoke sai do fim do titulo", () => {
  const casos = [
    ["Highway To Hell - Karaoke Master", "Highway To Hell"],
    ["Broken - PARTY TYME KARAOKE CHANNEL", "Broken"],
    ["Caramel - KARAOKE BALKA", "Caramel"],
    ["Jeremy - Vocal Hero Karaoke Rock", "Jeremy"],
    ["I Dont Want To Miss a Thing - Zoom Karaoke Official", "I Dont Want To Miss a Thing"],
    ["Dont Stop Believin - CC Karaoke X", "Dont Stop Believin"],
    ["Duvet - Lily Karaoke", "Duvet"],
    ["Beggin' - KaraFun Karaoke", "Beggin'"],
  ];
  for (const [bruto, limpo] of casos) {
    assert.strictEqual(tituloLimpo(bruto), limpo, `bruto: ${bruto}`);
  }
});

test("titulo sem canal nenhum fica como esta", () => {
  for (const t of ["Hypnotize", "Sou Favela", "Você Me Faz Tão Bem", "Evidências",
                   "Don't Look Back in Anger", "All the Small Things"]) {
    assert.strictEqual(tituloLimpo(t), t);
  }
});

test("hifen que faz parte do nome da musica nao e cortado", () => {
  // O corte so acontece quando o trecho do fim fala de karaoke.
  assert.strictEqual(tituloLimpo("Love Me Do - Remastered 2009"), "Love Me Do - Remastered 2009");
  assert.strictEqual(tituloLimpo("Enter Sandman - Metallica - Sing King Karaoke"),
    "Enter Sandman - Metallica");
});

test("parenteses de versao karaoke saem; os outros ficam", () => {
  assert.strictEqual(tituloLimpo("Broken (Karaoke Version)"), "Broken");
  assert.strictEqual(tituloLimpo("Broken (feat. Amy Lee)"), "Broken (feat. Amy Lee)");
});

test("titulo que e SO o nome do canal nao fica vazio", () => {
  // Melhor perguntar algo torto que perguntar nada.
  assert.strictEqual(tituloLimpo("Karaoke Master"), "Karaoke Master");
});

test("titulo nulo, vazio ou torto nao estoura", () => {
  assert.strictEqual(tituloLimpo(null), "");
  assert.strictEqual(tituloLimpo(""), "");
  assert.strictEqual(tituloLimpo(42), "42");
});

test("a chave da capa usa o titulo limpo, entao versoes do mesmo som dividem a arte", () => {
  // Isso tambem faz a Gerencia, o celular e a chamada do Palco se encontrarem
  // sem cada um ter de lembrar de limpar o texto.
  const a = chaveDaCapa("Seether", "Broken - PARTY TYME KARAOKE CHANNEL");
  const b = chaveDaCapa("Seether", "Broken - KaraFun Karaoke");
  assert.strictEqual(a, "seether__broken");
  assert.strictEqual(a, b);
});

test("resultado de canal de karaoke e reconhecido", () => {
  assert.strictEqual(ehDeKaraoke({ artistName: "Party Tyme Karaoke" }), true);
  assert.strictEqual(ehDeKaraoke({ collectionName: "Karaoke Classics, Vol. 3" }), true);
  assert.strictEqual(ehDeKaraoke({ trackName: "Broken (Karaoke Version)" }), true);
  assert.strictEqual(ehDeKaraoke({ artistName: "The Karaoke Channel" }), true);
  assert.strictEqual(ehDeKaraoke({ artistName: "Seether", collectionName: "Disclaimer II",
                                   trackName: "Broken" }), false);
});

test("a capa NUNCA vem de uma compilacao de karaoke", () => {
  // O pedido dele, textual: "eu quero a foto do album da musica. Nunca" a do
  // canal. Entao se o unico resultado com arte for de karaoke, nao ha arte.
  const r = [
    { trackName: "Broken", artistName: "Party Tyme Karaoke",
      collectionName: "Karaoke Hits", artworkUrl100: arte(20) },
  ];
  assert.strictEqual(escolherArteDeMusica(r, "Broken"), null);
});

test("entre a compilacao de karaoke e o album de verdade, vence o album", () => {
  const r = [
    { trackName: "Broken", artistName: "Karaoke Master", artworkUrl100: arte(21) },
    { trackName: "Broken", artistName: "Seether", collectionName: "Disclaimer II",
      artworkUrl100: arte(22) },
  ];
  assert.strictEqual(escolherArteDeMusica(r, "Broken"), arte(22));
});

test("a foto do artista tambem recusa canal de karaoke", () => {
  const r = [{ artistName: "Seether Karaoke Tribute", artworkUrl100: arte(23) }];
  assert.strictEqual(escolherArteDeArtista(r, "Seether"), null);
});

test("a arte casa com o titulo limpo, nao com o bruto", () => {
  // O iTunes devolve "Broken"; o acervo pede
  // "Broken - PARTY TYME KARAOKE CHANNEL". Sem limpar, nunca ha casamento
  // exato e caia-se no primeiro resultado qualquer.
  const r = [
    { trackName: "Broken (Live)", artistName: "Seether", artworkUrl100: arte(24) },
    { trackName: "Broken", artistName: "Seether", artworkUrl100: arte(25) },
  ];
  assert.strictEqual(escolherArteDeMusica(r, "Broken - PARTY TYME KARAOKE CHANNEL"), arte(25));
});

test("o termo da consulta sai limpo e num lugar so", () => {
  assert.strictEqual(termoDaCapa("ACDC", "Highway To Hell - Karaoke Master"),
    "ACDC Highway To Hell");
  assert.strictEqual(termoDaCapa("Seether", "Broken"), "Seether Broken");
  assert.strictEqual(termoDaCapa("", "Broken"), "Broken");
});

// ── A regra com que a imagem foi buscada ──────────────────
// As capas gravadas antes de 06/11 vieram de consulta suja (com o canal de
// karaoke no titulo) e sem recusar compilacao de karaoke. Para a maioria a
// chave mudou junto com a limpeza, e o documento velho fica orfao — mas musica
// sem sufixo ("Hypnotize") mantem a chave e ficaria com a arte errada para
// sempre, porque `precisaDeImagem` responderia "ja tem". Por isso o documento
// carrega a versao da regra que o produziu.
const { REGRA_IMAGEM } = require("../src/imagens");

test("imagem gravada pela regra atual nao e buscada de novo", () => {
  assert.strictEqual(precisaDeImagem({ img: "data:image/jpeg;base64,/9j/4AAQ", regra: REGRA_IMAGEM }), false);
});

test("imagem de regra antiga (ou sem regra) e buscada de novo", () => {
  assert.strictEqual(precisaDeImagem({ img: "data:image/jpeg;base64,/9j/4AAQ" }), true);
  assert.strictEqual(precisaDeImagem({ img: "data:image/jpeg;base64,/9j/4AAQ", regra: 1 }), true);
});

test("semArte de regra antiga tambem e tentado de novo", () => {
  // Marcado como "o iTunes nao tem" por causa do titulo sujo: merece outra
  // chance agora que o titulo vai limpo.
  assert.strictEqual(precisaDeImagem({ semArte: true }), true);
  assert.strictEqual(precisaDeImagem({ semArte: true, regra: REGRA_IMAGEM }), false);
});

test("a regra e um numero que sobe", () => {
  assert.ok(Number.isInteger(REGRA_IMAGEM) && REGRA_IMAGEM >= 2);
});

// ── O marcador de desempate ───────────────────────────────
// Arquivos de nome igual ganham um sufixo "[a1b2c3]" no catalogo, e o app do
// cantor tira esse sufixo (limparNome) ANTES de montar a chave — a Gerencia
// nao tirava. Resultado: nas musicas duplicadas a Gerencia gravava
// `seether__broken_a1b2c3` e o celular lia `seether__broken`. E o mesmo erro de
// chave divergente de 1.1.38, noutro lugar; a limpeza passa a morar aqui, para
// os dois lados concordarem sem nenhum deles lembrar.
test("o marcador de desempate sai do titulo", () => {
  assert.strictEqual(tituloLimpo("Broken [a1b2c3]"), "Broken");
  assert.strictEqual(tituloLimpo("Broken - [a1b2c3]"), "Broken");
  assert.strictEqual(tituloLimpo("Broken - KaraFun Karaoke [9f8e7d]"), "Broken");
});

test("colchete que nao e marcador fica", () => {
  // Seis caracteres, mas nao hexadecimais.
  assert.strictEqual(tituloLimpo("Broken [ao vivo]"), "Broken [ao vivo]");
  assert.strictEqual(tituloLimpo("Song [zzzzzz]"), "Song [zzzzzz]");
});

test("a chave e a mesma venha o titulo com marcador ou sem", () => {
  assert.strictEqual(chaveDaCapa("Seether", "Broken [a1b2c3]"),
                     chaveDaCapa("Seether", "Broken"));
});
