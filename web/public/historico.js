"use strict";

// Historico pessoal do cantor (historico/{uid}/apresentacoes). A Gerencia
// grava quando a musica termina; o perfil do cantor le e agrupa por noite.
// Guarda o video exato que tocou: pedir de novo pelo historico traz a mesma
// versao, nao "a primeira que o YouTube devolver".

(function (raiz) {

function emMs(t) {
  if (t == null) return null;
  if (typeof t === "number") return t;
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (t instanceof Date) return t.getTime();
  return null;
}

// `quem`: "cantor" (dono do pedido) ou "duo" (o parceiro). Tudo que falta vira
// null — o Firestore recusa undefined e a gravacao inteira falharia.
function entradaDoHistorico(item, sessao, { quem = "cantor" } = {}) {
  const i = item || {}, s = sessao || {};
  const parceiro = quem === "duo" ? i.nomeArtistico : i.duoNome;
  return {
    sessaoId:   s.id || null,
    nomeCasa:   s.nomeCasa || null,
    codigo:     s.codigo || null,
    musica:     i.musica || null,
    artista:    i.artista || null,
    videoId:    i.videoId || null,
    videoUrl:   i.videoUrl || null,
    catalogoId: i.catalogoId || null,
    semitons:   Number(i.semitons) || 0,
    duoCom:     parceiro ? { nomeArtistico: parceiro } : null,
    status:     "cantada",
  };
}

function agruparPorNoite(entradas) {
  const grupos = new Map();
  for (const e of Array.isArray(entradas) ? entradas : []) {
    if (!e || typeof e !== "object") continue;
    const t = emMs(e.data);
    // Registro sem sessao (anterior a este formato) agrupa pelo dia.
    const chave = e.sessaoId || (t != null ? "dia:" + new Date(t).toDateString() : "sem-data");
    if (!grupos.has(chave)) grupos.set(chave, { sessaoId: e.sessaoId || null, nomeCasa: e.nomeCasa || null, data: t, musicas: [] });
    const g = grupos.get(chave);
    g.musicas.push({ ...e, _t: t });
    if (t != null && (g.data == null || t < g.data)) g.data = t;
    if (!g.nomeCasa && e.nomeCasa) g.nomeCasa = e.nomeCasa;
  }
  const lista = [...grupos.values()];
  for (const g of lista) g.musicas.sort((a, b) => (a._t ?? 0) - (b._t ?? 0));
  return lista.sort((a, b) => (b.data ?? 0) - (a.data ?? 0));
}

// Cada cantor tem dois lugares: a fila principal e a espera.
function slotParaPedido({ ativa, espera } = {}) {
  if (!ativa) return "ativa";
  if (!espera) return "espera";
  return null;
}

const api = { entradaDoHistorico, agruparPorNoite, slotParaPedido };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyHistorico = api;

})(globalThis);
