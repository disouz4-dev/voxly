// Confere as regras do Firestore (web/firestore.rules) contra o banco de
// verdade, com dois usuarios anonimos: a Gerencia DONA de uma sessao de teste e
// um ESTRANHO (que e o que qualquer pessoa do mundo consegue ser, porque o
// login anonimo e aberto).
//
// Nao entra no `npm test`: precisa de internet e escreve no banco. Cria uma
// sessao "REGRAS (teste automatico)" e apaga tudo no fim.
//
// Uso: node test/regras-firestore.mjs

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getFirestore, doc, collection, setDoc, updateDoc, deleteDoc, getDoc, getDocs, serverTimestamp, Timestamp, arrayUnion,
} from "firebase/firestore";

const CONFIG = {
  apiKey: "AIzaSyB5sPKpmPVWDDhwprU8TB0Bn0N0WSiafoI",
  authDomain: "voxly-karaoke.firebaseapp.com",
  projectId: "voxly-karaoke",
  storageBucket: "voxly-karaoke.firebasestorage.app",
  messagingSenderId: "689541919299",
  appId: "1:689541919299:web:92e70bbd3a1a2709d5daf6",
};

async function entrar(nome) {
  const app = initializeApp(CONFIG, nome);
  const cred = await signInAnonymously(getAuth(app));
  return { uid: cred.user.uid, bd: getFirestore(app), nome };
}

let falhas = 0, certos = 0;
async function deve(quem, oque, acao) { await conferir(true, quem, oque, acao); }
async function naoDeve(quem, oque, acao) { await conferir(false, quem, oque, acao); }
async function conferir(esperadoOk, quem, oque, acao) {
  let ok = true, erro = null;
  try { await acao(); } catch (e) { ok = false; erro = e.code || e.message; }
  if (ok === esperadoOk) {
    certos++;
    console.log(`  ok    ${quem} ${esperadoOk ? "pode" : "não pode"} ${oque}`);
  } else {
    falhas++;
    console.log(`  FALHA ${quem} ${esperadoOk ? "deveria poder" : "NÃO deveria poder"} ${oque}` +
      (erro ? ` — ${erro}` : ""));
  }
}

const dono = await entrar("dono");
const estranho = await entrar("estranho");
const SID = "regras-teste-" + Date.now().toString(36);
const sessao = (bd) => doc(bd, "sessoes", SID);
const item = (bd, id) => doc(bd, "sessoes", SID, "fila", id);

console.log(`Sessão de teste: ${SID}\n  dona: ${dono.uid}\n  estranho: ${estranho.uid}\n`);

console.log("── A Gerência dona manda na própria sessão ──");
await deve("a dona", "abrir a sessão", () => setDoc(sessao(dono.bd), {
  codigo: "TESTE", nomeCasa: "REGRAS (teste automático)", status: "ativa", filaAberta: true,
  donoUid: dono.uid, criadaPor: dono.uid, hostVivoEm: serverTimestamp(),
  horarioTermino: Timestamp.fromMillis(Date.now() + 3600e3), iniciadaEm: serverTimestamp(),
}));
await deve("a dona", "editar a sessão", () => updateDoc(sessao(dono.bd), { nomeCasa: "REGRAS (teste)" }));
await deve("a dona", "pôr música na fila por um cantor sem conta", () => setDoc(item(dono.bd, "manual"), {
  cantorUid: "manual_x", nomeArtistico: "Cantor Manual", musica: "M", artista: "A", status: "aguardando", slot: "ativa",
}));
await deve("a dona", "gravar o histórico da sessão", () =>
  setDoc(doc(dono.bd, "sessoes", SID, "historico", "h1"), { musica: "M", status: "cantada" }));
await deve("a dona", "gravar o relatório da noite", () =>
  setDoc(doc(dono.bd, "relatorios", SID), { nomeCasa: "REGRAS (teste)", cantadas: 1 }));

console.log("\n── O cantor mexe no que é dele ──");
await deve("o cantor", "marcar presença", () =>
  setDoc(doc(estranho.bd, "sessoes", SID, "presencas", estranho.uid), { nomeArtistico: "Cantor", status: "aqui" }));
await deve("o cantor", "pedir a própria música", () => setDoc(item(estranho.bd, "pedido_cantor"), {
  cantorUid: estranho.uid, nomeArtistico: "Cantor", musica: "Zombie", artista: "The Cranberries",
  status: "aguardando", slot: "ativa", ordemFila: 1,
}));
await deve("o cantor", "trocar o tom do próprio pedido", () =>
  updateDoc(item(estranho.bd, "pedido_cantor"), { semitons: -2 }));
await deve("o cantor", "pedir busca no YouTube", () =>
  setDoc(doc(estranho.bd, "sessoes", SID, "buscas", "b1"), { termo: "zombie", status: "pendente" }));
await deve("o cantor", "mandar o pedido de tocar (campo comando)", () =>
  updateDoc(sessao(estranho.bd), { comando: { acao: "tocar", itemId: "pedido_cantor", ts: Date.now() } }));
await deve("o cantor", "desistir do próprio pedido", () => deleteDoc(item(estranho.bd, "pedido_cantor")));

console.log("\n── O estranho não encosta na noite dos outros ──");
await naoDeve("o estranho", "apagar a sessão", () => deleteDoc(sessao(estranho.bd)));
await naoDeve("o estranho", "encerrar a sessão", () => updateDoc(sessao(estranho.bd), { status: "encerrada" }));
await naoDeve("o estranho", "apagar o pedido de outro", () => deleteDoc(item(estranho.bd, "manual")));
await naoDeve("o estranho", "mudar o pedido de outro", () => updateDoc(item(estranho.bd, "manual"), { status: "cancelada" }));
await naoDeve("o estranho", "criar pedido no nome de outro", () => setDoc(item(estranho.bd, "falso"), {
  cantorUid: "manual_x", nomeArtistico: "Cantor Manual", musica: "X", status: "aguardando", slot: "ativa",
}));
await naoDeve("o estranho", "mexer na presença de outro", () =>
  setDoc(doc(estranho.bd, "sessoes", SID, "presencas", "manual_x"), { status: "offline" }));
await naoDeve("o estranho", "gravar o histórico da sessão", () =>
  setDoc(doc(estranho.bd, "sessoes", SID, "historico", "h2"), { musica: "X" }));
await naoDeve("o estranho", "gravar o relatório da noite", () =>
  setDoc(doc(estranho.bd, "relatorios", SID), { nomeCasa: "invadido" }));
await naoDeve("o estranho", "apagar o relatório", () => deleteDoc(doc(estranho.bd, "relatorios", SID)));
await naoDeve("o estranho", "gravar no histórico pessoal de outro cantor", () =>
  setDoc(doc(estranho.bd, "historico", "outro_cantor", "apresentacoes", "x"), { musica: "X", sessaoId: SID }));
await deve("o estranho", "ler a sessão (o app do cantor precisa)", () => getDoc(sessao(estranho.bd)));

console.log("\n── Histórico pessoal do cantor ──");
await deve("a dona", "gravar o histórico pessoal de quem cantou", () =>
  setDoc(doc(dono.bd, "historico", estranho.uid, "apresentacoes", SID + "_1"),
    { sessaoId: SID, musica: "Zombie", artista: "The Cranberries", status: "cantada" }));
await deve("o cantor", "ler o próprio histórico", () =>
  getDocs(collection(estranho.bd, "historico", estranho.uid, "apresentacoes")));
await naoDeve("o estranho", "ler o histórico de outro cantor", () =>
  getDocs(collection(estranho.bd, "historico", "outro_cantor", "apresentacoes")));

console.log("\n── Sessão abandonada pode ser derrubada de outra máquina ──");
const SID2 = SID + "-abandonada";
await deve("a dona", "abrir uma sessão que ficará abandonada", () => setDoc(doc(dono.bd, "sessoes", SID2), {
  codigo: "VELHA", nomeCasa: "REGRAS (abandonada)", status: "ativa", donoUid: dono.uid,
  hostVivoEm: Timestamp.fromMillis(Date.now() - 30 * 60e3),   // sem marcar presença há 30 min
}));
await deve("outra Gerência", "derrubar a sessão abandonada", () => deleteDoc(doc(estranho.bd, "sessoes", SID2)));

console.log("\n── Convite de dueto e conversa ──");
const ana  = await entrar("ana");
const beto = await entrar("beto");
const convite = (bd, id) => doc(bd, "sessoes", SID, "convites", id);
const conversa = (bd, id) => doc(bd, "sessoes", SID, "chats", id);
const msg = (quem, texto, extra = {}) => ({ deUid: quem.uid, deNome: quem.nome, texto, em: Date.now(), ...extra });
const mensagens = async (bd, id) => (await getDoc(conversa(bd, id))).data().mensagens;

await deve("a Ana", "criar o próprio perfil", () => setDoc(doc(ana.bd, "cantores", ana.uid), { nomeArtistico: "Ana" }));
await deve("o Beto", "criar o próprio perfil", () => setDoc(doc(beto.bd, "cantores", beto.uid), { nomeArtistico: "Beto" }));
await deve("a Ana", "convidar o Beto para um dueto", () => setDoc(convite(ana.bd, "c1"), {
  deUid: ana.uid, deNome: "Ana", paraUid: beto.uid, paraNome: "Beto", musica: "Zombie", status: "pendente",
}));

const novaConversa = { participantes: [ana.uid, beto.uid], nomes: { [ana.uid]: "Ana", [beto.uid]: "Beto" }, status: "aberto", mensagens: [], vistoEm: {} };
await naoDeve("a Ana", "criar convite já nascido aceito", () => setDoc(convite(ana.bd, "c_falso"), {
  deUid: ana.uid, deNome: "Ana", paraUid: beto.uid, paraNome: "Beto", musica: "X", status: "aceito",
}));
await naoDeve("a Ana", "aceitar sozinha o convite que ela mandou", () => updateDoc(convite(ana.bd, "c1"), { status: "aceito" }));
// Trocar o destinatario de um convite AINDA PENDENTE e o mesmo que cancelar e
// convidar outra pessoa — e a conferencia de quem desligou convites vale nos dois.
await deve("a Ana", "convidar outra pessoa para a mesma música", () =>
  updateDoc(convite(ana.bd, "c1"), { paraUid: estranho.uid, paraNome: "Estranho", status: "pendente" }));
await deve("a Ana", "voltar a convidar o Beto", () =>
  updateDoc(convite(ana.bd, "c1"), { paraUid: beto.uid, paraNome: "Beto", status: "pendente" }));
await deve("a Ana", "cancelar o convite que ela mandou", () => updateDoc(convite(ana.bd, "c1"), { status: "cancelado" }));
await deve("a Ana", "convidar de novo (pendente)", () => setDoc(convite(ana.bd, "c1"), {
  deUid: ana.uid, deNome: "Ana", paraUid: beto.uid, paraNome: "Beto", musica: "Zombie", artista: "The Cranberries", status: "pendente",
}));
await naoDeve("o Beto", "abrir conversa antes de aceitar o convite", () => setDoc(conversa(beto.bd, "c1"), novaConversa));
await deve("o Beto", "aceitar o convite", () => updateDoc(convite(beto.bd, "c1"), { status: "aceito" }));
await naoDeve("a Ana", "mexer no convite depois de aceito", () =>
  updateDoc(convite(ana.bd, "c1"), { paraUid: estranho.uid, status: "pendente" }));
await naoDeve("o estranho", "abrir a conversa do dueto dos outros", () => setDoc(conversa(estranho.bd, "c1"), novaConversa));
await naoDeve("o Beto", "abrir conversa pondo um terceiro dentro", () =>
  setDoc(conversa(beto.bd, "c1"), { ...novaConversa, participantes: [beto.uid, estranho.uid] }));
await deve("o Beto", "abrir a conversa depois de aceitar", () => setDoc(conversa(beto.bd, "c1"), novaConversa));

await deve("a Ana", "mandar mensagem", () => updateDoc(conversa(ana.bd, "c1"), { mensagens: arrayUnion(msg(ana, "Bora! Tom original?")) }));
await deve("o Beto", "ler a conversa", () => getDoc(conversa(beto.bd, "c1")));
await deve("o Beto", "responder", () => updateDoc(conversa(beto.bd, "c1"), { mensagens: arrayUnion(msg(beto, "Fechado")) }));
await naoDeve("o estranho", "ler a conversa", () => getDoc(conversa(estranho.bd, "c1")));
await naoDeve("a Gerência", "ler a conversa (é só dos dois)", () => getDoc(conversa(dono.bd, "c1")));
await naoDeve("o estranho", "mandar mensagem na conversa", () =>
  updateDoc(conversa(estranho.bd, "c1"), { mensagens: arrayUnion(msg(estranho, "oi")) }));
await naoDeve("a Ana", "mandar mensagem em nome do Beto", () =>
  updateDoc(conversa(ana.bd, "c1"), { mensagens: arrayUnion({ ...msg(ana, "sou o Beto"), deUid: beto.uid }) }));
await naoDeve("a Ana", "mandar mensagem com mais de 500 letras", () =>
  updateDoc(conversa(ana.bd, "c1"), { mensagens: arrayUnion(msg(ana, "x".repeat(501))) }));
await naoDeve("a Ana", "mandar mensagem com campo a mais", () =>
  updateDoc(conversa(ana.bd, "c1"), { mensagens: arrayUnion(msg(ana, "oi", { foto: "http://x" })) }));
const atuais = await mensagens(ana.bd, "c1");
if (!atuais || atuais.length < 2) { falhas++; console.log("  FALHA a conversa devia ter 2 mensagens antes dos testes de reescrever"); }
await naoDeve("a Ana", "reescrever mensagem antiga", () =>
  updateDoc(conversa(ana.bd, "c1"), { mensagens: [{ ...atuais[0], texto: "editado" }, atuais[1], msg(ana, "nova")] }));
await naoDeve("a Ana", "enfiar mensagem falsa do Beto no meio, reordenando", () =>
  updateDoc(conversa(ana.bd, "c1"), { mensagens: [{ ...msg(ana, "sou o Beto"), deUid: beto.uid }, atuais[0], atuais[1]] }));
await naoDeve("a Ana", "apagar a mensagem do Beto", () =>
  updateDoc(conversa(ana.bd, "c1"), { mensagens: [atuais[0]] }));
await deve("o Beto", "marcar o que leu", () => updateDoc(conversa(beto.bd, "c1"), { [`vistoEm.${beto.uid}`]: Date.now() }));
await naoDeve("o Beto", "marcar como lido pela Ana", () => updateDoc(conversa(beto.bd, "c1"), { [`vistoEm.${ana.uid}`]: Date.now() }));
await naoDeve("o Beto", "trocar os participantes", () =>
  updateDoc(conversa(beto.bd, "c1"), { participantes: [beto.uid, estranho.uid] }));
await deve("a Ana", "encerrar a conversa", () => updateDoc(conversa(ana.bd, "c1"), { status: "fechado", fechadoPor: ana.uid }));
await naoDeve("o Beto", "mandar mensagem na conversa encerrada", () =>
  updateDoc(conversa(beto.bd, "c1"), { mensagens: arrayUnion(msg(beto, "ei")) }));
await naoDeve("o Beto", "reabrir a conversa encerrada", () => updateDoc(conversa(beto.bd, "c1"), { status: "aberto" }));

console.log("\n── Recusa com resposta pronta ──");
await deve("a Ana", "convidar de novo", () => setDoc(convite(ana.bd, "c2"), {
  deUid: ana.uid, deNome: "Ana", paraUid: beto.uid, paraNome: "Beto", musica: "Iris", status: "pendente",
}));
await naoDeve("o Beto", "recusar com texto livre", () => updateDoc(convite(beto.bd, "c2"), { status: "recusado", resposta: "texto qualquer" }));
await naoDeve("o Beto", "recusar com resposta que não existe", () => updateDoc(convite(beto.bd, "c2"), { status: "recusado", resposta: 7 }));
await deve("o Beto", "recusar com uma das cinco respostas", () => updateDoc(convite(beto.bd, "c2"), { status: "recusado", resposta: 2 }));
await deve("a Ana", "marcar a resposta como vista", () => updateDoc(convite(ana.bd, "c2"), { respostaVista: true }));

console.log("\n── Quem desligou as conversas não recebe ──");
await deve("a Ana", "convidar mais uma vez", () => setDoc(convite(ana.bd, "c3"), {
  deUid: ana.uid, deNome: "Ana", paraUid: beto.uid, paraNome: "Beto", musica: "Creep", status: "pendente",
}));
await deve("a Ana", "desligar as conversas", () => updateDoc(doc(ana.bd, "cantores", ana.uid), { aceitaChat: false }));
await deve("o Beto", "aceitar o convite", () => updateDoc(convite(beto.bd, "c3"), { status: "aceito" }));
await naoDeve("o Beto", "abrir conversa com quem desligou", () => setDoc(conversa(beto.bd, "c3"), novaConversa));

console.log("\n── Pedir para cantar junto e quem não aceita convites ──");
await deve("o Beto", "pedir para cantar na música da Ana", () => setDoc(convite(beto.bd, "m1_pede_beto"), {
  tipo: "pedido", deUid: beto.uid, deNome: "Beto", paraUid: ana.uid, paraNome: "Ana", filaItemId: "m1", musica: "Zombie", status: "pendente",
}));
await deve("a Ana", "aceitar o pedido do Beto", () => updateDoc(convite(ana.bd, "m1_pede_beto"), { status: "aceito" }));
await naoDeve("o estranho", "aceitar pedido feito para a Ana", () => updateDoc(convite(estranho.bd, "m1_pede_beto"), { status: "recusado", resposta: 0 }));
await deve("o Beto", "desligar convites para cantar", () => updateDoc(doc(beto.bd, "cantores", beto.uid), { aceitaDueto: false }));
await naoDeve("a Ana", "convidar quem desligou convites", () => setDoc(convite(ana.bd, "c9"), {
  deUid: ana.uid, deNome: "Ana", paraUid: beto.uid, paraNome: "Beto", musica: "Creep", status: "pendente",
}));
await naoDeve("a Ana", "pedir para cantar na música de quem desligou", () => setDoc(convite(ana.bd, "m2_pede_ana"), {
  tipo: "pedido", deUid: ana.uid, deNome: "Ana", paraUid: beto.uid, paraNome: "Beto", filaItemId: "m2", musica: "Creep", status: "pendente",
}));
await deve("o Beto", "religar convites para cantar", () => updateDoc(doc(beto.bd, "cantores", beto.uid), { aceitaDueto: true }));

// Foto da galeria: JPEG pequeno no proprio perfil, com teto.
const fotoPequena = "data:image/jpeg;base64," + "A".repeat(20000);
const fotoEnorme  = "data:image/jpeg;base64," + "A".repeat(150000);
await deve("a Ana", "pôr uma foto da galeria no perfil", () => updateDoc(doc(ana.bd, "cantores", ana.uid), { photoURL: fotoPequena }));
await naoDeve("a Ana", "pôr uma foto enorme no perfil", () => updateDoc(doc(ana.bd, "cantores", ana.uid), { photoURL: fotoEnorme }));
await naoDeve("o Beto", "trocar a foto do perfil da Ana", () => updateDoc(doc(beto.bd, "cantores", ana.uid), { photoURL: fotoPequena }));
await deve("a Ana", "remover a foto", () => updateDoc(doc(ana.bd, "cantores", ana.uid), { photoURL: null }));
await deve("a Ana", "convidar o Beto de novo", () => setDoc(convite(ana.bd, "c9"), {
  deUid: ana.uid, deNome: "Ana", paraUid: beto.uid, paraNome: "Beto", musica: "Creep", status: "pendente",
}));

await deve("a Gerência dona", "apagar a conversa na faxina, sem ler", () => deleteDoc(conversa(dono.bd, "c1")));
await deleteDoc(doc(ana.bd, "cantores", ana.uid)).catch(() => {});
await deleteDoc(doc(beto.bd, "cantores", beto.uid)).catch(() => {});

console.log("\n── Entrada paga por Pix ──");
const caio = await entrar("caio");
const pagamento = (bd, uid) => doc(bd, "sessoes", SID, "pagamentos", uid);
const pedidoDe = (quem, id) => setDoc(item(quem.bd, id), {
  cantorUid: quem.uid, nomeArtistico: quem.nome, musica: "Chop Suey!", artista: "System of a Down",
  status: "aguardando", slot: "ativa", ordemFila: 9,
});
const aviso = (quem, extra = {}) => ({
  status: "aguardando", nomeArtistico: quem.nome, nomePagador: "Caio da Silva", valor: 15, avisadoEm: serverTimestamp(), ...extra,
});

await deve("a dona", "ligar a entrada de R$ 15", () =>
  updateDoc(sessao(dono.bd), { cobranca: { ativa: true, valor: 15, brcode: "000201...", qr: "", recebedor: "DIEGO" } }));
await naoDeve("o Caio", "pedir música sem pagar", () => pedidoDe(caio, "caio_1"));
await deve("o Caio", "ver o preço e o QR (documento da sessão)", () => getDoc(sessao(caio.bd)));
await deve("o Caio", "marcar presença na porta, sem pagar", () =>
  setDoc(doc(caio.bd, "sessoes", SID, "presencas", caio.uid), { nomeArtistico: "Caio", status: "aqui" }));
console.log("\n── QR do ingresso só para quem está na porta ──");
const qrDaNoite = (bd) => doc(bd, "sessoes", SID, "cobranca", "publico");
await deve("a dona", "gravar o QR do ingresso", () =>
  setDoc(qrDaNoite(dono.bd), { brcode: "000201...", qr: "", recebedor: "DIEGO", valor: 15 }));
await deve("a dona", "ler o QR que gravou", () => getDoc(qrDaNoite(dono.bd)));
await deve("o Caio", "marcar presença na porta", () =>
  setDoc(doc(caio.bd, "sessoes", SID, "presencas", caio.uid), { nomeArtistico: "Caio", status: "aqui" }));
await deve("o Caio (marcou presença)", "ler o QR para pagar", () => getDoc(qrDaNoite(caio.bd)));
await naoDeve("o Beto (fora da noite)", "ler o QR", () => getDoc(qrDaNoite(beto.bd)));
await naoDeve("o Caio", "trocar o QR pelo dele", () => setDoc(qrDaNoite(caio.bd), { brcode: "meu-pix" }));

await naoDeve("o Caio", "ver a fila sem pagar", () => getDocs(collection(caio.bd, "sessoes", SID, "fila")));
await naoDeve("o Caio", "ver quem está na sessão sem pagar", () => getDocs(collection(caio.bd, "sessoes", SID, "presencas")));
await naoDeve("o Caio", "ver os convites sem pagar", () => getDocs(collection(caio.bd, "sessoes", SID, "convites")));
await naoDeve("o Caio", "ver o histórico da noite sem pagar", () => getDocs(collection(caio.bd, "sessoes", SID, "historico")));
await naoDeve("o Caio", "pedir busca no YouTube sem pagar", () =>
  setDoc(doc(caio.bd, "sessoes", SID, "buscas", "b_caio"), { termo: "x", status: "pendente" }));
await deve("a dona", "ver a fila com o ingresso ligado", () => getDocs(collection(dono.bd, "sessoes", SID, "fila")));
await naoDeve("o Caio", "se marcar como pago", () => setDoc(pagamento(caio.bd, caio.uid), { ...aviso(caio), status: "pago" }));
await naoDeve("o Caio", "avisar que pagou um valor menor", () => setDoc(pagamento(caio.bd, caio.uid), aviso(caio, { valor: 1 })));
await naoDeve("o Caio", "avisar pagamento em nome de outro", () => setDoc(pagamento(caio.bd, estranho.uid), aviso(caio)));
await naoDeve("o Caio", "avisar com campo a mais", () => setDoc(pagamento(caio.bd, caio.uid), aviso(caio, { cortesia: true })));
await deve("o Caio", "avisar que pagou", () => setDoc(pagamento(caio.bd, caio.uid), aviso(caio)));
await naoDeve("o Caio", "pedir música antes de o KJ conferir", () => pedidoDe(caio, "caio_2"));
await naoDeve("o Caio", "trocar o aviso para pago", () => updateDoc(pagamento(caio.bd, caio.uid), { status: "pago" }));
await naoDeve("o estranho", "ver o pagamento do Caio", () => getDoc(pagamento(estranho.bd, caio.uid)));
await deve("a dona", "ver os avisos de pagamento", () => getDocs(collection(dono.bd, "sessoes", SID, "pagamentos")));
await deve("a dona", "dizer que o Pix não caiu", () => updateDoc(pagamento(dono.bd, caio.uid), { status: "nao-caiu" }));
await deve("o Caio", "avisar de novo depois do não caiu", () => setDoc(pagamento(caio.bd, caio.uid), aviso(caio)));
await deve("a dona", "confirmar que caiu", () => updateDoc(pagamento(dono.bd, caio.uid), { status: "pago", confirmadoEm: serverTimestamp() }));
await deve("o Caio", "ver que está pago", () => getDoc(pagamento(caio.bd, caio.uid)));
await naoDeve("o Caio", "sobrescrever o pagamento confirmado", () => setDoc(pagamento(caio.bd, caio.uid), aviso(caio)));
await deve("o Caio", "pedir música depois de pago", () => pedidoDe(caio, "caio_3"));
await deve("o Caio", "ver a fila depois de pago", () => getDocs(collection(caio.bd, "sessoes", SID, "fila")));
await deve("o Caio", "ver quem está na sessão depois de pago", () => getDocs(collection(caio.bd, "sessoes", SID, "presencas")));
await naoDeve("o estranho", "pedir música sem pagar, com o Caio pago", () => pedidoDe(estranho, "estranho_1"));
await deve("a dona", "liberar o estranho de cortesia", () =>
  setDoc(pagamento(dono.bd, estranho.uid), { status: "pago", cortesia: true, valor: 0, nomeArtistico: "Estranho" }));
await deve("o estranho", "pedir música com cortesia", () => pedidoDe(estranho, "estranho_2"));
// Dueto sem ingresso: aceitar o convite e cantar de graca era a brecha.
await deve("a dona", "pôr um pedido do Caio com a Ana como parceira", () => setDoc(item(dono.bd, "caio_duo"), {
  cantorUid: caio.uid, nomeArtistico: "Caio", musica: "Zombie", artista: "The Cranberries",
  status: "aguardando", slot: "ativa", duoUid: ana.uid, duoNome: "Ana", duoPendente: true,
}));
await naoDeve("a Ana (sem ingresso)", "aceitar o convite de dueto", () =>
  updateDoc(item(ana.bd, "caio_duo"), { duoPendente: false, duoNomeConfirmado: "Ana" }));
await deve("a dona", "confirmar o ingresso da Ana", () =>
  setDoc(pagamento(dono.bd, ana.uid), { status: "pago", nomeArtistico: "Ana", valor: 15 }));
await deve("a Ana (com ingresso)", "aceitar o convite de dueto", () =>
  updateDoc(item(ana.bd, "caio_duo"), { duoPendente: false, duoNomeConfirmado: "Ana" }));

await deve("a dona", "desligar a entrada", () => updateDoc(sessao(dono.bd), { "cobranca.ativa": false }));
await deve("a Ana", "pedir música com a entrada desligada", () => pedidoDe(ana, "ana_1"));
await deve("a Ana", "ver a fila com o ingresso desligado, sem pagamento nenhum", () => getDocs(collection(ana.bd, "sessoes", SID, "fila")));
await deve("a Ana", "ver quem está na sessão com o ingresso desligado", () => getDocs(collection(ana.bd, "sessoes", SID, "presencas")));
await naoDeve("o Caio", "religar ou mudar a cobrança da sessão", () =>
  updateDoc(sessao(caio.bd), { cobranca: { ativa: false, valor: 0 } }));

console.log("\n── Limpeza ──");
for (const sub of ["fila", "presencas", "historico", "buscas", "convites", "meta", "pagamentos"]) {
  const snap = await getDocs(collection(dono.bd, "sessoes", SID, sub));
  for (const d of snap.docs) await deleteDoc(d.ref).catch(() => {});
}
await deleteDoc(sessao(dono.bd)).catch(e => console.log("  (sessão)", e.code));
await deleteDoc(doc(dono.bd, "historico", estranho.uid, "apresentacoes", SID + "_1")).catch(() => {});
console.log("  sessão de teste apagada (o relatório precisa ser apagado pelo console do Firebase)");

console.log(`\n${certos} certos, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
