"use strict";

// Cartoes do guia animado da tela do Publico. Os de regra dependem do que o KJ
// ligou na Gerencia: o do cafe com leite aparecia sempre, mesmo com a
// prioridade desligada, e dizia "passa na frente" — a regra da casa e outra:
// quem ainda nao cantou entra intercalado, e a fila principal nunca para.

(function (raiz) {

const PASSOS = [
  { tipo: "passo", marca: "1", titulo: "Aponte a câmera para o QR ao lado",
    detalhe: "Não precisa instalar nada. O celular abre a página da casa." },
  { tipo: "passo", marca: "2", titulo: "Peça sua música pelo nome",
    detalhe: "Artista e título, só isso. A gente encontra a versão de karaokê." },
  { tipo: "passo", marca: "3", titulo: "Confirme quando for chamado",
    detalhe: "Seu nome aparece nesta tela e o celular avisa. São 30 segundos." },
];

function cartoesDoGuia(regras) {
  const r = regras || {};
  const cartoes = [...PASSOS,
    { tipo: "regra", marca: "♪", titulo: "Uma música por vez na fila",
      detalhe: "Cantou a sua, pode pedir a próxima." },
  ];
  if (r.prioridadeAtiva === true) {
    const min = Number(r.prioridadeMinutos);
    cartoes.push({ tipo: "regra", marca: "☕", titulo: "Quem ainda não cantou entra intercalado",
      detalhe: Number.isFinite(min) && min > 0
        ? `Quando a espera passa de ${min} min: um da fila, um recém-chegado — a fila nunca para.`
        : "Um da fila, um recém-chegado — a fila nunca para." });
  }
  if (r.permitirDuo === true) {
    cartoes.push({ tipo: "regra", marca: "🎤", titulo: "Chame alguém para cantar junto",
      detalhe: "No pedido, escolha o parceiro de dueto. Ele confirma pelo celular." });
  }
  cartoes.push({ tipo: "regra", marca: "⏰", titulo: "A sessão fecha no horário da casa",
    detalhe: "Perto do fim, os pedidos são encerrados." });
  return cartoes;
}

const api = { cartoesDoGuia };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyGuia = api;

})(globalThis);
