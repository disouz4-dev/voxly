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
  getFirestore, doc, collection, setDoc, updateDoc, deleteDoc, getDoc, getDocs, serverTimestamp, Timestamp,
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

console.log("\n── Limpeza ──");
for (const sub of ["fila", "presencas", "historico", "buscas", "convites", "meta"]) {
  const snap = await getDocs(collection(dono.bd, "sessoes", SID, sub));
  for (const d of snap.docs) await deleteDoc(d.ref).catch(() => {});
}
await deleteDoc(sessao(dono.bd)).catch(e => console.log("  (sessão)", e.code));
await deleteDoc(doc(dono.bd, "historico", estranho.uid, "apresentacoes", SID + "_1")).catch(() => {});
console.log("  sessão de teste apagada (o relatório precisa ser apagado pelo console do Firebase)");

console.log(`\n${certos} certos, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
