"use strict";

// O selo de qualidade: o que se mostra, onde, e com quanta certeza.
//
// Isto NAO mede nada — medir e o espectro.js. Aqui mora a regra do que a nota
// medida vira na tela, e ela nasceu de dois testes cegos que ele fez de ouvido
// em 06/11/2026, sobre 26 musicas, mais uma medicao de 54.
//
// O FATO que decide o desenho: na hora de perguntar o download, as versoes sao
// resultados do YouTube que ainda NAO foram baixados — nao ha audio para medir.
// Medir cada candidata exigiria baixar todas antes, 11 s cada, com ele no
// show. Entao ali so existe a REPUTACAO DO CANAL, que se aprende do acervo que
// ja esta no disco. O selo por musica vale para o que ja foi baixado.
//
// Por isso sao duas coisas separadas, e nao um numero so.

const test = require("node:test");
const assert = require("node:assert");
const q = require("../src/selo");

// ── selo de uma musica medida ─────────────────────────────
test("acima do limite tem selo; no limite tambem; abaixo nao", () => {
  assert.strictEqual(q.temSelo(97), true);
  assert.strictEqual(q.temSelo(85), true);     // o limite entra
  assert.strictEqual(q.temSelo(84), false);
  assert.strictEqual(q.temSelo(0), false);
});

test("sem nota nao ha selo — e nao ha palpite", () => {
  // Isto e o caso das 6 de 60 em que o iTunes nao tem o original. Ficar sem
  // selo e um aborrecimento; inventar selo destroi a confianca no selo todo.
  for (const n of [null, undefined, NaN, "", "97", -1, 101]) {
    assert.strictEqual(q.temSelo(n), false, String(n));
  }
});

test("a nota sai como numero inteiro de 0 a 100, ou nula", () => {
  assert.strictEqual(q.notaValida(85), true);
  assert.strictEqual(q.notaValida(100), true);
  assert.strictEqual(q.notaValida(0), true);
  assert.strictEqual(q.notaValida(85.4), false);
  assert.strictEqual(q.notaValida(101), false);
});

// ── reputacao do canal ───────────────────────────────────
test("com menos de 3 musicas medidas nao ha reputacao", () => {
  // Medido em 06/11: com UMA musica o canal engana. "PARTY TYME em portugues"
  // deu 84 numa musica e ele ouviu regravado. A partir de 3, a separacao foi
  // limpa. Mostrar media de uma musica so e dar ao KJ uma certeza falsa.
  assert.strictEqual(q.reputacaoDoCanal([99]), null);
  assert.strictEqual(q.reputacaoDoCanal([84, 90]), null);
  assert.strictEqual(q.reputacaoDoCanal([]), null);
  assert.strictEqual(q.reputacaoDoCanal(null), null);
});

test("com 3 ou mais, devolve media arredondada e quantidade", () => {
  const r = q.reputacaoDoCanal([60, 61, 62]);
  assert.strictEqual(r.media, 61);
  assert.strictEqual(r.quantidade, 3);
});

test("os canais medidos caem do lado que ele ouviu", () => {
  // Numeros reais da medicao de 60 musicas, so canais com 3 ou mais.
  // Entre 64 e 81 nao caiu nenhum: e nessa folga que o corte vive.
  const medidos = [
    { canal: "CC Karaoke",            notas: [94, 94, 94, 94], ouvido: "master" },
    { canal: "CC Karaoke X",          notas: [81, 81, 81, 81, 81, 81, 81], ouvido: "master" },
    { canal: "KaraFun Karaoke",       notas: [64, 64, 64, 64, 64, 64, 64], ouvido: "regravado" },
    { canal: "Atomic Karaoke",        notas: [62, 62, 62], ouvido: "regravado" },
    { canal: "Zoom Karaoke Official", notas: [61, 61, 61, 61, 61, 61, 61, 61], ouvido: "regravado" },
    { canal: "Clubinho do Karaoke",   notas: [54, 54, 54], ouvido: "regravado" },
  ];
  for (const m of medidos) {
    const r = q.reputacaoDoCanal(m.notas);
    assert.strictEqual(r.tipo, m.ouvido, `${m.canal} (media ${r.media})`);
  }
});

test("o corte fica DENTRO da folga medida, longe das duas beiras", () => {
  // Se o corte encostar em 64 ou em 81, uma musica nova em qualquer um dos
  // dois canais vira a classificacao do canal inteiro.
  assert.ok(q.CORTE_REPUTACAO > 64 && q.CORTE_REPUTACAO < 81,
    `corte ${q.CORTE_REPUTACAO} tem de ficar entre 64 e 81`);
});

// ── casar o canal de um resultado do YouTube ─────────────
test("o canal e achado no titulo do YouTube, que e tudo o que existe antes de baixar", () => {
  for (const [titulo, esperado] of [
    ["Alice in Chains - Man in the Box - CC Karaoke X", "cckaraokex"],
    ["Adele - Skyfall (Karaoke Version) | Zoom Karaoke Official", "zoomkaraokeofficial"],
    ["ACDC - Highway to Hell - Karaoke Master [a1b2c3]", "karaokemaster"],
  ]) assert.strictEqual(q.chaveDoCanal(q.canalDeTitulo(titulo)), esperado, titulo);
});

test("titulo sem canal reconhecivel devolve nulo, nao um chute", () => {
  for (const t of ["Legiao Urbana - Tempo Perdido", "", null, "so um nome qualquer"]) {
    assert.strictEqual(q.canalDeTitulo(t), null, String(t));
  }
});

test("a chave do canal ignora caixa, acento e pontuacao", () => {
  // O acervo escreve o mesmo canal de varios jeitos; sem isso a reputacao se
  // divide em dois canais com metade das musicas cada e nenhum chega a 3.
  assert.strictEqual(q.chaveDoCanal("CC Karaoke X"), q.chaveDoCanal("cc karaoke x"));
  assert.strictEqual(q.chaveDoCanal("Clubinho do Karaokê"), q.chaveDoCanal("Clubinho do Karaoke"));
  assert.strictEqual(q.chaveDoCanal("PARTY TYME KARAOKE"), q.chaveDoCanal("Party Tyme Karaoke"));
  assert.strictEqual(q.chaveDoCanal(null), "");
});

// ── o acervo vira tabela de reputacao ────────────────────
test("as notas do acervo viram reputacao por canal, so acima do minimo", () => {
  const acervo = [
    { canal: "CC Karaoke X", nota: 81 }, { canal: "cc karaoke x", nota: 83 },
    { canal: "CC Karaoke X", nota: 79 },
    { canal: "KaraFun Karaoke", nota: 64 }, { canal: "KaraFun Karaoke", nota: 60 },
    { canal: "Sing King", nota: 95 },
    { canal: null, nota: 70 },
  ];
  const tab = q.reputacoesDoAcervo(acervo);
  // CC Karaoke X: 3 musicas, somadas apesar da caixa diferente.
  assert.strictEqual(tab[q.chaveDoCanal("CC Karaoke X")].quantidade, 3);
  assert.strictEqual(tab[q.chaveDoCanal("CC Karaoke X")].media, 81);
  // KaraFun com 2 e Sing King com 1 ainda nao tem reputacao.
  assert.strictEqual(tab[q.chaveDoCanal("KaraFun Karaoke")], undefined);
  assert.strictEqual(tab[q.chaveDoCanal("Sing King")], undefined);
  // Musica sem canal nao inventa um canal vazio.
  assert.strictEqual(tab[""], undefined);
});

test("nota invalida nao entra na reputacao", () => {
  const tab = q.reputacoesDoAcervo([
    { canal: "X Karaoke", nota: 90 }, { canal: "X Karaoke", nota: null },
    { canal: "X Karaoke", nota: "90" }, { canal: "X Karaoke", nota: 88 },
  ]);
  assert.strictEqual(tab[q.chaveDoCanal("X Karaoke")], undefined);  // so 2 validas
});

test("acervo vazio ou torto devolve tabela vazia, nao erro", () => {
  for (const a of [[], null, undefined, "nao e lista", [null, 3, {}]]) {
    assert.deepStrictEqual(q.reputacoesDoAcervo(a), {});
  }
});

// ── o que a tela mostra ──────────────────────────────────
test("antes de baixar, so a reputacao do canal — nao ha audio para medir", () => {
  const tab = { [q.chaveDoCanal("KaraFun Karaoke")]: { media: 64, quantidade: 7, tipo: "regravado" } };
  const v = q.oQueMostrarAntesDeBaixar("Adele - Skyfall - KaraFun Karaoke", tab);
  assert.strictEqual(v.canal, "KaraFun Karaoke");
  assert.strictEqual(v.media, 64);
  assert.strictEqual(v.quantidade, 7);
  assert.strictEqual(v.tipo, "regravado");
});

test("canal nunca medido antes de baixar: nao mostra nada, e nao e demerito", () => {
  // Canal novo nao e canal ruim. Marcar de vermelho o que nunca se mediu
  // ensinaria o KJ a evitar canal bom so por ser novo.
  assert.strictEqual(q.oQueMostrarAntesDeBaixar("Adele - Skyfall - Canal Novo Karaoke", {}), null);
  assert.strictEqual(q.oQueMostrarAntesDeBaixar("Legiao Urbana - Tempo Perdido", {}), null);
});

test("depois de baixado, o selo e da propria musica e manda mais que o canal", () => {
  // A medida da musica que esta no disco e um fato sobre ELA. A reputacao do
  // canal e so uma aposta sobre musica que ainda nao se ouviu.
  const tab = { [q.chaveDoCanal("KaraFun Karaoke")]: { media: 64, quantidade: 7, tipo: "regravado" } };
  const v = q.oQueMostrarDoAcervo({ nota: 96, canal: "KaraFun Karaoke" }, tab);
  assert.strictEqual(v.selo, true);
  assert.strictEqual(v.nota, 96);
  // e o canal continua visivel, porque e o caso em que ele quer decidir olhando
  assert.strictEqual(v.canal.media, 64);
});

test("musica do acervo ainda nao medida: sem selo e sem nota, mas com o canal", () => {
  const tab = { [q.chaveDoCanal("CC Karaoke X")]: { media: 81, quantidade: 7, tipo: "master" } };
  const v = q.oQueMostrarDoAcervo({ nota: null, canal: "CC Karaoke X" }, tab);
  assert.strictEqual(v.selo, false);
  assert.strictEqual(v.nota, null);
  assert.strictEqual(v.canal.tipo, "master");
});

// ── remedir quando a regra mudar ─────────────────────────
test("documento medido por regra antiga precisa de nova medida", () => {
  // Ja aconteceu com as capas: eu mudei a limpeza do titulo e as 386 musicas
  // tinham de ser buscadas de novo. Sem o numero da regra gravado junto, nao
  // ha como saber quais ja valem.
  assert.strictEqual(q.precisaMedir(null), true);
  assert.strictEqual(q.precisaMedir({}), true);
  assert.strictEqual(q.precisaMedir({ regra: q.REGRA_QUALIDADE - 1, nota: 90 }), true);
  assert.strictEqual(q.precisaMedir({ regra: q.REGRA_QUALIDADE, nota: 90 }), false);
});

test("sem original no iTunes fica marcado, para nao tentar de novo toda vez", () => {
  // 6 de 60 nao tem original. Sem essa marca, cada abertura do catalogo faria
  // 6 buscas inuteis no iTunes — e estourar o limite do iTunes derruba o
  // autocomplete do app do cantor, que e a parte que o publico ve.
  assert.strictEqual(q.precisaMedir({ regra: q.REGRA_QUALIDADE, semOriginal: true }), false);
  assert.strictEqual(q.precisaMedir({ regra: q.REGRA_QUALIDADE - 1, semOriginal: true }), true);
});

// ── o nome do arquivo do acervo ──────────────────────────
test("o nome do acervo se divide em artista, musica e canal", () => {
  assert.deepStrictEqual(
    q.partesDoNome("Alice in Chains - Man in the Box - CC Karaoke X [a1b2c3].mp4"),
    { artista: "Alice in Chains", musica: "Man in the Box", canal: "CC Karaoke X" });
});

test("sem canal no nome, tudo depois do artista e a musica", () => {
  // Esta era a divergencia: os dois scripts de medicao tinham cada um a sua
  // regex de canal, e a de um deles nao conhecia "Elite", "Core" nem "Rewind".
  // A mesma musica saia com canal num script e sem canal no outro, e a
  // reputacao dependia de qual deles a mediu.
  assert.deepStrictEqual(
    q.partesDoNome("Legiao Urbana - Tempo Perdido [xyz].mp4"),
    { artista: "Legiao Urbana", musica: "Tempo Perdido", canal: null });
});

test("musica com hifen no proprio nome nao perde pedaco", () => {
  assert.deepStrictEqual(
    q.partesDoNome("ACDC - Rock - N - Roll Train - Karaoke Master.mp4"),
    { artista: "ACDC", musica: "Rock - N - Roll Train", canal: "Karaoke Master" });
});

test("nome fora do padrao devolve nulo", () => {
  for (const n of ["", null, "SemSeparador.mp4", "- so o separador -"]) {
    assert.strictEqual(q.partesDoNome(n), null, String(n));
  }
});

// ── a nota e RELATIVA: medido em 06/11/2026 ──────────────
// Cinco musicas, 6 candidatas cada, medidas sem baixar:
//
//   musica                 menor  maior   com selo (corte 85)
//   Man in the Box            60     90     4 de 6
//   Skyfall                   86    100     6 de 6   <- todas
//   Tempo Perdido             39    100     3 de 6
//   Zoio de Lula              37     52     0 de 6   <- nenhuma
//   Sweet Child O' Mine       17    100     3 de 5
//
// O numero ABSOLUTO nao se compara entre musicas: depende de quanto grave a
// musica tem e de qual trecho do master o iTunes entrega. No Zoio de Lula o KJ
// veria seis versoes todas reprovadas; no Skyfall, seis todas aprovadas. Nos
// dois casos o selo nao informa nada.
//
// O que funciona e a ORDEM dentro da mesma musica — que e o que ele pediu:
// "elencar as musicas para serem baixadas do mais proximo do original ate o
// menos proximo". Entao a coroa e de quem lidera AQUELA busca, e nao de quem
// passa de um corte fixo.

test("a melhor da busca e coroada mesmo quando todas as notas sao baixas", () => {
  // O caso Zoio de Lula: 37 a 52, nenhuma passaria de 85. Ainda assim uma
  // delas e a mais perto do original, e e essa que ele deve baixar.
  const r = q.ordenarCandidatas([
    { id: "a", nota: 44 }, { id: "b", nota: 52 }, { id: "c", nota: 37 },
  ]);
  assert.deepStrictEqual(r.map(x => x.id), ["b", "a", "c"]);
  assert.strictEqual(r[0].melhor, true);
  assert.strictEqual(r[1].melhor, false);
});

test("a coroa e de uma so, mesmo com empate no topo", () => {
  // O caso Skyfall: duas com 100. Duas coroas nao ajudam a escolher.
  const r = q.ordenarCandidatas([{ id: "a", nota: 100 }, { id: "b", nota: 100 }]);
  assert.strictEqual(r.filter(x => x.melhor).length, 1);
});

test("quem nao tem nota vai para o fim, e nao vale zero", () => {
  // 0 e nota de verdade (versao sem nada a ver com o original) e nao pode
  // empatar com "ainda nao medi".
  const r = q.ordenarCandidatas([
    { id: "sem" }, { id: "zero", nota: 0 }, { id: "boa", nota: 70 },
  ]);
  assert.deepStrictEqual(r.map(x => x.id), ["boa", "zero", "sem"]);
  assert.strictEqual(r[0].melhor, true);
});

test("sem nenhuma nota medida, ninguem e coroado e a ordem nao muda", () => {
  const r = q.ordenarCandidatas([{ id: "a" }, { id: "b" }, { id: "c" }]);
  assert.deepStrictEqual(r.map(x => x.id), ["a", "b", "c"]);
  assert.strictEqual(r.filter(x => x.melhor).length, 0);
});

test("o indice original viaja junto — ordenar a tela nao pode baixar a versao errada", () => {
  const r = q.ordenarCandidatas([{ id: "ruim", nota: 20 }, { id: "boa", nota: 90 }]);
  assert.strictEqual(r[0].indice, 1);   // a boa era a segunda do array
  assert.strictEqual(r[1].indice, 0);
});

test("lista vazia ou torta nao explode", () => {
  for (const l of [[], null, undefined, "nao e lista"]) {
    assert.deepStrictEqual(q.ordenarCandidatas(l), []);
  }
  assert.deepStrictEqual(q.ordenarCandidatas([null, 3]).map(x => x.melhor), [false, false]);
});

test("distancia ate a melhor diz se vale olhar as outras", () => {
  // Quando a lider esta muito a frente, a escolha e obvia. Quando estao todas
  // juntas, a nota nao decide e o KJ tem de ouvir no fone.
  assert.strictEqual(q.decideSozinha([90, 60, 55]), true);
  assert.strictEqual(q.decideSozinha([100, 100, 96]), false);   // o caso Skyfall
  assert.strictEqual(q.decideSozinha([52, 44, 37]), false);      // o caso Zoio de Lula
  assert.strictEqual(q.decideSozinha([90]), false);              // uma so nao se compara
  assert.strictEqual(q.decideSozinha([]), false);
});
