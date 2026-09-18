import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
const app = initializeApp({ apiKey: "AIzaSyB5sPKpmPVWDDhwprU8TB0Bn0N0WSiafoI", authDomain: "voxly-karaoke.firebaseapp.com", projectId: "voxly-karaoke" });
const cred = await signInAnonymously(getAuth(app));
const bd = getFirestore(app);
const sid = "velocidade-" + Date.now().toString(36);
await setDoc(doc(bd, "sessoes", sid), { codigo: "VELOC1", nomeCasa: "Teste de velocidade", status: "ativa", filaAberta: true,
  donoUid: cred.user.uid, hostVivoEm: serverTimestamp(), iniciadaEm: serverTimestamp(),
  horarioInicio: Timestamp.fromMillis(Date.now() - 60e3), horarioTermino: Timestamp.fromMillis(Date.now() + 3600e3),
  regras: { permitirDuo: true, prioridadeAtiva: true, prioridadeMinutos: 40 }, cobranca: { ativa: false } });
console.log(sid);
process.exit(0);
