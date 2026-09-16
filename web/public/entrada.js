"use strict";

// Entrada paga por noite.
//
// O KJ liga a cobranca e define o valor. O cantor que entra na sessao paga um
// Pix direto na chave do KJ e aperta "Ja paguei"; a Gerencia mostra o aviso e o
// KJ confirma com um toque depois de ver o dinheiro no extrato. Confirmado, o
// cantor pede quantas musicas as regras da casa deixarem, a noite inteira —
// inclusive se o KJ tirar uma musica dele da fila: a entrada continua valendo.
//
// Nao e automatico, e isso foi escolha: Pix direto no Nubank ou na Ton nao tem
// aviso de pagamento que um programa consiga ouvir.
//
// Quem garante a trava e o banco (firestore.rules): pedido de cantor so entra
// na fila com sessoes/{sid}/pagamentos/{uid}.status == "pago", e so a Gerencia
// dona marca "pago". Este arquivo e o que as duas telas mostram.
//
// Copiado para web/public (npm run sincronizar-regras).

(function (raiz) {

const LIMITE_NOME_PAGADOR = 80;

// Estados de sessoes/{sid}/pagamentos/{uid}
//   aguardando  o cantor disse que pagou; falta o KJ conferir
//   pago        o KJ confirmou (ou liberou de cortesia)
//   nao-caiu    o KJ nao achou o Pix; o cantor pode avisar de novo

function cobrancaAtiva(sessao) {
  const c = sessao && sessao.cobranca;
  return !!(c && c.ativa === true && Number(c.valor) > 0);
}

function entradaLiberada(sessao, pagamento) {
  if (!cobrancaAtiva(sessao)) return true;
  return !!pagamento && pagamento.status === "pago";
}

// O que o celular do cantor mostra.
function situacaoDoCantor(sessao, pagamento) {
  if (!cobrancaAtiva(sessao)) return "livre";
  const s = pagamento && pagamento.status;
  if (s === "pago") return "pago";
  if (s === "aguardando") return "aguardando";
  if (s === "nao-caiu") return "nao-caiu";
  return "pagar";
}

function limparNomePagador(nome) {
  return String(nome || "").replace(/\s+/g, " ").trim().slice(0, LIMITE_NOME_PAGADOR);
}

// "Reais" para a tela: 15 -> "R$ 15,00".
function emReais(valor) {
  const n = Number(valor) || 0;
  return "R$ " + n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function emMs(t) {
  if (t == null) return 0;
  if (typeof t === "number") return t;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  return 0;
}

// Fila de conferencia da Gerencia: mais antigo primeiro, que e a ordem em que
// o dinheiro aparece no extrato.
function paraConferir(pagamentos) {
  return (Array.isArray(pagamentos) ? pagamentos : [])
    .filter(p => p && p.status === "aguardando")
    .sort((a, b) => emMs(a.avisadoEm) - emMs(b.avisadoEm));
}

// Pagou e nao cantou nenhuma: e a lista que o KJ precisa ver antes de fechar a
// noite para decidir se devolve (pelo app do banco — o Voxly nao mexe em
// dinheiro). Cortesia nao entra: ninguem pagou.
function pagaramENaoCantaram(pagamentos, historico) {
  const cantaram = new Set();
  for (const h of Array.isArray(historico) ? historico : []) {
    if (!h || h.status === "pulada") continue;
    if (h.cantorUid) cantaram.add(h.cantorUid);
    if (h.duoCom && h.duoCom.uid) cantaram.add(h.duoCom.uid);
  }
  return (Array.isArray(pagamentos) ? pagamentos : [])
    .filter(p => p && p.status === "pago" && !p.cortesia && !cantaram.has(p.id))
    .map(p => ({ uid: p.id, nome: p.nomeArtistico || "—", nomePagador: p.nomePagador || "", valor: Number(p.valor) || 0 }));
}

// Marca ao lado do nome em "Cantores Online", para o KJ saber de relance quem
// pagou. Cantor posto a mao pelo KJ (sem conta) nao passa pelo ingresso.
function marcaDoIngresso(sessao, pagamento, uid) {
  if (!cobrancaAtiva(sessao) || String(uid || "").startsWith("manual_")) return null;
  const s = pagamento && pagamento.status;
  if (s === "pago") return pagamento.cortesia
    ? { icone: "🎁", texto: "cortesia", tom: "ok" }
    : { icone: "🎟️", texto: "pagou", tom: "ok" };
  if (s === "aguardando") return { icone: "⏳", texto: "conferir Pix", tom: "aviso" };
  if (s === "nao-caiu") return { icone: "✗", texto: "Pix não caiu", tom: "ruim" };
  return { icone: "✗", texto: "sem ingresso", tom: "ruim" };
}

// Para o relatorio da noite.
function resumoDaEntrada(sessao, pagamentos) {
  if (!cobrancaAtiva(sessao)) return null;
  const P = Array.isArray(pagamentos) ? pagamentos : [];
  const pagos = P.filter(p => p && p.status === "pago" && !p.cortesia);
  return {
    valor:      Number(sessao.cobranca.valor) || 0,
    pagantes:   pagos.length,
    cortesias:  P.filter(p => p && p.status === "pago" && p.cortesia).length,
    total:      Math.round(pagos.reduce((s, p) => s + (Number(p.valor) || 0), 0) * 100) / 100,
    semConferir: P.filter(p => p && p.status === "aguardando").length,
  };
}

const api = {
  LIMITE_NOME_PAGADOR,
  cobrancaAtiva, entradaLiberada, situacaoDoCantor, limparNomePagador, emReais,
  paraConferir, pagaramENaoCantaram, resumoDaEntrada, marcaDoIngresso,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyEntrada = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
