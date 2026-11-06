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

// ── As vagas do cantor, a partir de TODOS os pedidos dele ──
// O app do celular guardava a vaga com atribuicao simples dentro do laco do
// snapshot ("if (d.slot === 'ativa') filhaAtiva = d"). Com mais de um pedido no
// mesmo slot — e acontece: a NamiiKath teve cinco pendentes em 05/11 — ficava
// so o ULTIMO do snapshot, e os outros desapareciam da trava da musica
// repetida. Foi assim que o Daemon pos "Broken" duas vezes (22:08 e 22:47),
// cantou uma e a outra continuou na fila: para a casa, "a musica cantada voltou".
//
// Devolve as duas vagas (o pedido MAIS ANTIGO de cada uma, pela ordem de
// chegada) e `pendentes`, com todos — e `pendentes` que vai para a trava.
const FORA = new Set(["cantada", "pulada", "cancelada"]);

function vagasDoCantor(pedidos) {
  const lista = (Array.isArray(pedidos) ? pedidos : [])
    .filter(i => i && typeof i === "object" && !FORA.has(i.status));
  const ordem = i => (Number.isFinite(i.ordemFila) ? i.ordemFila : Infinity);
  // Ordem de chegada, com o indice do snapshot como desempate.
  const pendentes = lista
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => (ordem(a.item) - ordem(b.item)) || (a.idx - b.idx))
    .map(x => x.item);
  // Pedido antigo, de antes de o campo slot existir, conta como da vaga ativa.
  const daVaga = nome => pendentes.find(i =>
    (i.slot || "ativa") === nome) || null;
  return { ativa: daVaga("ativa"), espera: daVaga("espera"), pendentes };
}

// ── O cantor trocando as duas musicas dele de lugar ───────
// Pedido do dono (06/11): "o cantor pode alterar a ordem da musica que ele quer
// cantar, ele pode colocar a musica da espera na fila principal e vice versa".
//
// `ordemFila` e so a ordem de CHEGADA e e ela que da a posicao na fila. Trocar
// apenas o `slot` faria a musica promovida entrar com o numero dela — mais
// alto, porque foi pedida depois — e o cantor perderia o lugar na fila por ter
// reordenado as proprias musicas. Entao as duas trocam `slot` E `ordemFila`:
// muda qual musica toca naquele lugar, nao o lugar.
//
// Devolve [{ id, slot, ordemFila }, ...] para gravar, ou null quando a troca
// nao vale. Nada mais do pedido e reescrito.
function trocaDeVagas(ativa, espera) {
  if (!ativa || !espera || ativa.id === espera.id) return null;
  // No palco, sendo chamado ou pronto: trocar mudaria a musica de quem ja esta
  // subindo.
  if (ativa.status !== "aguardando" || espera.status !== "aguardando") return null;
  // Pedido sem slot e da fila principal (o mesmo que vagasDoCantor assume).
  if ((ativa.slot || "ativa") !== "ativa" || espera.slot !== "espera") return null;
  // Numero crú, sem Number(): `Number(null)` da 0, que e finito, e a troca
  // aceitaria um pedido sem posicao — jogando a musica para o fim da fila sem
  // aviso. Mesmo cuidado que ordem.js tem no `ordemDe`.
  const na = ativa.ordemFila, ne = espera.ordemFila;
  if (!Number.isFinite(na) || !Number.isFinite(ne)) return null;
  return [
    { id: ativa.id,  slot: "espera", ordemFila: ne },
    { id: espera.id, slot: "ativa",  ordemFila: na },
  ];
}

const api = { entradaDoHistorico, agruparPorNoite, slotParaPedido, vagasDoCantor, trocaDeVagas };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyHistorico = api;

})(globalThis);
