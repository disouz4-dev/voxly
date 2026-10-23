"use strict";

// Teto de trabalhos simultâneos, com prioridade.
//
// Dois problemas do show de 22/10, que no fundo são um só: sem teto, cada
// clique largava um yt-dlp e chegou a 20 processos parados, todos disputando
// banda e nenhum terminando; e sem ordem, a música que ia tocar em 3 minutos
// disputava com a que tocaria em 40.
//
// `prioridade` é a posição na fila de canto: 1 canta primeiro, e número menor
// passa na frente. Quem já está rodando NUNCA é interrompido — cortar um
// download no meio joga fora o que já baixou.

const LIMITE_PADRAO = 2;

function criarFilaLimitada({ limite } = {}) {
  // Limite inválido (zero, negativo, texto) travaria o download da casa
  // inteira por um erro de configuração: cai no padrão.
  const teto = Number.isInteger(limite) && limite > 0 ? limite : LIMITE_PADRAO;

  const esperando = [];
  let rodando = 0;
  let ordem = 0;   // desempate por chegada, dentro da mesma prioridade

  function despachar() {
    if (rodando >= teto || !esperando.length) return;
    // Menor prioridade primeiro; empate, quem chegou antes.
    esperando.sort((a, b) => (a.prioridade - b.prioridade) || (a.ordem - b.ordem));
    const proximo = esperando.shift();
    rodando++;
    // O trabalho pode estourar de forma síncrona: embrulhado numa promessa,
    // isso também libera a vaga pelo finally.
    Promise.resolve()
      .then(() => proximo.trabalho())
      .then(proximo.ok, proximo.falha)
      .finally(() => { rodando--; despachar(); });
  }

  function correr(trabalho, { prioridade } = {}) {
    return new Promise((ok, falha) => {
      esperando.push({
        trabalho,
        ok,
        falha,
        // Sem prioridade declarada vai para o fim: quem sabe a posição na fila
        // de canto informa, o resto espera.
        prioridade: Number.isFinite(prioridade) ? prioridade : Number.MAX_SAFE_INTEGER,
        ordem: ordem++,
      });
      despachar();
    });
  }

  return {
    correr,
    emCurso: () => rodando,
    esperando: () => esperando.length,
    teto: () => teto,
  };
}

module.exports = { criarFilaLimitada, LIMITE_PADRAO };
