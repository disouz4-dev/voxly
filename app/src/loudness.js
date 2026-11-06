"use strict";

// Normalizacao de volume: cada musica vem de um canal diferente do YouTube,
// com volumes muito diferentes, e o compressor do Palco doma picos mas nao
// iguala o volume percebido.
//
// O ffmpeg mede a loudness integrada do arquivo (EBU R128, filtro ebur128) uma
// vez so, e a medida fica guardada. Na hora de tocar, o Palco aplica o ganho
// que leva a musica ao alvo — nada e regravado, e o acervo antigo entra junto.
// ebur128 e nao loudnorm: a mesma loudness integrada em 0,4 s por musica, onde
// o loudnorm levava 9 s (ele sobe a amostragem para medir o pico verdadeiro).

(function (raiz) {

// Referencia de loudness do YouTube e dos streamings. Karaoke baixado costuma
// ficar entre -8 e -18 LUFS.
const ALVO_LUFS = -14;
// Teto do reforco: gravacao muito baixa vira chiado amplificado. O compressor
// que vem depois segura os picos que o reforco criar.
const REFORCO_MAX_DB = 6;
const CORTE_MAX_DB = 12;
// O ffmpeg entrega -70 LUFS para silencio: nao e musica baixa, e medida sem
// sentido. Abaixo disto, a musica toca como esta.
const LUFS_MINIMO = -50;

function numeroApos(texto, rotulo) {
  const m = texto.match(new RegExp(rotulo + "\\s*(-?\\d+(?:\\.\\d+)?)"));
  return m ? Number(m[1]) : null;
}

// Le o resumo do filtro ebur128 (stderr do ffmpeg). So o que vem depois de
// "Summary:" — antes disso ficam os valores quadro a quadro, se houver.
function lerMedida(saida) {
  if (!saida || typeof saida !== "string") return null;
  const i = saida.lastIndexOf("Summary:");
  if (i < 0) return null;
  const resumo = saida.slice(i);
  // "I:" e nao "Integrated": a linha seguinte ("Threshold: ... LUFS") tambem
  // termina em LUFS e nao pode ser confundida com a loudness.
  const lufs = numeroApos(resumo, "\\bI:");
  if (lufs == null || !Number.isFinite(lufs)) return null;
  const pico = numeroApos(resumo, "\\bPeak:");
  return { lufs, pico: Number.isFinite(pico) ? pico : null };
}

// ── Duracao do arquivo, de graca ──────────────────────────
// O mesmo ffmpeg que mede a loudness ja imprime o cabecalho do arquivo, e ali
// vem "Duration: HH:MM:SS.ms". Guardar isso evita uma segunda passada no
// acervo, e e o que a regra do fim da noite precisa: a musica so entra se
// terminar dentro da tolerancia depois do horario marcado (pedido do dono em
// 06/11, "uma de 7 min nao entra, uma de 4 min entra").
//
// Devolve segundos, ou null — "Duration: N/A" existe, e o main.js corta o
// inicio do stderr quando ele passa de 100 KB, levando o cabecalho embora.
function lerDuracao(saida) {
  if (!saida || typeof saida !== "string") return null;
  const m = saida.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!m) return null;
  const s = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return Number.isFinite(s) && s > 0 ? s : null;
}

function ganhoDaMedida(medida, { alvo = ALVO_LUFS } = {}) {
  const lufs = medida && Number(medida.lufs);
  if (!Number.isFinite(lufs) || lufs < LUFS_MINIMO) return 1;
  const db = Math.min(REFORCO_MAX_DB, Math.max(-CORTE_MAX_DB, alvo - lufs));
  return Math.pow(10, db / 20);
}

// Medida vale enquanto o arquivo e o mesmo: mesmo caminho, tamanho e data.
// A data vai em segundos porque o exFAT (o HD externo do KJ) guarda com menos
// precisao e o mesmo arquivo voltava com milissegundos diferentes.
function criarCacheMedidas(dadosIniciais) {
  const dados = (dadosIniciais && typeof dadosIniciais === "object") ? { ...dadosIniciais } : {};
  const segundos = ms => Math.floor(Number(ms) / 1000);
  // Vale a entrada? Mesmo arquivo (caminho, tamanho e data) e nada mais.
  const mesma = (e, st) => !!e && typeof e === "object" && !!st
    && e.size === st.size && e.mtime === segundos(st.mtimeMs);
  const duracaoBoa = d => (Number.isFinite(d) && d > 0 ? d : null);
  return {
    obter(caminho, st) {
      const e = dados[caminho];
      if (!mesma(e, st)) return null;
      if (!Number.isFinite(e.lufs)) return null;
      return {
        lufs: e.lufs,
        pico: Number.isFinite(e.pico) ? e.pico : null,
        // A duracao veio depois (06/11) e as medidas antigas nao a tem: null
        // em vez de inventar numero. Quem precisa dela pergunta em duracaoDe.
        duracao: duracaoBoa(e.duracao),
      };
    },
    // So a duracao, para quem nao quer a medida de volume.
    duracaoDe(caminho, st) {
      const e = dados[caminho];
      return mesma(e, st) ? duracaoBoa(e.duracao) : null;
    },
    guardar(caminho, st, medida) {
      const antes = dados[caminho];
      // A duracao ja guardada nao se perde quando a medida de volume e
      // regravada, e vice-versa: sao duas leituras diferentes do mesmo arquivo.
      const duracao = duracaoBoa(medida && medida.duracao)
        ?? (mesma(antes, st) ? duracaoBoa(antes.duracao) : null);
      dados[caminho] = { size: st.size, mtime: segundos(st.mtimeMs), lufs: medida.lufs, pico: medida.pico };
      if (duracao != null) dados[caminho].duracao = duracao;
    },
    // Grava so a duracao, preservando a medida de volume que ja estiver ali.
    // E assim que as medidas antigas ganham duracao, com uma leitura barata do
    // cabecalho em vez de refazer a medida do arquivo inteiro.
    guardarDuracao(caminho, st, segs) {
      const d = duracaoBoa(segs);
      if (d == null || !st) return;
      const antes = mesma(dados[caminho], st) ? dados[caminho] : null;
      dados[caminho] = {
        ...(antes || {}),
        size: st.size, mtime: segundos(st.mtimeMs), duracao: d,
      };
    },
    dados() { return dados; },
  };
}

const api = { ALVO_LUFS, lerMedida, ganhoDaMedida, criarCacheMedidas, lerDuracao };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyLoudness = api;

})(globalThis);
