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

const NAO_CANTADA = new Set(["aguardando", "confirmando", "confirmado", "pronto", "cancelada", "tocando"]);

function resumirSessao({ sessao, fila, presencas, historico, agora } = {}) {
  const s = sessao || {};
  const F = Array.isArray(fila) ? fila : [];
  const P = Array.isArray(presencas) ? presencas : [];
  // O historico da sessao guarda as puladas tambem: so as cantadas contam.
  const H = (Array.isArray(historico) ? historico : [])
    .filter(h => h && h.status !== "pulada")
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

// ── Varias noites juntas (tela de relatorios) ───────────────

function dataDaNoite(r) {
  if (!r) return null;
  return r.inicioPlanejado ?? r.primeiraMusica ?? r.geradoEm ?? null;
}

// Grafias diferentes da mesma coisa ("Tempo Perdido" / "tempo perdido") tem
// que somar juntas, senao a mais cantada da casa aparece partida em duas.
const normal = t => String(t || "").trim().toLowerCase().replace(/\s+/g, " ");
const umaCasa = n => Math.round(n * 10) / 10;

function consolidarRelatorios(lista) {
  // So conta como noite o que tem cara de resumo: o banco e compartilhado e
  // um documento torto nao pode derrubar a tela inteira.
  const R = (Array.isArray(lista) ? lista : [])
    .filter(r => r && typeof r === "object" && Array.isArray(r.cantores));

  const musicas = new Map();
  const pessoas = new Map();
  let pedidos = 0, cantadas = 0, participantes = 0;

  for (const r of R) {
    pedidos       += Number(r.pedidos) || 0;
    cantadas      += Number(r.cantadas) || 0;
    participantes += Number(r.participantes) || 0;

    for (const x of (Array.isArray(r.musicas) ? r.musicas : [])) {
      const k = normal(x.musica) + "|" + normal(x.artista);
      if (!musicas.has(k)) musicas.set(k, { musica: String(x.musica || "—").trim(), artista: String(x.artista || "—").trim(), vezes: 0 });
      musicas.get(k).vezes++;
    }
    // Quem aparece duas vezes na mesma noite (registro velho sem uid) conta
    // uma noite so.
    const vistosNaNoite = new Set();
    for (const c of r.cantores) {
      const k = normal(c && c.nome);
      if (!k || k === "—") continue;
      if (!pessoas.has(k)) pessoas.set(k, { nome: String(c.nome).trim(), noites: 0, cantou: 0 });
      const p = pessoas.get(k);
      if (!vistosNaNoite.has(k)) { p.noites++; vistosNaNoite.add(k); }
      p.cantou += Number(c.cantou) || 0;
    }
  }

  return {
    noites: R.length,
    pedidos,
    cantadas,
    participantesUnicos: pessoas.size,
    mediaCantadas:      R.length ? umaCasa(cantadas / R.length) : 0,
    mediaParticipantes: R.length ? umaCasa(participantes / R.length) : 0,
    maisCantadas: [...musicas.values()]
      .sort((a, b) => b.vezes - a.vezes || a.musica.localeCompare(b.musica, "pt-BR"))
      .slice(0, 15),
    cantoresFrequentes: [...pessoas.values()]
      .sort((a, b) => b.noites - a.noites || b.cantou - a.cantou || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, 15),
    porNoite: [...R].sort((a, b) => (dataDaNoite(b) ?? 0) - (dataDaNoite(a) ?? 0)),
    casas: [...new Set(R.map(r => r.nomeCasa).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}

const api = { resumirSessao, consolidarRelatorios, dataDaNoite };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyRelatorio = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
