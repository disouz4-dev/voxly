const test = require("node:test");
const assert = require("node:assert");
const chat = require("../src/chat");

test("cinco respostas de recusa, todas educadas e diferentes", () => {
  assert.equal(chat.RECUSAS.length, 5);
  assert.equal(new Set(chat.RECUSAS).size, 5);
  for (const r of chat.RECUSAS) {
    assert.ok(r.length > 10 && r.length <= 90, r);
    assert.match(r, /obrigad|gentileza|valeu|agrade/i, `sem agradecer: ${r}`);
  }
});

test("a recusa vai como numero e volta como texto", () => {
  assert.equal(chat.respostaDaRecusa(0), chat.RECUSAS[0]);
  assert.equal(chat.respostaDaRecusa("4"), chat.RECUSAS[4]);
});

test("numero de recusa inventado nao mostra nada estranho", () => {
  for (const ruim of [5, -1, 1.5, "abc", null, undefined, "<img src=x>"]) {
    assert.equal(chat.respostaDaRecusa(ruim), "O convite foi recusado.");
  }
});

test("receber conversa vem ligado; so quem desligou nao recebe", () => {
  assert.equal(chat.aceitaConversa({}), true);
  assert.equal(chat.aceitaConversa({ aceitaChat: true }), true);
  assert.equal(chat.aceitaConversa({ aceitaChat: false }), false);
  assert.equal(chat.aceitaConversa(null), false);
});

test("a conversa so e oferecida se os dois aceitam", () => {
  assert.equal(chat.podeOferecerConversa({}, {}), true);
  assert.equal(chat.podeOferecerConversa({ aceitaChat: false }, {}), false);
  assert.equal(chat.podeOferecerConversa({}, { aceitaChat: false }), false);
});

test("texto: tira espaco, junta linhas vazias, corta no limite", () => {
  assert.equal(chat.limparTexto("  oi  "), "oi");
  assert.equal(chat.limparTexto("a\r\n\r\n\r\n\r\nb"), "a\n\nb");
  assert.equal(chat.limparTexto("x".repeat(900)).length, chat.LIMITE_TEXTO);
  assert.equal(chat.limparTexto(null), "");
});

test("mensagem sai com exatamente os campos que o banco aceita", () => {
  const m = chat.novaMensagem({ uid: "u1", nome: "Bia", texto: " bora! ", agora: 1234.7 });
  assert.deepEqual(m, { deUid: "u1", deNome: "Bia", texto: "bora!", em: 1234 });
  assert.deepEqual(Object.keys(m).sort(), ["deNome", "deUid", "em", "texto"]);
});

test("mensagem vazia ou sem remetente nao e enviada", () => {
  assert.equal(chat.novaMensagem({ uid: "u1", texto: "   \n  " }), null);
  assert.equal(chat.novaMensagem({ texto: "oi" }), null);
});

test("nome gigante e cortado", () => {
  assert.equal(chat.novaMensagem({ uid: "u", nome: "n".repeat(300), texto: "oi", agora: 1 }).deNome.length, chat.LIMITE_NOME);
});

test("cinco mensagens em dez segundos passa; a sexta espera", () => {
  const agora = 100000;
  const cinco = [91000, 93000, 95000, 97000, 99000];
  assert.equal(chat.podeEnviar(cinco.slice(0, 4), agora), true);
  assert.equal(chat.podeEnviar(cinco, agora), false);
  assert.equal(chat.podeEnviar(cinco, agora + 2000), true, "a mais velha saiu da janela");
  assert.equal(chat.podeEnviar(undefined, agora), true);
});

test("conversa cheia ou fechada nao aceita mais nada", () => {
  const cheia = { status: "aberto", mensagens: new Array(chat.LIMITE_MENSAGENS).fill({}) };
  assert.equal(chat.conversaCheia(cheia), true);
  assert.equal(chat.conversaAberta(cheia), false);
  assert.equal(chat.conversaAberta({ status: "fechado", mensagens: [] }), false);
  assert.equal(chat.conversaAberta({ status: "aberto", mensagens: [] }), true);
});

test("acha o parceiro da conversa", () => {
  const c = { participantes: ["a", "b"] };
  assert.equal(chat.outroParticipante(c, "a"), "b");
  assert.equal(chat.outroParticipante(c, "b"), "a");
  assert.equal(chat.outroParticipante(null, "a"), null);
});

test("nao lidas: so as do outro, depois da ultima olhada", () => {
  const c = {
    vistoEm: { a: 200 },
    mensagens: [
      { deUid: "b", em: 100 }, { deUid: "b", em: 300 }, { deUid: "a", em: 350 }, { deUid: "b", em: 400 },
    ],
  };
  assert.equal(chat.naoLidas(c, "a"), 2);
  assert.equal(chat.naoLidas(c, "b"), 1, "b nunca olhou: conta a mensagem de a");
  assert.equal(chat.naoLidas({}, "a"), 0);
});

test("conversa nasce so de convite aceito, e so para quem esta no convite", () => {
  const convite = { status: "aceito", deUid: "a", deNome: "Rafa", paraUid: "b", paraNome: "Bia", musica: "Zombie", artista: "The Cranberries" };
  const c = chat.conversaDoConvite(convite, "b");
  assert.deepEqual(c.participantes, ["a", "b"]);
  assert.deepEqual(c.nomes, { a: "Rafa", b: "Bia" });
  assert.equal(c.abertoPor, "b");
  assert.equal(c.status, "aberto");
  assert.deepEqual(c.mensagens, []);

  assert.equal(chat.conversaDoConvite({ ...convite, status: "pendente" }, "b"), null);
  assert.equal(chat.conversaDoConvite({ ...convite, status: "recusado" }, "b"), null);
  assert.equal(chat.conversaDoConvite(convite, "intruso"), null);
});

// ── Pedir para cantar junto ────────────────────────────────

const musica = { id: "f1", cantorUid: "rafa", status: "aguardando", duoUid: null };
const regras = { permitirDuo: true };

test("pedir para cantar junto: na musica dos outros que espera e nao tem parceiro", () => {
  assert.equal(chat.podePedirParaCantar(musica, "bia", regras, new Set()), true);
});

test("nao pede na propria musica, com duo desligado, nem em musica ja com parceiro", () => {
  assert.equal(chat.podePedirParaCantar(musica, "rafa", regras, new Set()), false);
  assert.equal(chat.podePedirParaCantar(musica, "bia", { permitirDuo: false }, new Set()), false);
  assert.equal(chat.podePedirParaCantar({ ...musica, duoUid: "tuca" }, "bia", regras, new Set()), false);
  assert.equal(chat.podePedirParaCantar({ ...musica, status: "tocando" }, "bia", regras, new Set()), false);
  assert.equal(chat.podePedirParaCantar({ ...musica, cantorUid: "manual_x" }, "bia", regras, new Set()), false);
});

test("quem ja pediu nao pede de novo na mesma musica", () => {
  assert.equal(chat.podePedirParaCantar(musica, "bia", regras, new Set(["f1"])), false);
});

test("o pedido tem id proprio, que nao colide com o convite do dono", () => {
  assert.equal(chat.idDoPedidoParaCantar("f1", "bia"), "f1_pede_bia");
  assert.notEqual(chat.idDoPedidoParaCantar("f1", "bia"), "f1");
});

test("aceitou um pedido: os outros pendentes da mesma musica se fecham", () => {
  const convites = [
    { id: "f1_pede_bia",  tipo: "pedido", status: "pendente", filaItemId: "f1" },
    { id: "f1_pede_tuca", tipo: "pedido", status: "pendente", filaItemId: "f1" },
    { id: "f1_pede_duda", tipo: "pedido", status: "recusado", filaItemId: "f1" },
    { id: "f2_pede_mari", tipo: "pedido", status: "pendente", filaItemId: "f2" },
    { id: "f1",           status: "pendente", filaItemId: "f1" },
  ];
  assert.deepEqual(chat.pedidosParaFechar(convites, "f1", "f1_pede_bia"), ["f1_pede_tuca"]);
});

test("texto da resposta para quem pediu ou convidou", () => {
  assert.match(chat.textoDaResposta({ status: "preenchido" }), /parceiro/);
  assert.match(chat.textoDaResposta({ status: "aceito", tipo: "pedido" }), /juntos/);
  assert.equal(chat.textoDaResposta({ status: "recusado", resposta: 1 }), chat.RECUSAS[1]);
});

test("aceitar convites de dueto vem ligado; so quem desligou nao recebe", () => {
  assert.equal(chat.aceitaDueto({}), true);
  assert.equal(chat.aceitaDueto({ aceitaDueto: true }), true);
  assert.equal(chat.aceitaDueto({ aceitaDueto: false }), false);
  assert.equal(chat.aceitaDueto(null), false, "sem perfil nao da para convidar");
  assert.match(chat.AVISO_SEM_DUETO, /não tem habilitado convites para cantar/);
});
