"use strict";

// Analisador de espectro do selo de qualidade (pedido dele em 06/11/2026).
//
// A pergunta: esta versao de karaoke e o MASTER original com a voz tirada, ou
// alguem regravou em teclado? Ele ouve a diferenca na hora; aqui ela e medida,
// comparando um trecho do original com um trecho da versao:
//
//   harmonia  a progressao de acordes ao longo do trecho (croma). A mesma
//             gravacao correlaciona quase 1; regravacao em outro andamento ou
//             com outra harmonizacao cai muito.
//   grave     abaixo de 250 Hz vivem baixo e bumbo — onde a voz NAO esta. Num
//             stem do master isso e quase identico ao original, e e a medida
//             mais confiavel justamente porque a voz ausente nao a atrapalha.
//   timbre    guitarra gravada contra patch de teclado (MFCC, sem o
//             coeficiente 0, para volume e equalizacao nao contarem).
//   tempo     stem do master bate o BPM exato; regravacao desliza.
//
// Nada de modelo de rede neural aqui, de proposito: um embedding de audio
// (CLAP, VGGish) custa centenas de MB, exige Python, roda lento sem GPU e
// devolve uma distancia generica — enquanto estas quatro medidas dizem POR QUE
// a versao e ruim ("tempo bate, harmonia bate, timbre nao" = regravacao fiel
// mas sintetizada).
//
// Este arquivo e puro: entra amostra (Float32Array mono), sai numero. Quem
// decodifica arquivo e o ffmpeg, no processo principal.

// Quadro de 2048 amostras a 22050 Hz = 93 ms, com salto de 1024 (46 ms).
// Trocar isto muda TODA nota ja gravada no banco — por isso e constante
// exportada e tem teste.
const TAMANHO = 2048;
const SALTO = 1024;

// Abaixo daqui e baixo e bumbo. 250 Hz fica confortavelmente embaixo da
// fundamental da voz masculina (~85-180 Hz tem sobreposicao, mas a ENERGIA da
// voz esta acima), e e a faixa que um stem do master reproduz igual.
const TETO_GRAVE_HZ = 250;

// Quantos coeficientes de MFCC e quantas bandas mel. 13 coeficientes e o
// costume; o 0 e descartado porque e so energia.
const BANDAS_MEL = 26;
const COEFS_MFCC = 13;

// Escala que transforma distancia de MFCC em nota. Vem de medicao, nao de
// chute: calibrada no acervo dele em 06/11. Subir o numero e perdoar mais.
const ESCALA_TIMBRE = 10;

// Peso de cada parte na nota. CALIBRADO no ouvido dele em 06/11/2026, num teste
// cego de 12 pares (trecho do master contra o mesmo trecho da versao, nota
// escondida ate o voto):
//
//   grave     11/11   master [95,97,97,100]  regravado [0,27,37,44,50,66,82]
//   harmonia  10/11   faixas sobrepostas (87 contra 93)
//   timbre     9/11   atrapalha: o Skyfall, que ele ouviu como master, tem 37
//   tempo      7/11   pouco acima de moeda
//
// Os pesos que eu havia escolhido (0,30/0,30/0,25/0,15) erravam o Skyfall
// justamente por isso: as outras tres medidas DILUIAM a unica que funciona. A
// busca em grade concordou — todas as melhores combinacoes poem o grave entre
// 0,7 e 1,0 e o resto em zero.
//
// O mecanismo explica o resultado: abaixo de 250 Hz vivem baixo e bumbo, e a
// voz NAO. Quem tirou a voz do master entrega aquela faixa intacta; quem
// regravou nao tem como reproduzi-la. O timbre mede justamente a regiao onde a
// voz ausente faz falta — e por isso e ruido nesta pergunta.
//
// As outras tres continuam sendo CALCULADAS e devolvidas: servem para explicar
// a versao ("o grave bate, o timbre nao") em vez de so pontua-la. Dissolver o
// grave numa media com elas de novo exige refazer a medicao primeiro, e ha
// teste que falha se alguem tentar.
const PESOS = { harmonia: 0, grave: 1, timbre: 0, tempo: 0 };

// Acima disto a versao leva selo. Fica no MEIO do vao medido (82 a 95), nao na
// borda: corte na borda generaliza pior. Provisorio por honestidade — 11
// rotulos, 4 deles master, e a medida foi escolhida depois de ver os rotulos.
// Confirmar com um segundo lote tirado da zona de duvida (grave 77-97), que e
// onde a decisao vive e onde o primeiro lote so tinha 2 itens.
const LIMITE_SELO = 88;

// ── janela ────────────────────────────────────────────────
// Sem janela, o corte do quadro inventa frequencia que nao existe no som
// (vazamento espectral) e o croma sai sujo.
const _janelas = new Map();
function janelaHann(n) {
  if (_janelas.has(n)) return _janelas.get(n);
  const j = new Float64Array(n);
  for (let i = 0; i < n; i++) j[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  _janelas.set(n, j);
  return j;
}

// ── FFT ───────────────────────────────────────────────────
// Cooley-Tukey radix-2 iterativa, no lugar. Potencia de dois so: a versao
// generica custa o dobro do codigo para um caso que nunca acontece aqui.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let tam = 2; tam <= n; tam <<= 1) {
    const ang = -2 * Math.PI / tam;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += tam) {
      let cRe = 1, cIm = 0;
      for (let k = 0; k < tam / 2; k++) {
        const aRe = re[i + k], aIm = im[i + k];
        const bRe = re[i + k + tam / 2] * cRe - im[i + k + tam / 2] * cIm;
        const bIm = re[i + k + tam / 2] * cIm + im[i + k + tam / 2] * cRe;
        re[i + k] = aRe + bRe; im[i + k] = aIm + bIm;
        re[i + k + tam / 2] = aRe - bRe; im[i + k + tam / 2] = aIm - bIm;
        const nRe = cRe * wRe - cIm * wIm;
        cIm = cRe * wIm + cIm * wRe;
        cRe = nRe;
      }
    }
  }
}

// Magnitude de meio espectro (o resto e espelho) de UM quadro, com janela.
function fftMagnitude(quadro) {
  const n = quadro.length;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error("fftMagnitude: tamanho tem de ser potencia de dois");
  const j = janelaHann(n);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = quadro[i] * j[i];
  fft(re, im);
  const m = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) m[i] = Math.hypot(re[i], im[i]);
  return m;
}

// ── espectrograma ─────────────────────────────────────────
function espectrograma(pcm, { tamanho = TAMANHO, salto = SALTO } = {}) {
  const quadros = [];
  if (!pcm || pcm.length < tamanho) return quadros;
  for (let i = 0; i + tamanho <= pcm.length; i += salto) {
    quadros.push(fftMagnitude(pcm.subarray ? pcm.subarray(i, i + tamanho) : pcm.slice(i, i + tamanho)));
  }
  return quadros;
}

// Media de uma lista de vetores do mesmo tamanho. Serve para resumir o
// espectrograma, o croma e o MFCC num vetor so.
function mediaDeQuadros(quadros) {
  if (!quadros || !quadros.length) return new Float64Array(0);
  const n = quadros[0].length;
  const m = new Float64Array(n);
  for (const q of quadros) for (let i = 0; i < n; i++) m[i] += q[i];
  for (let i = 0; i < n; i++) m[i] /= quadros.length;
  return m;
}

// ── croma ─────────────────────────────────────────────────
// Doze classes de nota (do=0 .. si=11). O croma e a ferramenta certa aqui
// porque ignora oitava e instrumentacao: o que sobra e a harmonia.
const _mapasCroma = new Map();
function mapaDeCroma(bins, taxa) {
  const chave = bins + "@" + taxa;
  if (_mapasCroma.has(chave)) return _mapasCroma.get(chave);
  const mapa = new Int8Array(bins).fill(-1);
  for (let i = 1; i < bins; i++) {
    const hz = i * taxa / (bins * 2);
    // Fora de 55 Hz..5 kHz nao ha informacao harmonica util: embaixo e rumble,
    // em cima e prato e sibilancia.
    if (hz < 55 || hz > 5000) continue;
    const midi = 69 + 12 * Math.log2(hz / 440);
    mapa[i] = ((Math.round(midi) % 12) + 12) % 12;
  }
  _mapasCroma.set(chave, mapa);
  return mapa;
}

function croma(quadros, taxa) {
  if (!quadros || !quadros.length) return [];
  const mapa = mapaDeCroma(quadros[0].length, taxa);
  return quadros.map(q => {
    const c = new Float64Array(12);
    for (let i = 1; i < q.length; i++) if (mapa[i] >= 0) c[mapa[i]] += q[i];
    // Normalizado por quadro: o selo nao pode premiar quem masterizou mais
    // alto, e sem isto a parte alta da musica dominaria a media.
    let s = 0;
    for (let k = 0; k < 12; k++) s += c[k] * c[k];
    s = Math.sqrt(s);
    if (s > 0) for (let k = 0; k < 12; k++) c[k] /= s;
    return c;
  });
}

// ── MFCC ──────────────────────────────────────────────────
const _bancos = new Map();
function bancoMel(bins, taxa) {
  const chave = bins + "@" + taxa;
  if (_bancos.has(chave)) return _bancos.get(chave);
  const paraMel = f => 2595 * Math.log10(1 + f / 700);
  const deMel = m => 700 * (10 ** (m / 2595) - 1);
  const alto = Math.min(8000, taxa / 2);
  const m0 = paraMel(20), m1 = paraMel(alto);
  const pontos = [];
  for (let i = 0; i < BANDAS_MEL + 2; i++) {
    const hz = deMel(m0 + (m1 - m0) * i / (BANDAS_MEL + 1));
    pontos.push(hz * bins * 2 / taxa);
  }
  const banco = [];
  for (let b = 0; b < BANDAS_MEL; b++) {
    const [esq, meio, dir] = [pontos[b], pontos[b + 1], pontos[b + 2]];
    const f = new Float64Array(bins);
    for (let i = Math.max(0, Math.floor(esq)); i < Math.min(bins, Math.ceil(dir)); i++) {
      if (i <= meio && meio > esq) f[i] = (i - esq) / (meio - esq);
      else if (i > meio && dir > meio) f[i] = (dir - i) / (dir - meio);
      if (f[i] < 0) f[i] = 0;
    }
    banco.push(f);
  }
  _bancos.set(chave, banco);
  return banco;
}

function mfcc(quadros, taxa) {
  if (!quadros || !quadros.length) return [];
  const banco = bancoMel(quadros[0].length, taxa);
  return quadros.map(q => {
    const log = new Float64Array(BANDAS_MEL);
    for (let b = 0; b < BANDAS_MEL; b++) {
      let e = 0;
      const f = banco[b];
      for (let i = 0; i < q.length; i++) if (f[i]) e += q[i] * f[i];
      log[b] = Math.log(e + 1e-10);
    }
    // DCT-II. O coeficiente 0 e energia (volume) e fica FORA: duas copias da
    // mesma musica com masterizacao diferente tem de dar o mesmo timbre.
    const c = new Float64Array(COEFS_MFCC - 1);
    for (let k = 1; k < COEFS_MFCC; k++) {
      let s = 0;
      for (let b = 0; b < BANDAS_MEL; b++) s += log[b] * Math.cos(Math.PI * k * (b + 0.5) / BANDAS_MEL);
      c[k - 1] = s;
    }
    return c;
  });
}

// ── tempo ─────────────────────────────────────────────────
// Fluxo espectral: quanto o espectro CRESCEU de um quadro para o outro. E o
// sinal de ataque — onde ha batida.
function fluxoEspectral(quadros) {
  const f = [];
  for (let t = 1; t < (quadros ? quadros.length : 0); t++) {
    let s = 0;
    const a = quadros[t - 1], b = quadros[t];
    for (let i = 0; i < b.length; i++) { const d = b[i] - a[i]; if (d > 0) s += d; }
    f.push(s);
  }
  return f;
}

// BPM por autocorrelacao do fluxo. O fluxo e reamostrado 4x antes: a 21,5
// quadros por segundo os atrasos inteiros dao saltos de 6 BPM perto de 140, o
// que e grosseiro demais para distinguir stem do master de regravacao.
const SOBRE = 4;
// Corte do coeficiente de variacao do fluxo: abaixo disto nao e batida, e
// nenhum BPM e devolvido. Fica no meio do vao medido em 06/11 (tom continuo ate
// 0,70; batida de 2,8 para cima).
// Medido em 06/11: tom continuo da 0,53-0,70 e musica de verdade 0,96-1,46. O
// corte fica no meio do vao. Note que este porteiro vale apenas para o BPM que
// se MOSTRA ao KJ — a nota usa o perfil de andamento, que nao precisa decidir
// antes se ha batida.
const CV_MINIMO = 0.85;

// A 21,5 quadros por segundo, os atrasos inteiros na faixa de 60-200 BPM dao
// so 16 pontos — perto de 140 BPM cada passo vale 6 BPM. Reamostrar o fluxo 4x
// antes da autocorrelacao e o que torna a medida util: 61 pontos, e o erro de
// BPM cai de 6 para menos de 2.
function sobreamostrar(fluxo) {
  const n = fluxo.length;
  let media = 0;
  for (const v of fluxo) media += v;
  media /= n;
  const m = (n - 1) * SOBRE + 1;
  const x = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const p = i / SOBRE, k = Math.floor(p), fr = p - k;
    const a = fluxo[k] - media, b = (fluxo[k + 1] === undefined ? fluxo[k] : fluxo[k + 1]) - media;
    x[i] = a + (b - a) * fr;
  }
  return { x, media };
}
function bpmDe(fluxo, quadrosPorSegundo, { minimo = 60, maximo = 200 } = {}) {
  if (!fluxo || fluxo.length < 16 || !(quadrosPorSegundo > 0)) return null;
  const n = fluxo.length;
  let media = 0;
  for (const v of fluxo) media += v;
  media /= n;
  let variancia = 0;
  for (const v of fluxo) variancia += (v - media) ** 2;
  if (variancia / n < 1e-12) return null;

  // Batida e IMPULSIVA: o fluxo tem picos altos sobre um fundo quase nulo. Um
  // tom continuo tambem produz fluxo periodico (a fase do seno muda de quadro
  // em quadro e a magnitude ondula), e a autocorrelacao acha nisso um "BPM" que
  // nao existe. O coeficiente de variacao separa os dois com folga larga —
  // medido em 06/11: seno continuo 0,53-0,70; trem de cliques 2,8-3,7.
  const cv = Math.sqrt(variancia / n) / (media || 1e-12);
  if (cv < CV_MINIMO) return null;

  const { x } = sobreamostrar(fluxo);
  const m = x.length;
  const fps = quadrosPorSegundo * SOBRE;
  const atraso = bpm => Math.round(fps * 60 / bpm);
  const de = atraso(maximo), ate = Math.min(atraso(minimo), Math.floor(m / 2));
  if (!(ate > de + 2)) return null;

  const ac = l => { let s = 0; for (let i = 0; i + l < m; i++) s += x[i] * x[i + l]; return s; };
  const ac0 = ac(0);
  if (!(ac0 > 0)) return null;
  let melhor = de, melhorV = -Infinity;
  for (let l = de; l <= ate; l++) { const v = ac(l); if (v > melhorV) { melhorV = v; melhor = l; } }
  // Pico fraco demais para ser batida.
  if (melhorV / ac0 < 0.15) return null;

  // Parabola pelos tres pontos ao redor do pico: sem isto o erro chega a 6 BPM.
  const y0 = ac(melhor - 1), y1 = melhorV, y2 = ac(melhor + 1);
  const d = y0 - 2 * y1 + y2;
  const ajuste = d !== 0 ? 0.5 * (y0 - y2) / d : 0;
  const lag = melhor + Math.max(-1, Math.min(1, ajuste));
  if (!(lag > 0)) return null;
  const bpm = 60 * fps / lag;
  // O refinamento pela parabola pode empurrar o atraso um ponto para fora da
  // faixa; devolver 207 BPM quando se pediu ate 200 seria mentira.
  return bpm >= minimo * 0.98 && bpm <= maximo * 1.02 ? bpm : null;
}

// Perfil de andamento: a curva de autocorrelacao do fluxo na faixa de BPM
// util, sem media e normalizada. Comparar o perfil inteiro e melhor que
// comparar um BPM extraido, porque dispensa decidir antes "tem batida ou nao?"
// — decisao que nao tem corte confiavel (ver CV_MINIMO) e que fazia o tempo
// desaparecer da nota justamente nos casos duvidosos.
//
// O tamanho e sempre o mesmo para um dado `fps`, senao dois perfis nao se
// comparam.
function perfilDeTempo(fluxo, quadrosPorSegundo, { minimo = 60, maximo = 200 } = {}) {
  const vazio = new Float64Array(0);
  if (!fluxo || fluxo.length < 16 || !(quadrosPorSegundo > 0)) return vazio;
  const { x } = sobreamostrar(fluxo);
  const n = x.length;
  const fps = quadrosPorSegundo * SOBRE;
  const de = Math.max(1, Math.round(fps * 60 / maximo));
  const ate = Math.round(fps * 60 / minimo);
  if (ate >= n - 8) return vazio;
  const perfil = new Float64Array(ate - de + 1);
  for (let l = de; l <= ate; l++) {
    let acc = 0, pares = 0;
    for (let i = 0; i + l < n; i++) { acc += x[i] * x[i + l]; pares++; }
    // Dividido pelos pares: atrasos maiores tem menos pares e pareceriam
    // sempre mais fracos.
    perfil[l - de] = pares ? acc / pares : 0;
  }
  // Sem media e normalizado: o que importa e ONDE estao os picos, nao a energia
  // da musica.
  let m2 = 0;
  for (const v of perfil) m2 += v;
  m2 /= perfil.length || 1;
  let norma = 0;
  for (let i = 0; i < perfil.length; i++) { perfil[i] -= m2; norma += perfil[i] * perfil[i]; }
  norma = Math.sqrt(norma);
  if (norma > 0) for (let i = 0; i < perfil.length; i++) perfil[i] /= norma;
  return perfil;
}

// ── correlacao e alinhamento ──────────────────────────────
function correlacaoPearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    num += da * db; va += da * da; vb += db * db;
  }
  // Serie constante nao tem variacao: correlacao e indefinida, e 0 e a resposta
  // honesta — NaN vazaria para a nota.
  if (va <= 0 || vb <= 0) return 0;
  return num / Math.sqrt(va * vb);
}

function cosseno(a, b) {
  const n = Math.min(a.length, b.length);
  let p = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { p += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na <= 0 || nb <= 0) return 0;
  return p / Math.sqrt(na * nb);
}

// Os 30 s do original e os 30 s do karaoke nunca comecam no mesmo ponto da
// musica. Isto procura o deslocamento que melhor casa as duas series.
// `atraso` positivo quer dizer que `b` esta atrasada em relacao a `a`.
function alinhar(a, b, atrasoMaximo = 64) {
  let melhor = 0, melhorC = -Infinity;
  for (let d = -atrasoMaximo; d <= atrasoMaximo; d++) {
    const ia = Math.max(0, -d), ib = Math.max(0, d);
    const n = Math.min(a.length - ia, b.length - ib);
    if (n < 8) continue;
    const c = correlacaoPearson(
      Array.prototype.slice.call(a, ia, ia + n),
      Array.prototype.slice.call(b, ib, ib + n));
    if (c > melhorC) { melhorC = c; melhor = d; }
  }
  return { atraso: melhor, correlacao: melhorC === -Infinity ? 0 : melhorC };
}

// ── o grave, quadro por quadro ────────────────────────────
// So a faixa abaixo de 250 Hz, e so ela: guardar o espectro inteiro de uma
// musica de 4 minutos sao 40 MB, e para esta medida 23 bins bastam.
function gravesDe(quadros, taxa) {
  if (!quadros || !quadros.length) return [];
  const bins = Math.max(2, Math.round(TETO_GRAVE_HZ * quadros[0].length * 2 / taxa));
  return quadros.map(q => {
    const g = new Float64Array(bins - 1);
    for (let i = 1; i < bins; i++) g[i - 1] = q[i];
    return g;
  });
}

// ── achar o trecho dentro da musica inteira ───────────────
// Media de cada grupo de `n` quadros. Serve para a busca grossa: comparar
// quadro a quadro ao longo de uma musica inteira sao bilhoes de operacoes.
function reduzirSerie(serie, n) {
  const fora = [];
  if (!serie || !serie.length || !(n > 0)) return fora;
  const dim = serie[0].length;
  for (let i = 0; i + n <= serie.length; i += n) {
    const v = new Float64Array(dim);
    for (let k = 0; k < n; k++) for (let d = 0; d < dim; d++) v[d] += serie[i + k][d];
    for (let d = 0; d < dim; d++) v[d] /= n;
    fora.push(v);
  }
  return fora;
}

// Semelhanca media entre `curto` e a janela de `longo` que comeca em `inicio`.
function semelhancaEm(longo, curto, inicio) {
  const n = Math.min(curto.length, longo.length - inicio);
  if (n <= 0) return -1;
  let s = 0;
  for (let i = 0; i < n; i++) s += cosseno(longo[inicio + i], curto[i]);
  return s / n;
}

// Onde, dentro da musica inteira, esta o trecho de 30 s do original. Grosso
// primeiro (croma reduzido), refino depois: a busca fina sozinha custaria
// ~3 bilhoes de operacoes por musica.
function procurarTrecho(longo, curto, { reducao = 8 } = {}) {
  if (!longo || !longo.length || !curto || !curto.length) return { inicio: 0, correlacao: 0 };
  if (curto.length >= longo.length) {
    return { inicio: 0, correlacao: Math.max(0, semelhancaEm(curto, longo, 0)) };
  }
  const gL = reduzirSerie(longo, reducao), gC = reduzirSerie(curto, reducao);
  let melhorG = 0, melhorGV = -Infinity;
  if (gL.length && gC.length) {
    for (let i = 0; i + 1 <= gL.length - Math.min(gC.length, gL.length) + 1; i++) {
      const v = semelhancaEm(gL, gC, i);
      if (v > melhorGV) { melhorGV = v; melhorG = i; }
    }
  }
  // Refino em volta do palpite grosso, agora quadro a quadro.
  const centro = melhorG * reducao;
  const limite = longo.length - curto.length;
  let melhor = Math.max(0, Math.min(limite, centro)), melhorV = -Infinity;
  for (let i = Math.max(0, centro - reducao * 2); i <= Math.min(limite, centro + reducao * 2); i++) {
    const v = semelhancaEm(longo, curto, i);
    if (v > melhorV) { melhorV = v; melhor = i; }
  }
  return { inicio: melhor, correlacao: Math.max(0, melhorV) };
}

// ── a nota ────────────────────────────────────────────────
const pct = v => Math.max(0, Math.min(100, Math.round(v * 100)));

function completa(m) {
  return !!(m && m.croma && m.croma.length && m.mfcc && m.mfcc.length
            && m.graves && m.graves.length);
}

function distanciaMfcc(a, b) {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) d += (a[i] - b[i]) ** 2;
  return Math.sqrt(d);
}

// Compara as medidas do ORIGINAL com as de uma versao de karaoke.
//
// O trecho do original sao 30 s tirados do meio da musica, e a versao de
// karaoke tem 4 minutos: antes de medir qualquer coisa e preciso ACHAR onde
// aquele trecho cai dentro da versao. Sem isso a comparacao compara pedacos
// diferentes da musica e a nota nao vale nada.
//
// Devolve { nota, partes, trecho, bpm }. `nota` nula quando nao da para
// comparar: arquivo curto, decodificacao falhada, original nao encontrado.
function notaDeQualidade(original, versao) {
  const vazio = { nota: null, partes: {}, trecho: null, bpm: {} };
  if (!completa(original) || !completa(versao)) return vazio;

  const taxa = Number(original.taxa) || Number(versao.taxa) || 22050;
  const fps = taxa / SALTO;

  // Quem e o trecho e quem e a musica inteira — decidido pelo tamanho, nao por
  // quem foi passado em qual argumento.
  const origMenor = original.croma.length <= versao.croma.length;
  const curto = origMenor ? original : versao;
  const longo = origMenor ? versao : original;

  const { inicio, correlacao } = procurarTrecho(longo.croma, curto.croma);
  const n = Math.min(curto.croma.length, longo.croma.length - inicio);

  // Harmonia: cosseno medio do croma na janela casada.
  const harmonia = n > 0 ? semelhancaEm(longo.croma, curto.croma, inicio) : 0;

  // Media de uma serie so na janela casada: comparar a media da musica INTEIRA
  // contra a de 30 s mistura o refrao com a introducao.
  const janela = (serie, de, quantos) => mediaDeQuadros(serie.slice(de, de + quantos));

  // Grave: abaixo de 250 Hz, onde a voz nao esta — a medida que um stem do
  // master reproduz quase igual.
  const grave = correlacaoPearson(
    janela(longo.graves, inicio, n),
    janela(curto.graves, 0, n));

  // Timbre: distancia do MFCC medio na mesma janela.
  const timbre = Math.exp(-distanciaMfcc(
    janela(longo.mfcc, inicio, n),
    janela(curto.mfcc, 0, n)) / ESCALA_TIMBRE);

  // Tempo: a semelhanca entre os PERFIS de andamento, do fluxo inteiro de cada
  // um (andamento e global, nao da janela). Nao se extrai um BPM para comparar,
  // porque isso exigia decidir antes "tem batida?" e o tempo evaporava da nota
  // nos casos duvidosos — era o `bpm ?/?` de 06/11.
  const perfilA = perfilDeTempo(original.fluxo, fps);
  const perfilB = perfilDeTempo(versao.fluxo, fps);
  const tempo = (perfilA.length && perfilB.length) ? Math.max(0, cosseno(perfilA, perfilB)) : null;
  // O BPM continua sendo calculado, mas so para MOSTRAR ao KJ quando existe.
  const bpmA = bpmDe(original.fluxo, fps), bpmB = bpmDe(versao.fluxo, fps);

  const partes = {
    harmonia: pct(Math.max(0, harmonia)),
    grave: pct(Math.max(0, grave)),
    timbre: pct(timbre),
  };
  if (tempo !== null) partes.tempo = pct(tempo);

  let soma = 0, peso = 0;
  for (const [k, p] of Object.entries(PESOS)) {
    if (partes[k] === undefined) continue;   // tempo ausente: renormaliza
    soma += partes[k] * p; peso += p;
  }
  return {
    nota: peso > 0 ? Math.round(soma / peso) : null,
    partes,
    // Onde o trecho casou, para poder conferir a mao quando a nota surpreender.
    trecho: { inicio, segundos: +(inicio / fps).toFixed(1), quadros: n, correlacao: +correlacao.toFixed(3) },
    bpm: { original: bpmA, versao: bpmB },
  };
}

module.exports = {
  janelaHann, fftMagnitude, espectrograma, mediaDeQuadros,
  croma, mfcc, fluxoEspectral, bpmDe,
  correlacaoPearson, cosseno, alinhar, notaDeQualidade,
  gravesDe, reduzirSerie, procurarTrecho, semelhancaEm, perfilDeTempo,
  TAMANHO, SALTO, TETO_GRAVE_HZ, PESOS, ESCALA_TIMBRE, CV_MINIMO, LIMITE_SELO,
};
