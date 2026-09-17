"use strict";

// Conversa entre os dois cantores de um dueto.
//
// So nasce de um convite de dueto ACEITO, e so se os dois aceitam receber
// conversas (cantores/{uid}.aceitaChat, que vale true enquanto a pessoa nao
// desligar). Vive dentro da sessao (sessoes/{sid}/chats/{idDoConvite}) e morre
// com ela na faxina: conversa de karaoke nao vira arquivo de ninguem.
//
// A conversa inteira mora num documento so, com as mensagens numa lista. Um
// ouvinte por conversa, uma escrita por mensagem, e apagar a noite apaga tudo
// de uma vez — sem subcolecao para esquecer. O teto de mensagens segura o
// tamanho do documento e o abuso.
//
// Copiado para web/public (npm run sincronizar-regras). As regras do Firestore
// repetem os limites daqui; mudou um, muda o outro.

(function (raiz) {

const LIMITE_TEXTO      = 500;
const LIMITE_MENSAGENS  = 200;
const LIMITE_NOME       = 60;
// Mais que isso em dez segundos e colar texto em loop, nao conversa.
const RAJADA = { envios: 5, janelaMs: 10 * 1000 };

// Quem recusa escolhe uma destas. O convite guarda so o NUMERO: texto livre
// na recusa virava canal para mandar qualquer coisa para quem convidou.
const RECUSAS = [
  "Obrigado pelo convite! Dessa vez vou passar, mas boa apresentação!",
  "Que gentileza! Não conheço bem essa música, fica pra próxima.",
  "Valeu por lembrar de mim! Hoje prefiro cantar solo.",
  "Agradeço muito! Agora estou só curtindo, mas vou torcer por você.",
  "Obrigado pelo carinho! Não vai dar agora, quem sabe numa próxima noite.",
];

function respostaDaRecusa(indice) {
  // Number(null) e Number("") dao 0, que e uma resposta valida: sem esta
  // guarda, convite sem resposta aparecia como a primeira recusa.
  if (indice === null || indice === undefined || indice === "") return "O convite foi recusado.";
  const i = Number(indice);
  return Number.isInteger(i) && i >= 0 && i < RECUSAS.length ? RECUSAS[i] : "O convite foi recusado.";
}

// Aceitar convites e pedidos de dueto. Tambem ligado por padrao. Desligado,
// ninguem convida a pessoa nem pede para cantar na musica dela — e quem tenta
// e avisado, em vez de ficar esperando uma resposta que nunca vem.
const AVISO_SEM_DUETO = "Esse cantor não tem habilitado convites para cantar.";
function aceitaDueto(perfil) {
  return !!perfil && perfil.aceitaDueto !== false;
}

// Ligado por padrao: so quem desligou de proposito deixa de receber.
function aceitaConversa(perfil) {
  return !!perfil && perfil.aceitaChat !== false;
}

function podeOferecerConversa(meuPerfil, perfilDoOutro) {
  return aceitaConversa(meuPerfil) && aceitaConversa(perfilDoOutro);
}

// Tira espaco das pontas, junta linhas em branco repetidas e corta no limite.
function limparTexto(texto) {
  return String(texto == null ? "" : texto)
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, LIMITE_TEXTO);
}

// A mensagem com exatamente os campos que as regras aceitam. Texto vazio nao
// vira mensagem.
function novaMensagem({ uid, nome, texto, agora } = {}) {
  const t = limparTexto(texto);
  if (!t || !uid) return null;
  return {
    deUid:  String(uid),
    deNome: String(nome || "").slice(0, LIMITE_NOME),
    texto:  t,
    em:     Math.floor(Number(agora) || Date.now()),
  };
}

function podeEnviar(enviosRecentes, agora) {
  const desde = (Number(agora) || Date.now()) - RAJADA.janelaMs;
  const naJanela = (Array.isArray(enviosRecentes) ? enviosRecentes : []).filter(t => t > desde);
  return naJanela.length < RAJADA.envios;
}

function conversaCheia(chat) {
  return !!chat && Array.isArray(chat.mensagens) && chat.mensagens.length >= LIMITE_MENSAGENS;
}

function conversaAberta(chat) {
  return !!chat && chat.status === "aberto" && !conversaCheia(chat);
}

function outroParticipante(chat, uid) {
  const p = (chat && Array.isArray(chat.participantes)) ? chat.participantes : [];
  return p.find(u => u !== uid) || null;
}

// Mensagens do outro que chegaram depois da ultima vez que eu olhei.
function naoLidas(chat, uid) {
  if (!chat || !Array.isArray(chat.mensagens)) return 0;
  const visto = Number(chat.vistoEm && chat.vistoEm[uid]) || 0;
  return chat.mensagens.filter(m => m && m.deUid !== uid && Number(m.em) > visto).length;
}

// O documento que abre a conversa. O id e o do convite: um dueto, uma conversa.
function conversaDoConvite(convite, meuUid) {
  if (!convite || convite.status !== "aceito" || !convite.deUid || !convite.paraUid) return null;
  if (meuUid !== convite.deUid && meuUid !== convite.paraUid) return null;
  return {
    participantes: [convite.deUid, convite.paraUid],
    nomes: {
      [convite.deUid]:   String(convite.deNome || "").slice(0, LIMITE_NOME),
      [convite.paraUid]: String(convite.paraNome || "").slice(0, LIMITE_NOME),
    },
    musica:    convite.musica || null,
    artista:   convite.artista || null,
    abertoPor: meuUid,
    status:    "aberto",
    mensagens: [],
    vistoEm:   {},
  };
}

// ── Pedir para cantar junto ────────────────────────────────
// O caminho inverso do convite: quem esta na sessao pede para entrar na musica
// de outra pessoa, e o dono aceita ou recusa. E um convite com tipo "pedido":
// deUid e quem pede, paraUid e o dono da musica.

// Id proprio, diferente do convite que o dono faz (que usa o id do pedido da
// fila): os dois caminhos convivem sem um sobrescrever o outro.
function idDoPedidoParaCantar(itemId, uid) {
  return `${itemId}_pede_${uid}`;
}

// Mostra "Pedir para cantar junto" na musica dos outros que ainda espera,
// ainda nao tem parceiro, e para a qual eu ainda nao pedi.
function podePedirParaCantar(item, meuUid, regras, jaPedi) {
  if (!item || !meuUid) return false;
  if (!regras || regras.permitirDuo === false) return false;
  if (item.cantorUid === meuUid || item.duoUid === meuUid) return false;
  if (String(item.cantorUid || "").startsWith("manual_")) return false;
  if (item.status !== "aguardando" || item.duoUid) return false;
  return !(jaPedi && jaPedi.has && jaPedi.has(item.id));
}

// Aceitou um: os outros pedidos pendentes para a mesma musica se fecham.
function pedidosParaFechar(convites, filaItemId, aceitoId) {
  return (Array.isArray(convites) ? convites : [])
    .filter(c => c && c.tipo === "pedido" && c.status === "pendente"
      && c.filaItemId === filaItemId && c.id !== aceitoId)
    .map(c => c.id);
}

// O que aparece para quem pediu ou convidou, quando vem a resposta.
function textoDaResposta(c) {
  if (!c) return "";
  if (c.status === "preenchido") return "Essa música já ganhou um parceiro. Fica pra próxima!";
  if (c.status === "aceito") return c.tipo === "pedido" ? "Aceitou! Vocês cantam juntos." : "Aceitou o convite!";
  return respostaDaRecusa(c.resposta);
}

const api = {
  LIMITE_TEXTO, LIMITE_MENSAGENS, LIMITE_NOME, RAJADA, RECUSAS, AVISO_SEM_DUETO, aceitaDueto,
  respostaDaRecusa, aceitaConversa, podeOferecerConversa, limparTexto, novaMensagem,
  podeEnviar, conversaCheia, conversaAberta, outroParticipante, naoLidas, conversaDoConvite,
  idDoPedidoParaCantar, podePedirParaCantar, pedidosParaFechar, textoDaResposta,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyChat = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
