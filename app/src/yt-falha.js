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

// 403, 404 e falha de nsig quase sempre significam a mesma coisa: o YouTube
// mudou e o yt-dlp desta maquina ficou para tras. No Linux isso e a regra, nao
// a excecao — o .deb declara yt-dlp como dependencia e a distro empacota uma
// versao de meses atras. Mantem o texto original junto: o KJ pode precisar dele.
const RE_YTDLP_VELHO = /HTTP Error 40[34]|nsig extraction failed|player response|signature extraction/i;

// Nao mande "yt-dlp -U": ele se recusa a atualizar instalacao vinda de
// gerenciador de pacotes, que e justamente o caso do .deb. E "pip install"
// esbarra em externally-managed-environment nas distros recentes. O caminho
// que funciona e o proprio Voxly, que mantem a copia dele.
const COMO_ATUALIZAR =
  "Provavelmente o yt-dlp desta máquina está desatualizado — o YouTube muda e " +
  "versões antigas param de funcionar. Abra ⚙ Config e clique em " +
  "\"Atualizar agora\" no Motor de download.";

function motivoFalha(codigoSaida, stderr) {
  if (codigoSaida === 0) return null;

  const texto = String(stderr || "");
  for (const { re, texto: msg } of CONHECIDAS) {
    if (re.test(texto)) return msg;
  }

  const erros = texto.split("\n").filter(l => /^\s*ERROR[:\s]/i.test(l));
  const ultimaLinha = erros.length ? erros[erros.length - 1].trim() : "";

  if (RE_YTDLP_VELHO.test(texto)) {
    return `${COMO_ATUALIZAR}\n\n${ultimaLinha}`.trim();
  }

  // Desconhecido: devolve a mensagem crua. Um generico ("falha no download")
  // nao da ao KJ nada para pesquisar nem para reportar. A ULTIMA linha ERROR e
  // a que derrubou; as anteriores costumam ser tentativas que o yt-dlp fez.
  return ultimaLinha || `O yt-dlp terminou com código ${codigoSaida} e não explicou o motivo.`;
}

module.exports = { motivoFalha };
