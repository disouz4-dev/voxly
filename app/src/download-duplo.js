"use strict";

// Trava contra baixar a MESMA gravacao duas vezes.
//
// Show de 22/10: dois yt-dlp no mesmo video, com o mesmo padrao de nome de
// saida, e o .part do audio zerado — um truncou o arquivo do outro. Chegou a
// 20 processos empilhados e o download parou de vez. A guarda que existia era
// um Set na tela da Gerencia, por item da fila: nao via o download pedido pelo
// celular do KJ nem o mesmo video pedido de dois pedidos diferentes. Quem
// decide tem de ser o processo principal, que enxerga todos.
//
// Outra VERSAO da mesma musica nao e barrada: escolher versao e o trabalho do
// KJ. A funcao so conta quantas ele ja tem, para a tela avisar.

// Depois disso o registro e lixo, nao download vivo: sem este teto, um yt-dlp
// morto sem avisar (app fechado no meio, processo matado) trancaria a musica
// para sempre em "ja esta baixando".
const TETO_EM_CURSO_MS = 15 * 60 * 1000;

function decidirDownload({ videoId, url, itemId, noDisco, emCurso, agora, versoesQueJaTenho } = {}) {
  const chave = videoId || url || null;
  if (!chave) return { acao: "sem-alvo" };

  // O disco vence o registro: se o arquivo chegou, o download acabou — mesmo
  // que alguem tenha esquecido de limpar a anotacao.
  if (noDisco) return { acao: "ja-tenho", arquivo: noDisco, chave };

  const registro = emCurso && typeof emCurso.get === "function" ? emCurso.get(chave) : null;
  if (registro) {
    const desde = Number(registro.desde) || 0;
    const idade = (Number(agora) || Date.now()) - desde;
    if (idade <= TETO_EM_CURSO_MS) {
      return { acao: "em-curso", itemId: registro.itemId, chave, desde };
    }
  }

  return {
    acao: "baixar",
    chave,
    itemId: itemId || null,
    jaTenhoVersoes: Array.isArray(versoesQueJaTenho) ? versoesQueJaTenho.length : 0,
  };
}

module.exports = { decidirDownload, TETO_EM_CURSO_MS };
