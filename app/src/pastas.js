"use strict";

// Onde o download vai parar. Fora do main.js porque a lacuna aqui nao dava
// erro no lugar do problema: sem pasta valida o download saia com
// `pasta: undefined` e so estourava la na frente, num readdirSync, como
// "ENOENT scandir" — mensagem que nao dizia nada ao KJ.

function limpa(p) {
  const t = typeof p === "string" ? p.trim() : "";
  return t || null;
}

// `existe` e injetado para o teste nao depender do disco; no app e fs.existsSync.
function pastaDeDownload({ pedida, configurada, padrao, existe } = {}) {
  const escolhida = limpa(pedida) || limpa(configurada);

  // O mesmo HD externo monta em caminhos diferentes em cada sistema
  // ("/Volumes/X" no macOS, "/media/<user>/X" no Linux). Levando a
  // configuracao de um para o outro, o caminho gravado nao existe mais.
  // Cair calado na pasta padrao seria pior que falhar: baixaria para o disco
  // interno e o KJ so descobriria com o show rolando.
  if (escolhida) {
    if (existe && !existe(escolhida)) {
      throw new Error(
        `A pasta de músicas "${escolhida}" não existe nesta máquina. ` +
        `Se for um HD externo, ele monta num caminho diferente em cada sistema — ` +
        `reaponte a pasta em 📁 Biblioteca.`
      );
    }
    return escolhida;
  }

  const reserva = limpa(padrao);
  if (!reserva) {
    throw new Error(
      "Nenhuma pasta de músicas definida. Escolha uma em 📁 Biblioteca antes de baixar."
    );
  }
  return reserva;
}

module.exports = { pastaDeDownload };
