"use strict";

// O analisador de espectro do selo de qualidade (pedido dele em 06/11/2026).
//
// A pergunta que o selo responde: esta versao de karaoke e o MASTER original
// com a voz tirada, ou alguem regravou em teclado? A diferenca e ouvida na
// hora, e e medivel — nao precisa de modelo nenhum:
//
//   harmonia  a progressao de acordes (croma) da mesma gravacao correlaciona
//             quase 1; regravacao cai muito;
//   grave     abaixo de 250 Hz vivem baixo e bumbo, onde a voz NAO esta: num
//             stem do master isso e quase identico ao original, e e a medida
//             mais robusta justamente porque a voz ausente nao a atrapalha;
//   timbre    guitarra gravada contra patch de teclado (MFCC, sem o
//             coeficiente 0, para volume e equalizacao nao contarem);
//   tempo     stem do master bate o BPM exato; regravacao desliza.
//
// Aqui so moram funcoes puras, sobre amostras que estes testes sintetizam. Quem
// decodifica arquivo e o ffmpeg, do lado do processo principal.

const test = require("node:test");
const assert = require("node:assert");
const {
  janelaHann, fftMagnitude, espectrograma, croma, mfcc,
  fluxoEspectral, bpmDe, correlacaoPearson, cosseno, alinhar,
  mediaDeQuadros, notaDeQualidade, TAMANHO, SALTO,
} = require("../src/espectro");

const TAXA = 22050;

// ── geradores ─────────────────────────────────────────────
function seno(hz, segundos, taxa = TAXA, ganho = 0.5) {
  const n = Math.round(segundos * taxa);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = ganho * Math.sin(2 * Math.PI * hz * i / taxa);
  return x;
}

function soma(...sinais) {
  const n = Math.min(...sinais.map(s => s.length));
  const x = new Float32Array(n);
  for (const s of sinais) for (let i = 0; i < n; i++) x[i] += s[i];
  return x;
}

// Ruido com semente fixa: teste que depende de Math.random falha uma vez por
// semana e ninguem descobre por que.
function ruido(segundos, taxa = TAXA, semente = 7) {
  const n = Math.round(segundos * taxa);
  const x = new Float32Array(n);
  let s = semente;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    x[i] = (s / 0x3fffffff) - 1;
  }
  return x;
}

// Trem de cliques: a batida que o detector de BPM tem de achar.
function cliques(bpm, segundos, taxa = TAXA) {
  const n = Math.round(segundos * taxa);
  const x = new Float32Array(n);
  const passo = Math.round(taxa * 60 / bpm);
  for (let i = 0; i < n; i += passo) {
    for (let k = 0; k < 220 && i + k < n; k++) x[i + k] = (1 - k / 220) * (k % 2 ? -1 : 1);
  }
  return x;
}

// ── janela ────────────────────────────────────────────────
test("a janela de Hann comeca e acaba em zero e vale 1 no meio", () => {
  // Com tamanho IMPAR existe amostra no pico, e ela vale exatamente 1.
  const j = janelaHann(9);
  assert.strictEqual(j.length, 9);
  assert.ok(j[0] < 1e-12, `inicio ${j[0]}`);
  assert.ok(j[8] < 1e-12, `fim ${j[8]}`);
  assert.ok(Math.abs(j[4] - 1) < 1e-12, `meio ${j[4]}`);
});

test("com tamanho par nao ha amostra no pico, e o maior fica perto de 1", () => {
  // O que o sistema usa e 2048 (par): o maximo e 0,9995, nao 1. Fica dito para
  // nao parecer defeito quando alguem olhar.
  const j = janelaHann(8);
  assert.ok(Math.max(...j) > 0.94 && Math.max(...j) < 1, `${Math.max(...j)}`);
  assert.ok(Math.max(...janelaHann(2048)) > 0.999);
});

test("a janela e simetrica", () => {
  const j = janelaHann(64);
  for (let i = 0; i < 32; i++) {
    assert.ok(Math.abs(j[i] - j[63 - i]) < 1e-12, `posicao ${i}`);
  }
});

// ── FFT ───────────────────────────────────────────────────
test("o pico da FFT cai no bin da frequencia do seno", () => {
  // Frequencia escolhida para cair exatamente num bin: sem vazamento.
  const tam = 1024;
  const bin = 64;
  const hz = bin * TAXA / tam;
  const x = seno(hz, tam / TAXA);
  const m = fftMagnitude(x.subarray(0, tam));
  let maior = 0;
  for (let i = 1; i < m.length; i++) if (m[i] > m[maior]) maior = i;
  assert.strictEqual(maior, bin);
});

test("a FFT exige tamanho potencia de dois", () => {
  assert.throws(() => fftMagnitude(new Float32Array(1000)), /potencia de dois/);
});

test("silencio nao estoura e nao inventa pico", () => {
  const m = fftMagnitude(new Float32Array(1024));
  assert.ok(m.every(v => v === 0), "tudo zero");
});

// ── croma ─────────────────────────────────────────────────
test("o croma de um la 440 aponta para a classe de nota la", () => {
  // Do = 0, la = 9.
  const x = seno(440, 0.5);
  const c = croma(espectrograma(x), TAXA);
  const media = mediaDeQuadros(c);
  let maior = 0;
  for (let i = 1; i < 12; i++) if (media[i] > media[maior]) maior = i;
  assert.strictEqual(maior, 9, `croma: ${[...media].map(v => v.toFixed(2)).join(",")}`);
});

test("o croma nao muda com o volume", () => {
  // O selo nao pode premiar quem masterizou mais alto.
  const baixo = seno(440, 0.5, TAXA, 0.05);
  const alto  = seno(440, 0.5, TAXA, 0.9);
  const a = mediaDeQuadros(croma(espectrograma(baixo), TAXA));
  const b = mediaDeQuadros(croma(espectrograma(alto), TAXA));
  assert.ok(cosseno(a, b) > 0.999, `cosseno ${cosseno(a, b)}`);
});

test("o croma separa acordes diferentes", () => {
  const doM  = soma(seno(261.6, 1), seno(329.6, 1), seno(392.0, 1)); // do-mi-sol
  const faM  = soma(seno(349.2, 1), seno(440.0, 1), seno(523.3, 1)); // fa-la-do
  const a = mediaDeQuadros(croma(espectrograma(doM), TAXA));
  const b = mediaDeQuadros(croma(espectrograma(faM), TAXA));
  assert.ok(cosseno(a, b) < 0.8, `acordes diferentes deram cosseno ${cosseno(a, b)}`);
});

// ── MFCC ──────────────────────────────────────────────────
test("o MFCC de sinais iguais tem distancia zero", () => {
  const x = soma(seno(220, 1), seno(660, 1));
  const a = mediaDeQuadros(mfcc(espectrograma(x), TAXA));
  const b = mediaDeQuadros(mfcc(espectrograma(x), TAXA));
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-9);
});

test("o MFCC separa timbre de seno e de ruido", () => {
  const a = mediaDeQuadros(mfcc(espectrograma(seno(440, 1)), TAXA));
  const b = mediaDeQuadros(mfcc(espectrograma(ruido(1)), TAXA));
  let d = 0;
  for (let i = 0; i < a.length; i++) d += (a[i] - b[i]) ** 2;
  assert.ok(Math.sqrt(d) > 5, `distancia ${Math.sqrt(d)}`);
});

test("o MFCC ignora o coeficiente 0, que e so volume", () => {
  // Dobrar o ganho nao pode mudar o timbre medido.
  const a = mediaDeQuadros(mfcc(espectrograma(seno(440, 1, TAXA, 0.2)), TAXA));
  const b = mediaDeQuadros(mfcc(espectrograma(seno(440, 1, TAXA, 0.4)), TAXA));
  let d = 0;
  for (let i = 0; i < a.length; i++) d += (a[i] - b[i]) ** 2;
  assert.ok(Math.sqrt(d) < 0.5, `distancia ${Math.sqrt(d)}`);
});

// ── tempo ─────────────────────────────────────────────────
test("o BPM de um trem de cliques e achado", () => {
  for (const alvo of [90, 120, 140]) {
    const f = fluxoEspectral(espectrograma(cliques(alvo, 8)));
    const bpm = bpmDe(f, TAXA / SALTO);
    assert.ok(Math.abs(bpm - alvo) < 4, `pedi ${alvo}, deu ${bpm}`);
  }
});

test("sem batida nenhuma o BPM volta nulo em vez de inventar", () => {
  const f = fluxoEspectral(espectrograma(seno(440, 6)));
  assert.strictEqual(bpmDe(f, TAXA / SALTO), null);
});

// ── correlacao e alinhamento ──────────────────────────────
test("correlacao de serie com ela mesma e 1; invertida, -1", () => {
  const a = [1, 2, 3, 4, 5, 4, 3, 2];
  const b = a.map(v => -v);
  assert.ok(Math.abs(correlacaoPearson(a, a) - 1) < 1e-12);
  assert.ok(Math.abs(correlacaoPearson(a, b) + 1) < 1e-12);
});

test("correlacao de serie constante e 0, nao NaN", () => {
  assert.strictEqual(correlacaoPearson([2, 2, 2, 2], [1, 2, 3, 4]), 0);
});

test("o alinhamento acha o deslocamento entre os dois trechos", () => {
  // E o nucleo da comparacao: os 30 s do original e os 30 s do karaoke nunca
  // comecam no mesmo ponto da musica.
  const base = [0, 1, 0, 0, 3, 0, 1, 0, 0, 2, 0, 0, 1, 0, 4, 0, 0, 1, 0, 0];
  const atrasada = [0, 0, 0, ...base];
  const { atraso, correlacao } = alinhar(base, atrasada, 8);
  assert.strictEqual(atraso, 3, `achou ${atraso}`);
  assert.ok(correlacao > 0.95, `correlacao ${correlacao}`);
});

test("series sem relacao nao fingem alinhamento", () => {
  const { correlacao } = alinhar([...ruido(0.05)], [...ruido(0.05, TAXA, 99)], 20);
  assert.ok(correlacao < 0.6, `correlacao ${correlacao}`);
});

// ── a nota ────────────────────────────────────────────────
function medidasDe(x) {
  const esp = espectrograma(x);
  return {
    croma: croma(esp, TAXA),
    mfcc: mfcc(esp, TAXA),
    fluxo: fluxoEspectral(esp),
    // Quadro por quadro, nao a media: a media da musica inteira misturaria o
    // refrao com a introducao quando so 30 s casam.
    graves: require("../src/espectro").gravesDe(esp, TAXA),
    taxa: TAXA,
  };
}

test("o mesmo audio contra ele mesmo da 100", () => {
  const m = medidasDe(soma(seno(261.6, 4), seno(329.6, 4), cliques(120, 4)));
  const { nota } = notaDeQualidade(m, m);
  assert.strictEqual(nota, 100);
});

test("audio sem relacao nenhuma da nota baixa", () => {
  const a = medidasDe(soma(seno(261.6, 4), seno(329.6, 4), cliques(120, 4)));
  const b = medidasDe(ruido(4));
  const { nota } = notaDeQualidade(a, b);
  assert.ok(nota < 45, `deu ${nota}`);
});

test("a nota devolve as partes, para dizer POR QUE a versao e ruim", () => {
  // "tempo bate, harmonia bate, timbre nao" = regravacao fiel mas sintetizada.
  const m = medidasDe(soma(seno(261.6, 4), cliques(120, 4)));
  const { partes } = notaDeQualidade(m, m);
  for (const k of ["harmonia", "grave", "timbre", "tempo"]) {
    assert.ok(k in partes, `falta a parte ${k}`);
    assert.ok(partes[k] >= 0 && partes[k] <= 100, `${k} = ${partes[k]}`);
  }
});

// Dente de serra: muitos harmonicos sobre a mesma nota. E o que um patch de
// teclado faz — mesma harmonia, timbre de plastico. Ruido branco seria um teste
// mais facil e menos fiel ao caso que o selo tem de pegar.
function serra(hz, segundos, taxa = TAXA, ganho = 0.3, harmonicos = 12) {
  const n = Math.round(segundos * taxa);
  const x = new Float32Array(n);
  for (let h = 1; h <= harmonicos; h++) {
    if (hz * h >= taxa / 2) break;
    for (let i = 0; i < n; i++) x[i] += (ganho / h) * Math.sin(2 * Math.PI * hz * h * i / taxa);
  }
  return x;
}

test("mesma harmonia com timbre diferente perde pontos, mas nao todos", () => {
  // O caso do MIDI fiel: acordes certos, instrumento de plastico.
  const acorde = soma(seno(261.6, 4), seno(329.6, 4), seno(392.0, 4));
  const a = medidasDe(soma(acorde, cliques(120, 4)));
  // As mesmas tres notas, agora com uma pilha de harmonicos: outro timbre.
  const outro = soma(serra(261.6, 4), serra(329.6, 4), serra(392.0, 4));
  const b = medidasDe(soma(outro, cliques(120, 4)));
  const { partes } = notaDeQualidade(a, b);
  // A INTENCAO do teste sobrevive a calibracao de 06/11: o diagnostico tem de
  // distinguir "mesma harmonia, outro instrumento". O que mudou e que a NOTA
  // nao e mais uma media destas partes — ela e o grave, e aqui o grave e igual
  // de proposito (mesma pilha de cliques nos dois), entao a nota alta esta
  // certa: nada abaixo de 250 Hz mudou.
  assert.ok(partes.harmonia > 60, `harmonia deveria aguentar a oitava: ${partes.harmonia}`);
  assert.ok(partes.timbre < 70, `timbre deveria cair: ${partes.timbre}`);
});

test("a nota e um inteiro de 0 a 100", () => {
  const a = medidasDe(seno(440, 3));
  const b = medidasDe(ruido(3));
  for (const par of [[a, a], [a, b], [b, a]]) {
    const { nota } = notaDeQualidade(par[0], par[1]);
    assert.ok(Number.isInteger(nota) && nota >= 0 && nota <= 100, `nota ${nota}`);
  }
});

test("medida faltando nao estoura: devolve nota nula", () => {
  // Arquivo curto, decodificacao falhada, musica que o iTunes nao tem.
  const a = medidasDe(seno(440, 3));
  assert.strictEqual(notaDeQualidade(a, null).nota, null);
  assert.strictEqual(notaDeQualidade(null, a).nota, null);
  assert.strictEqual(notaDeQualidade(a, { croma: [], mfcc: [], fluxo: [], graves: [] }).nota, null);
});

test("o tamanho e o salto do quadro sao os que o resto do sistema assume", () => {
  // Trocar isto muda toda nota ja gravada: fica explicito e com teste.
  assert.strictEqual(TAMANHO, 2048);
  assert.strictEqual(SALTO, 1024);
});

// ── achar o trecho dentro da musica inteira ───────────────
// O preview do iTunes sao 30 s do MEIO da musica; a versao de karaoke tem 4
// minutos. Deslocar ±6 s nao acha um trecho de 30 s dentro de uma musica
// inteira — e sem achar o trecho certo, toda a comparacao compara pedacos
// diferentes da musica e a nota nao vale nada.
//
// A busca e grossa primeiro (croma reduzido) e depois refinada, senao sao
// bilhoes de operacoes por musica.
const { procurarTrecho, reduzirSerie, gravesDe } = require("../src/espectro");

function cromaDe(x) { return croma(espectrograma(x), TAXA); }

test("acha onde o trecho curto esta dentro do longo", () => {
  // Musica com tres partes harmonicas distintas; o "preview" e a do meio.
  const doM = soma(seno(261.6, 6), seno(329.6, 6), seno(392.0, 6));
  const faM = soma(seno(349.2, 6), seno(440.0, 6), seno(523.3, 6));
  const solM = soma(seno(392.0, 6), seno(493.9, 6), seno(587.3, 6));
  const inteira = new Float32Array(doM.length + faM.length + solM.length);
  inteira.set(doM, 0); inteira.set(faM, doM.length); inteira.set(solM, doM.length + faM.length);

  const longo = cromaDe(inteira);
  const curto = cromaDe(faM.subarray(TAXA, TAXA * 5));   // 4 s do meio do fa
  const { inicio, correlacao } = procurarTrecho(longo, curto);

  // O fa comeca em 6 s; o recorte comeca 1 s depois dele => 7 s.
  const quadrosPorSegundo = TAXA / SALTO;
  const esperado = Math.round(7 * quadrosPorSegundo);
  assert.ok(Math.abs(inicio - esperado) < quadrosPorSegundo,
    `esperava perto de ${esperado} quadros, achou ${inicio}`);
  assert.ok(correlacao > 0.9, `correlacao ${correlacao}`);
});

test("trecho que nao esta na musica nao finge posicao", () => {
  const doM = soma(seno(261.6, 6), seno(329.6, 6), seno(392.0, 6));
  const outro = soma(seno(277.2, 4), seno(466.2, 4));   // harmonia estranha
  const { correlacao } = procurarTrecho(cromaDe(doM), cromaDe(outro));
  assert.ok(correlacao < 0.9, `correlacao ${correlacao}`);
});

test("trecho maior que a musica nao estoura", () => {
  const curto = cromaDe(seno(440, 1.5));
  const longo = cromaDe(seno(440, 0.5));
  const r = procurarTrecho(longo, curto);
  assert.strictEqual(r.inicio, 0);
  assert.ok(r.correlacao >= 0 && r.correlacao <= 1);
});

test("reduzir a serie mantem o tamanho dos vetores e divide os quadros", () => {
  const c = cromaDe(seno(440, 2));
  const r = reduzirSerie(c, 4);
  assert.strictEqual(r[0].length, 12);
  assert.ok(Math.abs(r.length - Math.floor(c.length / 4)) <= 1, `${c.length} -> ${r.length}`);
});

test("o grave e so a faixa abaixo de 250 Hz, quadro por quadro", () => {
  const esp = espectrograma(seno(440, 1));
  const g = gravesDe(esp, TAXA);
  assert.strictEqual(g.length, esp.length);
  // 250 Hz a 22050 com quadro de 2048: uns 23 bins.
  assert.ok(g[0].length >= 20 && g[0].length <= 26, `bins no grave: ${g[0].length}`);
});

test("um la 440 nao tem energia no grave; um la 110 tem", () => {
  const agudo = gravesDe(espectrograma(seno(440, 1)), TAXA);
  const grave = gravesDe(espectrograma(seno(110, 1)), TAXA);
  const total = v => v.reduce((s, x) => s + x, 0);
  assert.ok(total(mediaDeQuadros(grave)) > 10 * total(mediaDeQuadros(agudo)),
    "o seno de 110 Hz tem de dominar a faixa do grave");
});

// ── perfil de andamento ───────────────────────────────────
// Extrair UM numero de BPM e comparar exigia decidir antes "tem batida ou
// nao?", e essa decisao nao tem corte confiavel: medido em 06/11, o
// coeficiente de variacao do fluxo da 0,53-0,70 num tom continuo e 0,96-1,46 em
// musica de verdade — vao estreito demais para apostar uma nota nele. Pior: num
// caso de duvida o tempo era descartado calado e os 15% de peso dele
// desapareciam da nota.
//
// Comparar o PERFIL inteiro de autocorrelacao resolve os dois problemas: nao
// precisa de porteiro, e balada sem percussao compara igual a rock.
const { perfilDeTempo } = require("../src/espectro");

test("o perfil de andamento de dois trechos no mesmo BPM casa", () => {
  const fps = TAXA / SALTO;
  const a = perfilDeTempo(fluxoEspectral(espectrograma(cliques(120, 10))), fps);
  // Mesmo andamento, fase diferente: o perfil nao depende de onde comeca.
  const b = perfilDeTempo(fluxoEspectral(espectrograma(cliques(120, 10).slice(5000))), fps);
  assert.ok(cosseno(a, b) > 0.9, `cosseno ${cosseno(a, b)}`);
});

test("andamentos diferentes dao perfis diferentes", () => {
  const fps = TAXA / SALTO;
  const a = perfilDeTempo(fluxoEspectral(espectrograma(cliques(120, 10))), fps);
  const b = perfilDeTempo(fluxoEspectral(espectrograma(cliques(150, 10))), fps);
  assert.ok(cosseno(a, b) < 0.6, `cosseno ${cosseno(a, b)}`);
});

test("o perfil tem sempre o mesmo tamanho, para poder ser comparado", () => {
  const fps = TAXA / SALTO;
  const a = perfilDeTempo(fluxoEspectral(espectrograma(cliques(120, 10))), fps);
  const b = perfilDeTempo(fluxoEspectral(espectrograma(cliques(90, 20))), fps);
  assert.strictEqual(a.length, b.length);
  assert.ok(a.length > 20, `tamanho ${a.length}`);
});

test("fluxo curto ou vazio devolve perfil vazio, nao estoura", () => {
  assert.strictEqual(perfilDeTempo([], 21.5).length, 0);
  assert.strictEqual(perfilDeTempo([1, 2, 3], 21.5).length, 0);
  assert.strictEqual(perfilDeTempo(null, 21.5).length, 0);
});

test("o tempo entra na nota mesmo sem batida clara", () => {
  // Era o defeito: `bpm ?/?` e o peso do tempo evaporando da conta.
  const m = medidasDe(soma(seno(261.6, 6), seno(329.6, 6)));
  const { partes } = notaDeQualidade(m, m);
  assert.strictEqual(partes.tempo, 100, `partes: ${JSON.stringify(partes)}`);
});

// ── calibracao pelo ouvido do KJ (06/11/2026) ─────────────
// Ele ouviu 12 pares em teste cego (trecho do master contra o mesmo trecho da
// versao, nota escondida ate o voto) e rotulou cada um. O resultado derrubou o
// meu desenho: eu tinha dado peso a quatro medidas, e as outras tres estavam
// DILUINDO a unica que funciona.
//
//   grave     11/11   master [95,97,97,100]  regravado [0,27,37,44,50,66,82]
//   harmonia  10/11   faixas sobrepostas (87 contra 93)
//   timbre     9/11   atrapalha: o Skyfall, que ele ouviu como master, tem 37
//   tempo      7/11   pouco acima de moeda
//
// O mecanismo explica: abaixo de 250 Hz vivem baixo e bumbo, e a voz NAO. Quem
// tirou a voz do master entrega aquela faixa intacta; quem regravou nao tem
// como reproduzi-la. O timbre mede justamente a regiao onde a voz ausente faz
// falta — por isso ele e ruido nesta pergunta.
//
// Estes sao os valores MEDIDOS daquele lote. O teste existe para que ninguem
// volte a dissolver o grave em media com o resto sem antes refazer a medicao.
const { LIMITE_SELO, PESOS } = require("../src/espectro");

const GABARITO_06_11 = [
  { musica: "Metalingus",          canal: "Karstens Karaoke Elite", ouvido: "master",    p: { harmonia: 98, grave: 100, timbre: 84, tempo: 97 } },
  { musica: "Would",               canal: "CC Karaoke X",           ouvido: "master",    p: { harmonia: 97, grave: 97,  timbre: 75, tempo: 94 } },
  { musica: "Be Yourself",         canal: "ObsKure Karaoke",        ouvido: "master",    p: { harmonia: 94, grave: 97,  timbre: 56, tempo: 97 } },
  { musica: "Skyfall",             canal: "Sing King",              ouvido: "master",    p: { harmonia: 87, grave: 95,  timbre: 37, tempo: 62 } },
  { musica: "Set Fire To the Rain", canal: "KaraFun Karaoke",       ouvido: "regravado", p: { harmonia: 89, grave: 82,  timbre: 62, tempo: 98 } },
  { musica: "I Bet You Look Good", canal: "Zoom Karaoke Official",  ouvido: "regravado", p: { harmonia: 93, grave: 66,  timbre: 59, tempo: 97 } },
  { musica: "Nobodys Home",        canal: "Zoom Karaoke Official",  ouvido: "regravado", p: { harmonia: 93, grave: 44,  timbre: 65, tempo: 96 } },
  { musica: "Rolling in the Deep", canal: "Musisi Karaoke",         ouvido: "regravado", p: { harmonia: 88, grave: 37,  timbre: 34, tempo: 100 } },
  { musica: "I Dont Want To Miss a Thing", canal: "Zoom Karaoke",   ouvido: "regravado", p: { harmonia: 85, grave: 27,  timbre: 40, tempo: 85 } },
  { musica: "Someone Like You",    canal: "Musisi Karaoke",         ouvido: "regravado", p: { harmonia: 72, grave: 50,  timbre: 3,  tempo: 51 } },
  { musica: "I Want It That Way",  canal: "Atomic Karaoke",         ouvido: "regravado", p: { harmonia: 83, grave: 0,   timbre: 30, tempo: 0 } },
];

// Reproduz a media ponderada que notaDeQualidade faz, para testar os PESOS sem
// precisar de audio.
function notaComPesos(partes, pesos) {
  let soma = 0, peso = 0;
  for (const [k, w] of Object.entries(pesos)) {
    if (partes[k] === undefined || !w) continue;
    soma += partes[k] * w; peso += w;
  }
  return peso > 0 ? Math.round(soma / peso) : null;
}

test("o grave sozinho separa o gabarito inteiro", () => {
  const master = GABARITO_06_11.filter(i => i.ouvido === "master").map(i => i.p.grave);
  const regravado = GABARITO_06_11.filter(i => i.ouvido === "regravado").map(i => i.p.grave);
  assert.ok(Math.min(...master) > Math.max(...regravado),
    `master min ${Math.min(...master)} tem de ficar acima de regravado max ${Math.max(...regravado)}`);
});

test("o limite do selo cai DENTRO do vao medido, nao na borda", () => {
  // Borda generaliza pior: o corte fica no meio de 82 e 95.
  const master = GABARITO_06_11.filter(i => i.ouvido === "master").map(i => i.p.grave);
  const regravado = GABARITO_06_11.filter(i => i.ouvido === "regravado").map(i => i.p.grave);
  assert.ok(LIMITE_SELO > Math.max(...regravado), `${LIMITE_SELO} tem de ficar acima de 82`);
  assert.ok(LIMITE_SELO < Math.min(...master), `${LIMITE_SELO} tem de ficar abaixo de 95`);
});

test("os pesos atuais classificam o gabarito inteiro", () => {
  const erros = GABARITO_06_11.filter(i =>
    (notaComPesos(i.p, PESOS) >= LIMITE_SELO) !== (i.ouvido === "master"));
  assert.deepStrictEqual(erros.map(e => `${e.musica} [${e.canal}]`), [],
    "nenhum item do gabarito pode ser classificado errado pelos pesos em vigor");
});

test("diluir o grave em media com o resto volta a errar — e por isso nao se faz", () => {
  // Os pesos que eu tinha escolhido antes de medir. Erram o Skyfall, que ele
  // ouviu como master: timbre 37 e tempo 62 derrubam uma nota cujo grave e 95.
  const antigos = { harmonia: 0.30, grave: 0.30, timbre: 0.25, tempo: 0.15 };
  const erros = GABARITO_06_11.filter(i =>
    (notaComPesos(i.p, antigos) >= 86) !== (i.ouvido === "master"));
  assert.ok(erros.length > 0,
    "este teste existe para registrar que os pesos antigos erravam; se parou de errar, a medicao mudou e precisa ser refeita");
});

test("as outras tres medidas continuam sendo calculadas, como diagnostico", () => {
  // Elas saem da NOTA, nao do relatorio: e o que permite dizer "o grave bate,
  // o timbre nao" e entender a versao em vez de so pontua-la.
  for (const k of ["harmonia", "timbre", "tempo"]) {
    assert.ok(k in PESOS, `${k} tem de continuar listado em PESOS`);
  }
  assert.strictEqual(PESOS.grave, 1, "o grave e a nota");
});
