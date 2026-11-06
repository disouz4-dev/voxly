"use strict";

// O selo de qualidade visto de fora: o que a nota medida vira na tela.
//
// Medir e trabalho do espectro.js. Aqui mora so a regra do que se mostra, e
// ela nao saiu de teoria: saiu de dois testes cegos que o KJ fez de ouvido em
// 06/11/2026 sobre 26 musicas, mais uma medicao de 54 do acervo.
//
// ── o fato que decide o desenho ──────────────────────────
// Na hora de perguntar o download, as versoes sao resultados do YouTube que
// ainda NAO foram baixados: nao existe audio para medir. Medir cada candidata
// exigiria baixar todas antes — 11 s cada, com ele no palco. Entao ali so
// existe a REPUTACAO DO CANAL, aprendida do acervo que ja esta no disco; o
// selo por musica vale para o que ja foi baixado.
//
// Por isso sao duas coisas separadas e nao um numero so. Fundir as duas
// esconderia justamente o caso em que ele quer decidir olhando: musica boa num
// canal ruim, ou o contrario.

const { LIMITE_SELO } = require("./espectro");

// A regra gravada junto da nota. Quando a calibracao mudar, este numero sobe e
// o que foi medido pela regra velha e medido de novo. Sem isso nao ha como
// saber quais notas ainda valem — foi a licao das capas, que tiveram de ser
// buscadas de novo nas 386 musicas.
const REGRA_QUALIDADE = 1;

// Quantas musicas medidas um canal precisa para ter reputacao.
//
// Medido: com UMA musica o canal engana — "PARTY TYME em portugues" deu 84 e
// ele ouviu regravado. Com 3 ou mais, a separacao ficou limpa. Dizer "canal
// bom" com base numa musica e dar ao KJ uma certeza que a medida nao tem.
const MINIMO_PARA_REPUTACAO = 3;

// Acima disto o canal entrega o master com a voz tirada; abaixo, regravacao.
//
// Os canais com 3 ou mais musicas medidas cairam em dois grupos, e entre 64 e
// 81 nao caiu nenhum:
//
//   94 (4) CC Karaoke            \
//   81 (7) CC Karaoke X           > ele ouviu "e o master"
//   ----------------------------- 72
//   64 (7) KaraFun Karaoke       \
//   62 (3) Atomic Karaoke         > ele ouviu "e regravado"
//   61 (8) Zoom Karaoke Official  |
//   54 (3) Clubinho do Karaoke   /
//
// 72 e o meio da folga. Encostar o corte em 64 ou em 81 faria uma musica nova
// virar a classificacao de um canal inteiro.
const CORTE_REPUTACAO = 72;

// Palavras que identificam um canal de karaoke dentro de um titulo. Generica de
// proposito: canal novo tem de ser reconhecido como canal, mesmo sem reputacao.
const RE_CANAL = /karaok|karafun|playback|sing king|party tyme|stingray|vocal hero|empty orchestra/i;

// A nota e inteira de 0 a 100, ou nao e nota. String que parece numero nao
// passa: quem grava nota como texto tem um defeito, e esconde-lo aqui faria o
// selo aparecer por acidente.
function notaValida(n) {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100;
}

// Sem nota nao ha selo. Foi o caso de 6 de 60 musicas, em que o iTunes nao tem
// a gravacao original: ficar sem selo e um aborrecimento, inventar selo destroi
// a confianca no selo todo.
function temSelo(nota) {
  return notaValida(nota) && nota >= LIMITE_SELO;
}

// Chave de busca do canal: mesma grafia escrita de jeitos diferentes tem de
// somar no mesmo canal. Sem isto, "CC Karaoke X" e "cc karaoke x" viram dois
// canais com metade das musicas cada, e nenhum dos dois chega ao minimo.
function chaveDoCanal(canal) {
  return String(canal || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Acha o canal no titulo — que, antes de baixar, e tudo o que existe.
//
// Dois formatos aparecem: "Artista - Musica - Canal" e "Artista - Musica |
// Canal". O "|" e olhado primeiro porque titulos como "Skyfall (Karaoke
// Version) | Zoom Karaoke Official" tem a palavra karaoke tambem no nome da
// musica, e dividir so por " - " pegaria o pedaco errado.
function canalDeTitulo(titulo) {
  const limpo = String(titulo || "")
    // A extensao sai ANTES do marcador: em "... [a1b2c3].mp4" o marcador nao
    // esta no fim da linha, e na ordem contraria ele sobrava colado no nome do
    // canal — o que partiria a reputacao do canal em dois.
    .replace(/\.(mp4|mkv|webm|m4v|avi|mp3|m4a)$/i, "")
    .replace(/\s*\[[^\]]+\]\s*$/, "")
    .trim();
  if (!limpo) return null;

  if (limpo.includes("|")) {
    const fim = limpo.split("|").pop().trim();
    if (fim && RE_CANAL.test(fim)) return fim;
  }

  const partes = limpo.split(/\s+-\s+/).map(s => s.trim()).filter(Boolean);
  // Exige tres pedacos: com dois, "Artista - Musica", nao ha canal nenhum e o
  // nome da musica entraria no lugar dele.
  if (partes.length >= 3) {
    const fim = partes[partes.length - 1];
    if (RE_CANAL.test(fim)) return fim;
  }
  return null;
}

// A reputacao de um canal a partir das notas das musicas dele que ja foram
// medidas. Abaixo do minimo devolve null — e null quer dizer "ainda nao sei",
// nao "e ruim".
function reputacaoDoCanal(notas) {
  if (!Array.isArray(notas)) return null;
  const boas = notas.filter(notaValida);
  if (boas.length < MINIMO_PARA_REPUTACAO) return null;
  const media = Math.round(boas.reduce((s, n) => s + n, 0) / boas.length);
  return { media, quantidade: boas.length, tipo: media >= CORTE_REPUTACAO ? "master" : "regravado" };
}

// O acervo medido vira a tabela de reputacao por canal. So entram os canais que
// alcancaram o minimo: a tabela e consultada na hora do download, e o que nao
// esta nela nao aparece na tela.
function reputacoesDoAcervo(itens) {
  const porCanal = new Map();
  if (!Array.isArray(itens)) return {};
  for (const it of itens) {
    if (!it || typeof it !== "object") continue;
    const chave = chaveDoCanal(it.canal);
    if (!chave) continue;                       // musica sem canal nao cria canal vazio
    if (!porCanal.has(chave)) porCanal.set(chave, { nome: it.canal, notas: [] });
    porCanal.get(chave).notas.push(it.nota);
  }
  const tabela = {};
  for (const [chave, { nome, notas }] of porCanal) {
    const r = reputacaoDoCanal(notas);
    if (r) tabela[chave] = { ...r, nome };
  }
  return tabela;
}

// Antes de baixar: so a reputacao do canal, porque nao ha audio para medir.
//
// Canal nunca medido devolve null e a tela nao mostra nada. Marcar canal novo
// de vermelho ensinaria o KJ a evitar canal bom so por ser novo.
function oQueMostrarAntesDeBaixar(titulo, tabela) {
  const canal = canalDeTitulo(titulo);
  if (!canal) return null;
  const r = (tabela || {})[chaveDoCanal(canal)];
  if (!r) return null;
  return { canal, media: r.media, quantidade: r.quantidade, tipo: r.tipo };
}

// Depois de baixado: o selo e da propria musica, e o canal vai junto.
//
// A nota da musica que esta no disco e um fato sobre ELA; a reputacao do canal
// e so uma aposta sobre musica que ainda nao se ouviu. Quando as duas
// discordam — musica boa de canal ruim — e o selo que manda, e as duas ficam
// visiveis, porque esse e o caso em que ele quer decidir olhando.
function oQueMostrarDoAcervo(musica, tabela) {
  const m = musica && typeof musica === "object" ? musica : {};
  const nota = notaValida(m.nota) ? m.nota : null;
  const canal = m.canal ? (tabela || {})[chaveDoCanal(m.canal)] || null : null;
  return { selo: temSelo(nota), nota, canal };
}

// Esta musica precisa ser medida?
//
// `semOriginal` marca o que o iTunes nao tem (6 de 60). Sem essa marca, cada
// abertura do catalogo repetiria essas buscas inuteis — e estourar o limite do
// iTunes derruba o autocomplete do app do cantor, que e a parte que o publico
// ve. A marca cai sozinha quando a regra sobe.
function precisaMedir(doc) {
  if (!doc || typeof doc !== "object") return true;
  if (Number(doc.regra || 0) < REGRA_QUALIDADE) return true;
  if (doc.semOriginal) return false;
  return !notaValida(doc.nota);
}

// Divide o nome de arquivo do acervo em artista, musica e canal.
//
// O acervo grava "Artista - Musica - Canal [id].mp4". Isto vivia copiado nos
// dois scripts de medicao, com regex de canal DIFERENTES: a de um deles nao
// conhecia "Elite", "Core" nem "Rewind", e a mesma musica saia com canal num
// script e sem canal no outro. Reputacao de canal nao pode depender de qual
// script mediu.
function partesDoNome(arquivo) {
  const base = String(arquivo || "")
    .replace(/\.(mp4|mkv|webm|m4v|avi|mp3|m4a)$/i, "")
    .replace(/\s*\[[^\]]+\]\s*$/, "")
    .trim();
  const partes = base.split(/\s+-\s+/).map(s => s.trim()).filter(Boolean);
  if (partes.length < 2) return null;
  const canal = canalDeTitulo(arquivo);
  const resto = canal ? partes.slice(1, -1) : partes.slice(1);
  const musica = resto.join(" - ");
  return musica ? { artista: partes[0], musica, canal } : null;
}

module.exports = {
  REGRA_QUALIDADE, MINIMO_PARA_REPUTACAO, CORTE_REPUTACAO, LIMITE_SELO,
  notaValida, temSelo, chaveDoCanal, canalDeTitulo,
  reputacaoDoCanal, reputacoesDoAcervo,
  oQueMostrarAntesDeBaixar, oQueMostrarDoAcervo, precisaMedir, partesDoNome,
};
