"use strict";

// Uma só execução por chave, mesmo com vários pedindo ao mesmo tempo.
//
// Show de 22/10: a busca no YouTube saía duplicada e chegou a 20 processos
// yt-dlp empilhados, sem nada escrevendo em disco. A causa não era ouvinte
// duplicado — são três portas de entrada para a mesma busca (o KJ clicando
// "Procurar versões", o pedido de busca do app do cantor, e o download
// automático quando o item entra na fila), cada uma com a sua própria guarda e
// a sua própria chave, nenhuma vendo a outra.
//
// Por isso a tranca mora aqui, no processo principal, onde as três passam:
// quem chega depois recebe A MESMA promessa em vez de abrir outro processo.

function criarRegistroEmCurso({ validadeMs = 0 } = {}) {
  const andando = new Map();   // chave -> promessa em curso
  const guardado = new Map();  // chave -> { valor, em }

  function obter(chave, fabrica) {
    // Sem chave não há como agrupar: cada pedido é por conta própria. Juntar
    // tudo em "" faria buscas diferentes devolverem o resultado uma da outra.
    if (chave === null || chave === undefined || chave === "") return fabrica();

    const emAndamento = andando.get(chave);
    if (emAndamento) return emAndamento;

    if (validadeMs > 0) {
      const anterior = guardado.get(chave);
      if (anterior && Date.now() - anterior.em <= validadeMs) {
        return Promise.resolve(anterior.valor);
      }
      if (anterior) guardado.delete(chave);
    }

    const promessa = (async () => fabrica())()
      .then(valor => {
        if (validadeMs > 0) guardado.set(chave, { valor, em: Date.now() });
        return valor;
      })
      // Falha NÃO fica guardada: uma queda de rede de um segundo viraria "sem
      // karaokê" pelos minutos seguintes, com o KJ achando que a música não
      // existe. Quem esperava junto recebe o mesmo erro.
      .finally(() => { andando.delete(chave); });

    andando.set(chave, promessa);
    return promessa;
  }

  return {
    obter,
    emCurso: () => andando.size,
    esquecer(chave) { andando.delete(chave); guardado.delete(chave); },
    limpar() { andando.clear(); guardado.clear(); },
  };
}

module.exports = { criarRegistroEmCurso };
