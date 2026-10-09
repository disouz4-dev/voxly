"use strict";

// Controle do Palco pelo celular do dono (pedido dele em 02/10: "quero poder
// dar play remotamente pelo meu usuario logado").
//
// A Gerencia entra no Firebase de forma anonima, entao ela nao conhece o uid
// da conta Google dele. O que ela tem e o e-mail que ele digita uma vez em
// Ajustes. Quem prova quem e, no fim, e o banco: o e-mail vem assinado dentro
// do token do Google, e a regra compara com o e-mail guardado na sessao.
//
// Cada toque no celular vira UM documento em sessoes/{sid}/comandos. Documento
// novo em vez de campo unico, porque:
//   - dois toques nao se sobrescrevem nem se perdem;
//   - a Gerencia apaga o documento ANTES de executar, e assim o mesmo comando
//     nunca roda duas vezes (nem quando outra Gerencia abre a mesma sessao);
//   - comando velho nao ressuscita: o que passou da idade e so apagado.
//
// Acao destrutiva (pular, adiar) carrega o ALVO: o id do pedido que estava no
// palco quando ele tocou o botao. Se a musica ja virou, o comando e descartado
// — senao o toque atrasado pulava a musica de outra pessoa.

(function (raiz) {

// O que o celular pode mandar. Tudo o que nao esta aqui, o banco recusa.
const ACOES = {
  tocar:          { alvo: false, descricao: "Play — retoma ou sobe o proximo" },
  pausar:         { alvo: false, descricao: "Pausa a musica no ar" },
  pular:          { alvo: true,  palco: true, descricao: "Pula a musica no ar" },
  cantarNaProxima:{ alvo: true,  palco: true, descricao: "Adia quem nao esta, sem tirar da fila" },
  chamarProximo:  { alvo: false, descricao: "Chama o proximo da fila" },
  // Tela de admin (celular do KJ): o trabalho roda na estacao, o celular manda.
  procurar:       { alvo: true,  descricao: "Procura versoes no YouTube para o pedido" },
  baixarVersao:   { alvo: true,  valor: true, descricao: "Baixa a versao escolhida (id do video ou link)" },
  remover:        { alvo: true,  descricao: "Tira o pedido da fila" },
};

const VALOR_MAX = 200;   // id de video ou link; nada gigante entra no comando

const IDADE_MAXIMA_S = 90;   // comando parado mais que isso e so lixo

function emMs(t) {
  if (t == null) return null;
  if (typeof t === "number") return t;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (t instanceof Date) return t.getTime();
  return null;
}

// Forma de um comando aceitavel. Vale no celular (antes de mandar) e na
// Gerencia (antes de executar) — a regra do Firestore faz a mesma conferencia.
function comandoValido(cmd) {
  if (!cmd || typeof cmd !== "object") return false;
  const def = ACOES[cmd.acao];
  if (!def) return false;
  if (def.alvo && (typeof cmd.alvoId !== "string" || !cmd.alvoId)) return false;
  if (!def.alvo && cmd.alvoId != null && typeof cmd.alvoId !== "string") return false;
  if (def.valor && (typeof cmd.valor !== "string" || !cmd.valor || cmd.valor.length > VALOR_MAX)) return false;
  if (!def.valor && cmd.valor != null && typeof cmd.valor !== "string") return false;
  return true;
}

// O que a Gerencia faz com um comando que chegou.
//   { fazer: true }                      — executa
//   { fazer: false, motivo: "..." }      — descarta (e apaga do banco)
// `estado`: { itemNoPalco, chamandoId } — o que a Gerencia ve agora.
function julgarComando(cmd, { agora = null, estado = {}, idadeMaximaS = IDADE_MAXIMA_S } = {}) {
  if (!comandoValido(cmd)) return { fazer: false, motivo: "comando desconhecido" };

  const t = emMs(cmd.criadoEm);
  const quando = agora == null ? null : agora;
  if (t != null && quando != null) {
    if (t - quando > 5000)  return { fazer: false, motivo: "comando com hora no futuro" };
    if (quando - t > idadeMaximaS * 1000) return { fazer: false, motivo: "comando velho" };
  }

  // Acao de PALCO (pular/cantar na proxima): so vale se o palco ainda estiver
  // onde o celular viu, senao um toque atrasado pularia a musica de outra
  // pessoa. As acoes de admin (procurar, baixar versao, remover) miram um
  // pedido QUALQUER da fila pelo id — a Gerencia confere se o item existe.
  if (ACOES[cmd.acao].palco) {
    const alvoAtual = cmd.acao === "cantarNaProxima"
      ? (estado.itemNoPalco || estado.chamandoId || null)
      : (estado.itemNoPalco || null);
    if (!alvoAtual) return { fazer: false, motivo: "nada no palco para esse comando" };
    if (alvoAtual !== cmd.alvoId) return { fazer: false, motivo: "a musica ja virou" };
  }
  return { fazer: true, alvo: cmd.alvoId || null, valor: cmd.valor || null };
}

// O e-mail que a Gerencia guarda e o que o Google manda vem com caixa e
// espaco diferentes; comparar cru deixava o dono de fora do proprio controle.
function normalizarEmail(email) {
  return String(email == null ? "" : email).trim().toLowerCase();
}

function mesmoDono(emailDaSessao, emailDoToken) {
  const a = normalizarEmail(emailDaSessao);
  const b = normalizarEmail(emailDoToken);
  return !!a && a === b;
}

const api = { ACOES, IDADE_MAXIMA_S, comandoValido, julgarComando, normalizarEmail, mesmoDono };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyComando = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
