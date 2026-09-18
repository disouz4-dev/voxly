// Roteiro de show automatizado: uma noite de ~30 min de clássicos dos anos
// 2000, com cantores fictícios, rodando no Voxly de verdade.
//
// O roteiro faz o papel do KJ (Play, arrastar, trocar música, pular, conferir
// os Pix do ingresso) e dos cantores (pedir, confirmar, recusar, chegar
// atrasado, dueto, pedir para cantar junto). Só usa músicas que já estão no
// acervo, então roda sozinho, sem download e sem ninguém escolher versão. A
// cada 3 s confere as regras da casa e grava toda violação — no terminal, em
// roteiro-show.log e no diário do Voxly.
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
// Ingresso da noite: o KJ cobra R$ 10 por Pix. A chave é de teste; o dinheiro
// do roteiro não existe, o que se testa é o painel, as marcas e os totais.
const INGRESSO = { ativa: true, valor: 10, chave: "teste@voxly.app", nome: "Teste Voxly", cidade: "Sao Paulo" };

// Tudo que o elenco canta já está no acervo (videoId do arquivo em disco): o
// roteiro não depende de download nem de ninguém escolher versão.
const ELENCO = [
  { uid: "rot_rafa", nome: "Rafa Grave",   musica: "Chop Suey!",                  artista: "System of a Down",      videoId: "CC2m-1ksl3M" },
  { uid: "rot_bia",  nome: "Bia Riff",     musica: "In the End",                  artista: "Linkin Park",           videoId: "O7xFdFjW0nQ" },
  { uid: "rot_duda", nome: "Duda Punk",    musica: "All the Small Things",        artista: "Blink-182",             videoId: "CbIRqEVUU2w", recusaUmaVez: true },
  { uid: "rot_leo",  nome: "Léo Emo",      musica: "I Hate Everything About You", artista: "Three Days Grace",      videoId: "iWeAlb2zAyU" },
  { uid: "rot_mari", nome: "Mari Scream",  musica: "The Kill (bury Me)",          artista: "Thirty Seconds To Mars", videoId: "U4RB0Waf5_I" },
  { uid: "rot_tuca", nome: "Tuca Power",   musica: "I Miss You",                  artista: "Blink 182",             videoId: "8sAOYg6yo-A" },
  { uid: "rot_nina", nome: "Nina Drop",    musica: "Helena",                      artista: "My Chemical Romance",   videoId: "wIb3M-vLbPg", naoResponde: true },
];
const ATRASADOS = [
  { uid: "rot_juca", nome: "Juca Metal",   musica: "Bring Me To Life",            artista: "Evanescence",           videoId: "i_nMPqJxjmg", duoCom: "rot_mari" },
  // O Zé chega, avisa que pagou e só entra na fila depois de o KJ conferir o
  // Pix no painel — o caminho de verdade de quem paga no meio da noite.
  { uid: "rot_ze",   nome: "Zé Distorção", musica: "Mr. Brightside",              artista: "The Killers",           videoId: "NvZyU7ij_bs", esperaConferencia: true },
];
// Paga e nunca é conferido: deixa o painel do KJ com pendência até o fim, e
// entra no aviso de "pagaram e não cantaram" ao finalizar.
const SO_AVISOU = { uid: "rot_sam", nome: "Sam Espera" };
const TROCA = { de: "rot_tuca", musica: "Lonely Day", artista: "System of a Down", videoId: "60PyGZHTRn0" };
// Quem chega e pede para cantar na música de outro (o caminho novo do app).
const PEDE_JUNTO = { uid: "rot_kell", nome: "Kell Grito", alvo: "rot_leo" };

// Quem pagou o ingresso, e como. O "aguardando" fica de propósito sem
// conferir: é o que o KJ vê como pendente no painel até o fim.
const PAGAMENTOS = {
  rot_rafa: "pago", rot_bia: "pago", rot_duda: "pago", rot_leo: "pago",
  rot_mari: "pago", rot_tuca: "pago", rot_nina: "cortesia",
  rot_juca: "pago", rot_ze: "aguardando", rot_kell: "pago", rot_sam: "aguardando",
};

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
  await acao("abrindo a sessão de teste, com ingresso de R$ 10 por Pix");
  await g(`(async () => {
    const agora = Date.now();
    localStorage.setItem('voxly_cobranca', ${JSON.stringify(JSON.stringify(INGRESSO))});
    await iniciarSessao({ nomeCasa: 'Teste de show — anos 2000', inicio: agora - 5 * 60e3, termino: agora + 3 * 3600e3,
                          ingresso: ${JSON.stringify(INGRESSO)} });
    document.getElementById('prioridade-ativa').checked = true;
    document.getElementById('permitir-duo').checked = true;
    document.getElementById('duo-ilimitado').checked = true;
    await salvarRegras();
    return SESSAO_ID;
  })()`);
  await acao("regras: prioridade ligada (quem não cantou entra intercalado quando a fila já cantou), duo liberado");

  const cobranca = await g(`(async () => {
    const pub = await db.collection('sessoes').doc(SESSAO_ID).collection('cobranca').doc('publico').get();
    return JSON.stringify({ ...(cobrancaSessao || {}), ...(pub.exists ? pub.data() : {}) });
  })()`);
  const c = JSON.parse(cobranca || "null");
  if (!c || c.ativa !== true || c.valor !== INGRESSO.valor || !c.brcode || !c.qr) {
    await violacao("ingresso não entrou na sessão", c);
  } else {
    await acao(`ingresso ligado: ${c.valor} para ${c.recebedor}, com QR de ${Math.round(c.qr.length / 1024)} KB`);
  }
}

// O ingresso de cada um, do jeito que a Gerência grava ao conferir o Pix.
async function pagarIngresso(c) {
  const como = PAGAMENTOS[c.uid];
  if (!como) return;
  await g(`db.collection('sessoes').doc(SESSAO_ID).collection('pagamentos').doc(${JSON.stringify(c.uid)}).set({
    status: ${JSON.stringify(como === "aguardando" ? "aguardando" : "pago")},
    cortesia: ${como === "cortesia"},
    nomeArtistico: ${JSON.stringify(c.nome)},
    nomePagador: ${JSON.stringify(como === "cortesia" ? "" : c.nome + " (conta teste)")},
    valor: ${como === "cortesia" ? 0 : INGRESSO.valor},
    avisadoEm: firebase.firestore.FieldValue.serverTimestamp() })`);
  await acao(`${c.nome}: ingresso ${como}`);
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
    // Como o app do cantor desde 18/09: todo pedido entra normal, e a Gerencia
    // decide na hora quem vira cafe com leite (promocoesDeCafe).
    const tipo = 'normal';
    const duo = ${JSON.stringify(c.duoCom || null)};
    const duoPres = duo ? ((await ref.collection('presencas').doc(duo).get()).data() || null) : null;
    await ref.collection('fila').doc('pedido_' + ${JSON.stringify(c.uid)}).set({
      cantorUid: ${JSON.stringify(c.uid)}, nomeArtistico: ${JSON.stringify(c.nome)}, photoURL: null,
      musica: ${JSON.stringify(c.musica)}, artista: ${JSON.stringify(c.artista)},
      catalogoId: null, disponivel: true,
      videoId: ${JSON.stringify(c.videoId || null)},
      videoUrl: ${JSON.stringify(c.videoId ? "https://www.youtube.com/watch?v=" + c.videoId : null)},
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
      tipo: d.tipo, ordemFila: d.ordemFila, fixado: !!d.fixado, disponivel: !!d.disponivel, statusDownload: d.statusDownload || null,
      duoUid: d.duoUid || null, duoPendente: !!d.duoPendente, confirmandoAte: d.confirmandoAte || null,
      recusas: d.confirmacoesRecusadas || 0 }));
    const pg = await db.collection('sessoes').doc(SESSAO_ID).collection('pagamentos').get();
    const cv = await db.collection('sessoes').doc(SESSAO_ID).collection('convites').get();
    return {
      sessao: SESSAO_ID,
      tocando: currentSong ? currentSong.id : null,
      banco,
      pagamentos: pg.docs.map(d => ({ id: d.id, ...d.data() })).map(p => ({ id: p.id, nome: p.nomeArtistico, status: p.status, cortesia: !!p.cortesia, valor: p.valor || 0 })),
      convites: cv.docs.map(d => ({ id: d.id, ...d.data() })).map(c => ({ id: c.id, tipo: c.tipo || 'convite', status: c.status, filaItemId: c.filaItemId || null })),
      ingresso: VoxlyEntrada.resumoDaEntrada({ cobranca: cobrancaSessao }, pg.docs.map(d => ({ id: d.id, ...d.data() }))),
      botaoPix: (document.getElementById('btnPagamentos') || {}).textContent || null,
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
  // 6b. Ingresso: ninguém entra na fila sem ingresso liberado.
  const liberados = new Set(e.pagamentos.filter(p => p.status === "pago").map(p => p.id));
  for (const d of e.banco) {
    if (!liberados.has(d.uid) && ["aguardando", "confirmando", "confirmado", "pronto", "tocando"].includes(d.status)) {
      await violacao("pedido na fila sem ingresso pago", { nome: d.nome, uid: d.uid });
    }
  }
  // 6c. O painel do KJ conta o dinheiro certo.
  if (e.ingresso) {
    const pagos = e.pagamentos.filter(p => p.status === "pago" && !p.cortesia);
    if (e.ingresso.pagantes !== pagos.length || e.ingresso.total !== pagos.length * INGRESSO.valor) {
      await violacao("conta do ingresso errada", { painel: e.ingresso, pagos: pagos.length });
    }
  }
  // 6d. Pedido para cantar junto aceito não deixa outro pendente na mesma música.
  const pedidosPendentes = e.convites.filter(c => c.tipo === "pedido" && c.status === "pendente");
  for (const p of pedidosPendentes) {
    const item = porId.get(p.filaItemId);
    if (item && item.duoUid && !item.duoPendente) {
      await violacao("pedido para cantar junto continuou pendente numa música que já tem parceiro", p);
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
  { aos: 4 * 60, feito: false, faz: async () => {
      await pagarIngresso(SO_AVISOU);
      for (const c of ATRASADOS) {
        await pagarIngresso(c);
        if (c.esperaConferencia) { await acao(`${c.nome} avisou que pagou e espera a conferência do KJ`); continue; }
        await cantorPede(c);
        await esperar(1500);
      }
  } },
  { aos: 5 * 60 + 20, feito: false, faz: async () => {
      // KJ confere o Pix no painel de verdade (botão "✓ Caiu"), e só então o
      // Zé consegue entrar na fila.
      const ze = ATRASADOS.find(c => c.esperaConferencia);
      const ok = await g(`(async () => {
        if (!document.getElementById('modalPagamentos').classList.contains('open')) abrirModalPagamentos();
        await new Promise(r => setTimeout(r, 300));
        const b = document.querySelector('[data-pag=confirmar][data-uid=${ze.uid}]');
        if (!b) return false;
        b.click();
        await new Promise(r => setTimeout(r, 1500));
        fecharModalPagamentos();
        return (pagamentosData.find(p => p.id === '${ze.uid}') || {}).status === 'pago';
      })()`);
      if (!ok) return violacao("KJ não conseguiu confirmar o Pix pelo painel", { uid: ze.uid });
      await acao(`KJ conferiu o Pix do ${ze.nome} no painel (✓ Caiu)`);
      await cantorPede(ze);
  } },
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
  { aos: 6 * 60, feito: false, faz: async () => {
      // Kell chega e pede para cantar na música do Léo (caminho novo do app).
      await pagarIngresso(PEDE_JUNTO);
      await g(`(async () => {
        const ref = db.collection('sessoes').doc(SESSAO_ID);
        await ref.collection('presencas').doc('rot_kell').set({ uid: 'rot_kell', nomeArtistico: 'Kell Grito',
          status: 'aqui', entrouEm: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        await ref.collection('convites').doc('pedido_rot_leo_pede_rot_kell').set({
          tipo: 'pedido', deUid: 'rot_kell', deNome: 'Kell Grito', paraUid: 'rot_leo', paraNome: 'Léo Emo',
          filaItemId: 'pedido_rot_leo', musica: 'I Hate Everything About You', artista: 'Three Days Grace',
          status: 'pendente', criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
      })()`);
      await acao("Kell Grito pediu para cantar junto na música do Léo Emo");
  } },
  { aos: 7 * 60 + 30, feito: false, faz: async (e) => {
      // Léo aceita: o mesmo que o app do cantor grava em aceitarPedidoParaCantar.
      const alvo = e.banco.find(d => d.id === "pedido_rot_leo");
      if (!alvo || !["aguardando", "pronto"].includes(alvo.status)) return;
      await g(`(async () => {
        const ref = db.collection('sessoes').doc(SESSAO_ID);
        const id = 'pedido_rot_leo_pede_rot_kell';
        const lote = db.batch();
        lote.update(ref.collection('fila').doc('pedido_rot_leo'), { duoUid: 'rot_kell', duoNome: 'Kell Grito',
          duoPhotoURL: null, duoPendente: false, duoNomeConfirmado: 'Kell Grito' });
        lote.update(ref.collection('convites').doc(id), { status: 'aceito' });
        await lote.commit();
      })()`);
      await acao("Léo Emo aceitou: canta em dueto com Kell Grito");
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
  const aviso = await g("avisoDaEntradaAoFinalizar()").catch(() => "");
  const ingresso = e && e.ingresso ? [
    `- valor: ${e.ingresso.valor} · pagantes: ${e.ingresso.pagantes} · cortesias: ${e.ingresso.cortesias}`
      + ` · total: ${e.ingresso.total} · sem conferir: ${e.ingresso.semConferir}`,
    `- botão do KJ: ${e.botaoPix}`,
    ...(aviso ? ["- aviso ao finalizar: " + String(aviso).replace(/\n+/g, " | ").trim()] : []),
  ] : ["- ingresso desligado"];
  const texto = [
    "# Relatório do roteiro de show", "",
    `Duração: ${relogio()} · músicas cantadas: ${cantadas.length} · violações: ${violacoes.length}`, "",
    "## Cantadas", ...cantadas.map(c => "- " + c), "",
    "## Ingresso da noite", ...ingresso, "",
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
for (const c of ELENCO) { await pagarIngresso(c); await cantorPede(c); await esperar(2500); }
escrever("SEM PAUSA", "todas as músicas já estão no acervo: o roteiro toca sozinho, sem escolher versão");

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
