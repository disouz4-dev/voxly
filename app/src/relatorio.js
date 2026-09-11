"use strict";

// Resumo permanente de uma noite, gravado ANTES de a faxina apagar a sessao.
//
// apagarSessao deleta fila, presencas e historico de uma vez. O unico lugar que
// parecia guardar algo para sempre — historico/{uid}/apresentacoes — nunca
// recebeu nada: a regra exige que quem grava seja o proprio cantor, e quem grava
// e o host. Toda noite ate aqui foi perdida por inteiro.
//
// Guarda nomes artisticos (apelidos que o proprio cantor escolheu), nunca email
// nem foto: e o que o relatorio da casa precisa, e nada alem.

(function (raiz) {

function emMs(t) {
  if (t == null) return null;
  if (typeof t === "number") return t;
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (t instanceof Date) return t.getTime();
  return null;
}

// Cantor adicionado a mao pelo KJ nao tem conta, e ha registros antigos sem
// uid: o nome e o que sobra para agrupar.
function chaveDe(x) {
  return (x && (x.cantorUid || x.uid)) || ("nome:" + String((x && x.nomeArtistico) || "").trim().toLowerCase());
}

const NAO_CANTADA = new Set(["aguardando", "confirmando", "pronto", "cancelada", "tocando"]);

function resumirSessao({ sessao, fila, presencas, historico, agora } = {}) {
  const s = sessao || {};
  const F = Array.isArray(fila) ? fila : [];
  const P = Array.isArray(presencas) ? presencas : [];
  const H = (Array.isArray(historico) ? historico : [])
    .map(h => ({ ...h, _t: emMs(h.horario) }))
    .sort((a, b) => (a._t ?? Infinity) - (b._t ?? Infinity));

  const cantores = new Map();
  const cantor = (x) => {
    const k = chaveDe(x);
    if (!cantores.has(k)) cantores.set(k, { nome: (x && x.nomeArtistico) || "—", pediu: 0, cantou: 0 });
    return cantores.get(k);
  };

  for (const p of P) cantor(p);
  for (const f of F) cantor(f).pediu++;
  for (const h of H) cantor(h).cantou++;

  const tempos = H.map(h => h._t).filter(t => t != null);

  return {
    sessaoId:          s.id || null,
    nomeCasa:          s.nomeCasa || null,
    codigo:            s.codigo || null,
    inicioPlanejado:   emMs(s.horarioInicio),
    terminoPlanejado:  emMs(s.horarioTermino),
    primeiraMusica:    tempos.length ? Math.min(...tempos) : null,
    ultimaMusica:      tempos.length ? Math.max(...tempos) : null,

    participantes:     cantores.size,
    cantaram:          [...cantores.values()].filter(c => c.cantou > 0).length,
    pedidos:           F.length,
    cantadas:          H.length,
    naoCantadas:       F.filter(f => NAO_CANTADA.has(f.status)).length,

    cantores: [...cantores.values()].sort((a, b) => b.cantou - a.cantou || b.pediu - a.pediu),
    musicas: H.map(h => ({
      musica:  h.musica || "—",
      artista: h.artista || "—",
      cantor:  h.nomeArtistico || "—",
      dupla:   (h.duoCom && h.duoCom.nomeArtistico) || null,
      horario: h._t,
    })),

    geradoEm: agora == null ? Date.now() : agora,
  };
}

const api = { resumirSessao };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyRelatorio = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
