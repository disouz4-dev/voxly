"use strict";

// Como o arquivo baixado deve se chamar.
//
// O app JA sabe o artista e a musica: o cantor escolheu pelo iTunes e o pedido
// carrega os dois nomes certos, ja com a grafia oficial. Mesmo assim o download
// jogava o titulo cru do YouTube num LLM local para adivinhar de novo. Sem
// Ollama instalado — o caso normal no Linux — isso virava "erro de IA" e o
// download parava esperando edicao manual.

const VAGOS = new Set(["desconhecido", "desconhecida", "unknown", "various artists", "va", "-"]);

function limpa(t) {
  const s = typeof t === "string" ? t.trim() : "";
  return s && !VAGOS.has(s.toLowerCase()) ? s : null;
}

function completo(fonte) {
  if (!fonte) return null;
  const artista = limpa(fonte.artista);
  const musica  = limpa(fonte.musica);
  return artista && musica ? { artista, musica } : null;
}

// Ordem de confianca: o que o cantor pediu, os metadados do proprio video, o
// que o iTunes devolve para o titulo. `null` significa "pergunte ao KJ".
function escolherIdentidade({ pedido, metadados, itunes } = {}) {
  for (const [origem, fonte] of [["pedido", pedido], ["metadados", metadados], ["itunes", itunes]]) {
    const achado = completo(fonte);
    if (achado) return { ...achado, origem };
  }
  return null;
}


// ── iTunes no lugar de um LLM local ──────────────────────────────────────
// Rodar um modelo local so para extrair "artista" e "musica" de um titulo
// consome CPU e RAM da mesma maquina que esta tocando o show, e o app ja usa o
// iTunes como fonte oficial dos nomes — e dele que vem o que o cantor escolheu.

const RE_VERSAO_INDESEJADA =
  /\b(ao vivo|live|ac[ou]?ustic\w*|unplugged|remix\w*|karaoke|instrumental|cover|tribute|made famous|originally performed|sped up|slowed|nightcore|demo)\b/i;

const { palavras } = require("./texto");

// O criterio e o inverso do obvio: o titulo do YouTube carrega lixo (canal,
// "karaoke", resolucao), entao exigir que ele caiba no resultado nunca casaria.
// Quem tem que caber e o RESULTADO dentro do titulo.
function escolherDoItunes(resultados, termo) {
  const doTitulo = palavras(termo);
  if (!doTitulo.length) return null;

  let melhor = null;
  for (const r of resultados || []) {
    const artista = (r && r.artistName) || "";
    const musica  = (r && r.trackName)  || "";
    if (!artista || !musica || RE_VERSAO_INDESEJADA.test(musica)) continue;

    const candidato = [...palavras(artista), ...palavras(musica)];
    if (!candidato.length) continue;

    const restante = [...doTitulo];
    let casadas = 0;
    for (const w of candidato) {
      const i = restante.indexOf(w);
      if (i !== -1) { casadas++; restante.splice(i, 1); }
    }
    if (casadas / candidato.length < 0.9) continue;

    // Mais palavras casadas = identificacao mais especifica. "Drown" sozinho
    // perde para "Bring Me the Horizon - Drown".
    if (!melhor || casadas > melhor.casadas
        || (casadas === melhor.casadas && musica.length < melhor.musica.length)) {
      melhor = { artista, musica, casadas };
    }
  }
  return melhor ? { artista: melhor.artista, musica: melhor.musica } : null;
}

// O nome do canal viaja junto no titulo e polui a consulta: buscar "Periphery
// Satellites JustusVidyo" no iTunes nao devolve nada. O canal e conhecido no
// momento do download, entao sai antes — de graca, sem consulta extra.
// Remove so o trecho CONTIGUO do canal: "Sing King" contem "King", que tambem
// aparece em nomes de banda.
function semCanal(titulo, canal) {
  const t = String(titulo || "");
  const c = String(canal || "").trim();
  if (!c) return t;

  const alvo = palavras(c);
  const doTitulo = palavras(t);
  if (!alvo.length || alvo.length > doTitulo.length) return t;

  for (let i = 0; i + alvo.length <= doTitulo.length; i++) {
    if (alvo.every((w, k) => doTitulo[i + k] === w)) {
      const resto = [...doTitulo.slice(0, i), ...doTitulo.slice(i + alvo.length)];
      // Se o titulo era so o canal, consultar o titulo inteiro ainda e melhor
      // que consultar nada.
      if (!resto.length) return t;
      // Recorta do texto original para preservar a grafia (acento, hifen).
      const original = t.split(/\s+/).filter(Boolean);
      if (original.length === doTitulo.length) {
        return [...original.slice(0, i), ...original.slice(i + alvo.length)].join(" ");
      }
      return resto.join(" ");
    }
  }
  return t;
}

const LIMITE_PADRAO_POR_MINUTO = 15;

// O iTunes limita requisicoes por IP, e estourar devolve 403 para tudo que vier
// depois — inclusive o autocomplete do app do cantor, que e a parte que o
// publico ve. Duas defesas: cache (a mesma casa repete as mesmas musicas a
// noite toda) e um teto por minuto que, ao ser atingido, simplesmente desiste
// da consulta em vez de insistir. Falhar aqui custa um nome feio no arquivo;
// insistir custa o autocomplete de todo mundo.
function criarBuscaItunes({ buscar, agora, limitePorMinuto } = {}) {
  const rede  = buscar || ((url, opcoes) => fetch(url, opcoes));
  const clock = agora  || (() => Date.now());
  const teto  = limitePorMinuto || LIMITE_PADRAO_POR_MINUTO;
  const cache = new Map();
  let janela = [];

  return async function buscaItunes(termo) {
    const consulta = String(termo || "").trim();
    if (!consulta) return null;

    const chave = consulta.toLowerCase();
    if (cache.has(chave)) return cache.get(chave);   // acerto nao gasta cota

    const t = clock();
    janela = janela.filter(m => t - m < 60000);
    if (janela.length >= teto) return null;
    janela.push(t);

    try {
      const url = "https://itunes.apple.com/search?term=" + encodeURIComponent(consulta)
                + "&entity=song&limit=25&country=BR";
      const res = await rede(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`iTunes respondeu ${res.status}`);
      const achado = escolherDoItunes((await res.json()).results || [], consulta);
      cache.set(chave, achado);   // guarda tambem o vazio: titulo ruim nao volta a rede
      return achado;
    } catch (e) {
      console.warn("[ITUNES]", e.message);
      return null;               // nome feio no arquivo e melhor que download parado
    }
  };
}

module.exports = { escolherIdentidade, escolherDoItunes, criarBuscaItunes, semCanal };
