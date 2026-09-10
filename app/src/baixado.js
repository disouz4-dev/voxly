"use strict";

// Qual arquivo da pasta e o que ACABOU de ser baixado.
//
// A regra antiga era "o mais recente da pasta", sem checar relacao alguma com
// este download. Quando o yt-dlp falhava ou a linha de saida nao era
// reconhecida, ele agarrava um arquivo alheio, renomeava para o artista pedido
// e registrava no banco: pediram Silverchair e tocou Sleep Token — com o Sleep
// Token original destruido no caminho, renomeado para outra coisa.
//
// Errar aqui estraga DOIS pedidos e falsifica o acervo. Na duvida, devolve null
// e o download falha, que e recuperavel.

// Relogio de sistema de arquivos nem sempre bate com o do processo (rede,
// exFAT, granularidade de segundo). Uma folga pequena evita descartar o
// arquivo certo sem abrir espaco para pegar um de minutos atras.
const FOLGA_MS = 3000;

function escolherArquivoBaixado(arquivos, { inicioMs, idVideo } = {}) {
  const lista = Array.isArray(arquivos) ? arquivos : [];
  if (!lista.length) return null;

  // O id do video e prova direta: esse arquivo E o desta URL, tenha ele o
  // horario que tiver (o yt-dlp pode reaproveitar um download ja completo).
  if (idVideo) {
    const porId = lista.filter(a => a.nome.includes(`[${idVideo}]`));
    if (porId.length) {
      return porId.sort((a, b) => b.mtimeMs - a.mtimeMs)[0].nome;
    }
    // Id conhecido e nenhum arquivo com ele: nao autoriza pegar outro qualquer.
    return null;
  }

  const novos = lista.filter(a => a.mtimeMs >= (inicioMs || 0) - FOLGA_MS);
  if (!novos.length) return null;
  return novos.sort((a, b) => b.mtimeMs - a.mtimeMs)[0].nome;
}

// O id sempre esta na URL, e e o unico dado que liga o arquivo a este pedido
// com certeza. O template de saida do yt-dlp passa a carrega-lo no nome.
const RE_ID_URL = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})(?:[&?#/]|$)/;

function idDaUrl(url) {
  const m = String(url || "").match(RE_ID_URL);
  return m ? m[1] : null;
}

module.exports = { escolherArquivoBaixado, idDaUrl };
