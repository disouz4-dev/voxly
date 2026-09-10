"use strict";

// Por que o download falhou, em texto que o KJ possa agir no meio do show.
//
// O codigo de saida do yt-dlp era resolvido na promessa e nunca lido, e o
// stderr so era inspecionado atras de "already been downloaded" — todo o resto
// ia para o lixo. O resultado era "nada foi baixado", sem motivo e sem saida.

// Causas conhecidas primeiro: cada uma vira instrucao, nao diagnostico.
const CONHECIDAS = [
  {
    re: /sign in to confirm (?:you|that you)[’'`]?re not a bot|confirm you are not a bot/i,
    texto: "O YouTube pediu confirmação de que não é um robô. Ative os cookies do navegador nas configurações de download — sem isso ele recusa downloads deste computador.",
  },
  {
    re: /sign in to confirm your age|inappropriate for some users|age.restricted/i,
    texto: "Vídeo com restrição de idade. Só baixa com os cookies de um navegador logado.",
  },
  { re: /this video is private/i,        texto: "Esse vídeo é privado — escolha outra versão." },
  { re: /video unavailable/i,            texto: "Vídeo indisponível no YouTube — escolha outra versão." },
  { re: /removed by the uploader|has been terminated/i,
                                          texto: "O vídeo foi removido do YouTube — escolha outra versão." },
  { re: /not available in your country|geo.restricted/i,
                                          texto: "Vídeo bloqueado no seu país — escolha outra versão." },
  { re: /requested format (?:is )?not available/i,
                                          texto: "O YouTube não tem esse vídeo na qualidade escolhida. Tente uma qualidade menor em ⚙ Config." },
  { re: /ffmpeg (?:is )?not (?:installed|found)|ffmpeg not found/i,
                                          texto: "ffmpeg não encontrado. Instale-o para o Voxly poder juntar vídeo e áudio." },
  { re: /unable to resolve host|network is unreachable|temporary failure in name resolution/i,
                                          texto: "Sem conexão com a internet." },
];

function motivoFalha(codigoSaida, stderr) {
  if (codigoSaida === 0) return null;

  const texto = String(stderr || "");
  for (const { re, texto: msg } of CONHECIDAS) {
    if (re.test(texto)) return msg;
  }

  // Desconhecido: devolve a mensagem crua. Um generico ("falha no download")
  // nao da ao KJ nada para pesquisar nem para reportar. A ULTIMA linha ERROR e
  // a que derrubou; as anteriores costumam ser tentativas que o yt-dlp fez.
  const erros = texto.split("\n").filter(l => /^\s*ERROR[:\s]/i.test(l));
  const ultima = erros.length ? erros[erros.length - 1].trim() : "";
  return ultima || `O yt-dlp terminou com código ${codigoSaida} e não explicou o motivo.`;
}

module.exports = { motivoFalha };
