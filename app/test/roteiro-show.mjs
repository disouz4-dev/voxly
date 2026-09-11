// Roteiro de show automatizado: uma noite de ~30 min de clássicos dos anos
// 2000, com cantores fictícios, rodando no Voxly de verdade.
//
// O roteiro faz o papel do KJ (Play, arrastar, trocar música, pular) e dos
// cantores (pedir, confirmar, recusar, chegar atrasado, dueto). O humano só
// escolhe as versões do YouTube. A cada 3 s ele confere as regras da casa e
// grava toda violação — no terminal, em roteiro-show.log e no diário do Voxly.
//
// Uso: abra o app com   npx electron . --remote-debugging-port=9222
//      e rode           node test/roteiro-show.mjs [pasta-do-relatorio]
// Precisa de: nenhuma sessão aberta (ele cria "Teste de show — anos 2000").

import fs from "node:fs";
import path from "node:path";
import { avaliar } from "./cdp.mjs";

const PASTA = process.argv[2] || process.cwd();
const LOG = path.join(PASTA, "roteiro-show.log");
const inicioRoteiro = Date.now();
const violacoes = [];
const eventos = [];

const esperar = ms => new Promise(r => setTimeout(r, ms));
const relogio = () => {
  const s = Math.round((Date.now() - inicioRoteiro) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
function escrever(tipo, texto) {
  const linha = `[${relogio()}] ${tipo.padEnd(9)} ${texto}`;
  console.log(linha);
  fs.appendFileSync(LOG, linha + "\n");
}
const g = expr => avaliar("gerencia", expr);
async function noDiario(evento, dados, nivel = "info") {
  await g(`diario(${JSON.stringify("roteiro." + evento)}, ${JSON.stringify(dados)}, ${JSON.stringify(nivel)})`).catch(() => {});
}
async function acao(texto, dados = {}) {
  eventos.push({ t: relogio(), texto });
  escrever("AÇÃO", texto);
  await noDiario("acao", { texto, ...dados });
}
async function violacao(regra, detalhe) {
  const chave = regra + "|" + JSON.stringify(detalhe);
  if (violacoes.some(v => v.chave === chave)) return;
  violacoes.push({ chave, t: relogio(), regra, detalhe });
  escrever("VIOLAÇÃO", `${regra} — ${JSON.stringify(detalhe)}`);
  await noDiario("violacao", { regra, detalhe }, "erro");
}

// ── Elenco e repertório ─────────────────────────────────────
const LIMITE_CAFE = 12;   // minutos: com 7 pedidos na fila (~28 min) os atrasados viram café com leite
const ELENCO = [
  { uid: "rot_rafa", nome: "Rafa Grave",   musica: "Chop Suey!",                      artista: "System of a Down" },
  { uid: "rot_bia",  nome: "Bia Riff",     musica: "In the End",                      artista: "Linkin Park" },
  { uid: "rot_duda", nome: "Duda Punk",    musica: "All the Small Things",            artista: "Blink-182", recusaUmaVez: true },
  { uid: "rot_leo",  nome: "Léo Emo",      musica: "I Hate Everything About You",     artista: "Three Days Grace" },
  { uid: "rot_mari", nome: "Mari Scream",  musica: "The Kill (Bury Me)",              artista: "Thirty Seconds to Mars" },
  { uid: "rot_tuca", nome: "Tuca Power",   musica: "I Miss You",                      artista: "Blink-182" },
  { uid: "rot_nina", nome: "Nina Drop",    musica: "Helena",                          artista: "My Chemical Romance", naoResponde: true },
];
const ATRASADOS = [
  { uid: "rot_juca", nome: "Juca Metal",     musica: "Bring Me to Life", artista: "Evanescence", duoCom: "rot_mari" },
  { uid: "rot_ze",   nome: "Zé Distorção",   musica: "Mr. Brightside",   artista: "The Killers" },
];
const TROCA = { de: "rot_tuca", musica: "Lonely Day", artista: "System of a Down" };

// ── Montagem ─────────────────────────────────────────────────
async function prepararSessao() {
  const ja = await g("SESSAO_ID");
  if (ja) throw new Error(`já existe uma sessão aberta (${ja}); derrube antes de rodar o roteiro`);
  // alert() trava a Gerência inteira até alguém clicar — e trava o roteiro
  // junto. Durante o teste ele vira registro no diário.
  await g(`window.alert = m => { diario('tela.alert', { msg: String(m) }, 'aviso'); console.warn('[ALERT]', m); }; 'ok'`);
  // O roteiro confere a ordem no Publico: a tela precisa estar aberta.
  await g(`(async () => { if (!(await window.electronAPI.getAudienceState())) await window.electronAPI.toggleAudience(); })()`);
  await esperar(4000);
  await acao("abrindo a sessão de teste");
  await g(`(async () => {
    const agora = Date.now();
    await iniciarSessao({ nomeCasa: 'Teste de show — anos 2000', inicio: agora - 5 * 60e3, termino: agora + 3 * 3600e3 });
    document.getElementById('prioridade-ativa').checked = true;
    document.getElementById('prioridade-minutos').value = ${LIMITE_CAFE};
    document.getElementById('permitir-duo').checked = true;
    document.getElementById('duo-ilimitado').checked = true;
    await salvarRegras();
    return SESSAO_ID;
  })()`);
  await acao(`regras: café com leite acima de ${LIMITE_CAFE} min, duo liberado`);
}

// Pedido do jeito que o app do cantor faz (profile.html enviarPedido): mesma
// regra de prioridade, mesma ordem, mesmos campos.
async function cantorPede(c) {
  await g(`(async () => {
    const ref = db.collection('sessoes').doc(SESSAO_ID);
    await ref.collection('presencas').doc(${JSON.stringify(c.uid)}).set({
      uid: ${JSON.stringify(c.uid)}, nomeArtistico: ${JSON.stringify(c.nome)}, status: 'aqui',
      primeiraMusicaCantada: false, entrouEm: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const fila = (await ref.collection('fila').where('status', '==', 'aguardando').get()).docs.map(d => d.data());
    const pres = (await ref.collection('presencas').doc(${JSON.stringify(c.uid)}).get()).data() || {};
    const tipo = VoxlyPrioridade.ehPrioridade({ regras, jaCantou: !!pres.primeiraMusicaCantada, fila,
      slot: 'ativa', cantorUid: ${JSON.stringify(c.uid)} }) ? 'prioridade' : 'normal';
    const duo = ${JSON.stringify(c.duoCom || null)};
    const duoPres = duo ? ((await ref.collection('presencas').doc(duo).get()).data() || null) : null;
    await ref.collection('fila').doc('pedido_' + ${JSON.stringify(c.uid)}).set({
      cantorUid: ${JSON.stringify(c.uid)}, nomeArtistico: ${JSON.stringify(c.nome)}, photoURL: null,
      musica: ${JSON.stringify(c.musica)}, artista: ${JSON.stringify(c.artista)},
      catalogoId: null, disponivel: false, videoId: null, videoUrl: null,
      duoUid: duo, duoNome: duoPres ? duoPres.nomeArtistico : null, duoPhotoURL: null, duoPendente: !!duo,
      slot: 'ativa', status: 'aguardando', tipo, semitons: 0,
      ordemFila: VoxlyOrdem.ordemParaNovo(fila, { prioridade: tipo === 'prioridade' }),
      createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    if (duo) await ref.collection('convites').doc('convite_' + ${JSON.stringify(c.uid)}).set({
      deUid: ${JSON.stringify(c.uid)}, deNome: ${JSON.stringify(c.nome)}, paraUid: duo,
      paraNome: duoPres ? duoPres.nomeArtistico : null, filaItemId: 'pedido_' + ${JSON.stringify(c.uid)},
      musica: ${JSON.stringify(c.musica)}, artista: ${JSON.stringify(c.artista)}, status: 'pendente',
      criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
    return tipo;
  })()`).then(tipo => acao(`${c.nome} pediu "${c.musica}" (${c.artista}) → ${tipo}`, { uid: c.uid, tipo }));
}

// ── Estado ───────────────────────────────────────────────────
async function lerEstado() {
  return g(`(async () => {
    if (!SESSAO_ID) return null;
    const f = await db.collection('sessoes').doc(SESSAO_ID).collection('fila').get();
    const banco = f.docs.map(d => ({ id: d.id, ...d.data() })).map(d => ({
      id: d.id, nome: d.nomeArtistico, uid: d.cantorUid, musica: d.musica, status: d.status, slot: d.slot,
      tipo: d.tipo, ordemFila: d.ordemFila, disponivel: !!d.disponivel, statusDownload: d.statusDownload || null,
      duoUid: d.duoUid || null, duoPendente: !!d.duoPendente, confirmandoAte: d.confirmandoAte || null,
      recusas: d.confirmacoesRecusadas || 0 }));
    return {
      sessao: SESSAO_ID,
      tocando: currentSong ? currentSong.id : null,
      banco,
      tela: filaData.map(d => d.id),
      // Como o Publico escreve: com o parceiro do dueto.
      telaNomes: filaData.filter(d => d.status !== 'tocando' && d.slot !== 'espera').slice(0, 6).map(d => d.nomeArtistico + (d.duoNome ? ' & ' + d.duoNome : '')),
      ordemRegra: VoxlyOrdem.ordenarFila(banco.filter(d => ['aguardando','tocando','confirmando','pronto'].includes(d.status) && d.slot !== 'espera')).map(d => d.id),
    };
  })()`);
}
const nomesPublico = () => avaliar("publico",
  `[...document.querySelectorAll('#pub-proximos-lista .pub-proximo-cantor')].map(e => e.textContent)`).catch(() => null);
const estadoPalco = () => avaliar("palco",
  `({ src: decodeURI(String(document.getElementById('video-player').currentSrc || '')).split('/').pop(),
      pausado: document.getElementById('video-player').paused,
      tempo: Math.round(document.getElementById('video-player').currentTime) })`).catch(() => null);

// ── Regras da casa conferidas a cada volta ──────────────────
const vistos = new Map();          // id -> ultimo status visto
const saidasEsperadas = new Set(); // pedidos que o roteiro mandou sair (pular, trocar)
let ordemManual = false;           // depois do arrastar, a ordem do KJ vale mais que a alternância

async function conferir(e) {
  const porId = new Map(e.banco.map(d => [d.id, d]));
  // 1. Nenhum pedido some da fila sem motivo.
  for (const [id, status] of vistos) {
    if (!porId.has(id) && !saidasEsperadas.has(id)) await violacao("pedido sumiu do banco", { id, ultimoStatus: status });
  }
  for (const d of e.banco) vistos.set(d.id, d.status);
  // 2. No máximo uma música tocando.
  const tocando = e.banco.filter(d => d.status === "tocando");
  if (tocando.length > 1) await violacao("duas músicas tocando", tocando.map(d => d.id));
  // 3. A Gerência mostra a mesma ordem da regra.
  if (JSON.stringify(e.tela) !== JSON.stringify(e.ordemRegra)) {
    await violacao("ordem da tela diferente da regra", { tela: e.tela, regra: e.ordemRegra });
  }
  // 4. O Público mostra os mesmos próximos da Gerência.
  const pub = await nomesPublico();
  if (pub && pub.length && JSON.stringify(pub) !== JSON.stringify(e.telaNomes)) {
    await violacao("público fora de ordem", { publico: pub, gerencia: e.telaNomes });
  }
  // 5. Café com leite: uma música por cantor, e intercalado (sem dois seguidos
  //    enquanto houver fila normal depois).
  const cafes = e.banco.filter(d => d.tipo === "prioridade" && ["aguardando", "confirmando", "pronto", "tocando"].includes(d.status));
  const porCantor = {};
  for (const c of cafes) porCantor[c.uid] = (porCantor[c.uid] || 0) + 1;
  for (const [uid, n] of Object.entries(porCantor)) if (n > 1) await violacao("dois cafés com leite do mesmo cantor", { uid, n });
  if (!ordemManual) {
    const esperando = e.ordemRegra.map(id => porId.get(id)).filter(d => d && d.status === "aguardando");
    for (let i = 1; i < esperando.length; i++) {
      const restoNormal = esperando.slice(i + 1).some(d => d.tipo !== "prioridade");
      if (esperando[i].tipo === "prioridade" && esperando[i - 1].tipo === "prioridade" && restoNormal) {
        await violacao("dois cafés com leite seguidos com fila normal esperando", esperando.slice(i - 1, i + 1).map(d => d.nome));
      }
    }
  }
  // 6. Quem já cantou não pode estar marcado como café com leite.
  const cantaram = new Set(e.banco.filter(d => d.status === "cantada").map(d => d.uid));
  for (const c of cafes) if (cantaram.has(c.uid) && c.status === "aguardando") await violacao("café com leite para quem já cantou", { nome: c.nome });
}

// ── O papel do KJ e dos cantores ────────────────────────────
const confirmacaoMarcada = new Map();
const jaRecusou = new Set();
let esperandoPlayDesde = 0;
let tocadas = 0;
let pulouUma = false;

async function cantoresRespondem(e) {
  for (const d of e.banco.filter(x => x.status === "confirmando")) {
    const c = [...ELENCO, ...ATRASADOS].find(x => x.uid === d.uid) || {};
    if (!confirmacaoMarcada.has(d.id)) confirmacaoMarcada.set(d.id, Date.now() + 6000 + Math.random() * 5000);
    if (Date.now() < confirmacaoMarcada.get(d.id)) continue;
    if (c.naoResponde) continue;   // deixa o auto-confirmar de 30 s agir
    confirmacaoMarcada.delete(d.id);
    if (c.recusaUmaVez && !jaRecusou.has(d.id)) {
      jaRecusou.add(d.id);
      // Mesma escrita do "Voltar para a fila" do app do cantor (1ª recusa).
      await g(`(async () => {
        const ref = db.collection('sessoes').doc(SESSAO_ID);
        const fila = (await ref.collection('fila').where('status', '==', 'aguardando').get()).docs.map(x => x.data());
        await ref.collection('fila').doc(${JSON.stringify(d.id)}).update({ status: 'aguardando',
          ordemFila: VoxlyOrdem.ordemParaNovo(fila, { prioridade: false }), tipo: 'normal', confirmacoesRecusadas: 1 });
      })()`);
      await acao(`${d.nome} recusou a chamada e voltou para o fim da fila`);
      continue;
    }
    await g(`db.collection('sessoes').doc(SESSAO_ID).collection('fila').doc(${JSON.stringify(d.id)}).update({ status: 'confirmado' })`);
    await acao(`${d.nome} confirmou pelo celular`);
  }
}

async function kjDaPlay(e) {
  if (e.tocando) { esperandoPlayDesde = 0; return; }
  // Com alguém sendo chamado, o KJ espera a confirmação (ou o auto-confirmar).
  if (e.banco.some(d => d.status === "confirmando")) return;
  const ordem = e.ordemRegra.map(id => e.banco.find(d => d.id === id)).filter(Boolean);
  const pronto = ordem.find(d => d.status === "pronto");
  const alvo = (pronto && pronto.disponivel) ? pronto : ordem.find(d => ["pronto", "aguardando"].includes(d.status) && d.disponivel);
  if (!alvo) {
    if (!esperandoPlayDesde) esperandoPlayDesde = Date.now();
    return;
  }
  if (!esperandoPlayDesde) esperandoPlayDesde = Date.now();
  if (Date.now() - esperandoPlayDesde < 5000) return;   // o KJ respira antes de soltar a próxima
  esperandoPlayDesde = 0;
  if (pronto && pronto.id !== alvo.id) await acao(`${pronto.nome} foi chamado mas a música ainda não tem arquivo — KJ passa ${alvo.nome} na frente`);
  await g(`tocarMusica(${JSON.stringify(alvo.id)})`);
  tocadas++;
  await acao(`▶ Play: ${alvo.nome} — "${alvo.musica}"`, { id: alvo.id });
}

// Momentos da noite, contados a partir do primeiro Play.
const ROTEIRO = [
  { aos: 4 * 60, feito: false, faz: async () => { for (const c of ATRASADOS) { await cantorPede(c); await esperar(1500); } } },
  { aos: 5 * 60, feito: false, faz: async (e) => {
      const convite = await g(`db.collection('sessoes').doc(SESSAO_ID).collection('convites').doc('convite_rot_juca').get().then(d => d.exists && d.data().status)`);
      if (convite === "pendente") {
        await g(`(async () => {
          const ref = db.collection('sessoes').doc(SESSAO_ID);
          await ref.collection('convites').doc('convite_rot_juca').update({ status: 'aceito' });
          await ref.collection('fila').doc('pedido_rot_juca').update({ duoPendente: false, duoNomeConfirmado: 'Mari Scream', duoPhotoURL: null });
        })()`);
        await acao("Mari Scream aceitou o dueto com Juca Metal");
      }
  } },
  { aos: 7 * 60, feito: false, faz: async (e) => {
      // KJ arrasta: a Nina, que está mais para o fim, sobe para a 2ª posição dos que esperam.
      const ids = await g(`(() => { const esp = filaData.filter(d => d.status === 'aguardando');
        const nina = esp.find(d => d.cantorUid === 'rot_nina'); return nina && esp.length > 2 ? [nina.id, esp[1].id] : null; })()`);
      if (!ids) return;
      ordemManual = true;
      await g(`(async () => { arrastando = ${JSON.stringify(ids[0])}; await onDrop({ preventDefault() {}, currentTarget: { classList: { remove() {} } } }, ${JSON.stringify(ids[1])}); })()`);
      await acao("KJ arrastou Nina Drop para a 2ª posição da fila");
  } },
  { aos: 9 * 60, feito: false, faz: async (e) => {
      const alvo = e.banco.find(d => d.uid === TROCA.de && d.status === "aguardando");
      if (!alvo) return;
      await g(`(async () => {
        trocarMusicaFila(${JSON.stringify(alvo.id)});
        musicaModalSelecionada = { musica: ${JSON.stringify(TROCA.musica)}, artista: ${JSON.stringify(TROCA.artista)}, disponivel: true };
        await adicionarMusicaManual();
      })()`);
      await acao(`KJ trocou a música de Tuca Power para "${TROCA.musica}"`);
  } },
];
let inicioShow = 0;

async function momentosDoRoteiro(e) {
  if (!inicioShow) return;
  const decorrido = (Date.now() - inicioShow) / 1000;
  for (const m of ROTEIRO) if (!m.feito && decorrido >= m.aos) { m.feito = true; await m.faz(e).catch(err => escrever("ERRO", err.message)); }
  // Pular: a 5ª música é pulada depois de 45 s.
  if (!pulouUma && tocadas === 5 && e.tocando) {
    const p = await estadoPalco();
    if (p && p.tempo >= 45) {
      pulouUma = true;
      saidasEsperadas.add(e.tocando);
      await g(`pularMusica(${JSON.stringify(e.tocando)})`);
      await acao("KJ pulou a música que estava tocando (5ª da noite)");
    }
  }
}

// ── Relatório final ─────────────────────────────────────────
async function relatorio(e) {
  const cantadas = e ? e.banco.filter(d => d.status === "cantada").map(d => `${d.nome} — ${d.musica}`) : [];
  const diario = await g(`window.electronAPI.lerDiario(5000)`).catch(() => []);
  const linhas = diario.map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean)
    .filter(l => l.t >= inicioRoteiro);
  const porEvento = {};
  for (const l of linhas) porEvento[l.evento] = (porEvento[l.evento] || 0) + 1;
  const erros = linhas.filter(l => l.nivel === "erro").map(l => `${l.hora} ${l.origem} ${l.evento} ${JSON.stringify(l.dados).slice(0, 200)}`);
  const texto = [
    "# Relatório do roteiro de show", "",
    `Duração: ${relogio()} · músicas cantadas: ${cantadas.length} · violações: ${violacoes.length}`, "",
    "## Cantadas", ...cantadas.map(c => "- " + c), "",
    "## Violações das regras da casa", ...(violacoes.length ? violacoes.map(v => `- [${v.t}] ${v.regra}: ${JSON.stringify(v.detalhe)}`) : ["- nenhuma"]), "",
    "## Erros no diário", ...(erros.length ? erros.map(x => "- " + x) : ["- nenhum"]), "",
    "## Eventos do diário durante o roteiro", ...Object.entries(porEvento).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`), "",
    "## Linha do tempo", ...eventos.map(x => `- [${x.t}] ${x.texto}`),
  ].join("\n");
  const arq = path.join(PASTA, "roteiro-show-relatorio.md");
  fs.writeFileSync(arq, texto);
  escrever("FIM", `relatório em ${arq}`);
}

// ── Principal ────────────────────────────────────────────────
fs.writeFileSync(LOG, "");
escrever("INÍCIO", "roteiro de show — anos 2000");
await prepararSessao();
for (const c of ELENCO) { await cantorPede(c); await esperar(2500); }
escrever("AGUARDO", "escolha as versões das músicas que precisam de download (botão de versões em cada pedido)");

let ultimo = null;
let ociosoDesde = 0;
while (true) {
  let e;
  try { e = await lerEstado(); } catch (err) { escrever("ERRO", "leitura: " + err.message); await esperar(3000); continue; }
  if (!e) { escrever("ERRO", "a sessão sumiu"); await violacao("sessão de teste sumiu", {}); break; }
  if (!inicioShow && e.tocando) { inicioShow = Date.now(); await acao("primeira música no ar — o relógio do roteiro começa"); }
  try {
    await conferir(e);
    await cantoresRespondem(e);
    await kjDaPlay(e);
    await momentosDoRoteiro(e);
  } catch (err) { escrever("ERRO", err.message); }

  const resumo = e.banco.map(d => `${d.nome.split(" ")[0]}:${d.status}${d.tipo === "prioridade" ? "☕" : ""}${d.disponivel ? "" : "⬇"}`).join(" ");
  if (resumo !== ultimo) { escrever("FILA", resumo); ultimo = resumo; }

  const pendentes = e.banco.filter(d => ["aguardando", "confirmando", "confirmado", "pronto", "tocando"].includes(d.status));
  const atrasadosJaPediram = ROTEIRO[0].feito;
  if (inicioShow && atrasadosJaPediram && !pendentes.length) {
    if (!ociosoDesde) ociosoDesde = Date.now();
    if (Date.now() - ociosoDesde > 15000) { await relatorio(e); break; }
  } else ociosoDesde = 0;
  await esperar(3000);
}
