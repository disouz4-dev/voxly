const { app, BrowserWindow, ipcMain, dialog, screen, powerSaveBlocker } = require("electron");
const path   = require("path");
const Store  = require("electron-store");
const chokidar = require("chokidar");
const fs     = require("fs");
const http   = require("http");
const ServidorLocal = require("./local-server");
const ytBusca = require("./yt-busca");
const { versoesLocais } = require("./versoes");
const { escolherPorNome } = require("./casamento");
const { pastaDeDownload } = require("./pastas");
const { escolherIdentidade, criarBuscaItunes, semCanal } = require("./identificacao");
const { escolherArquivoBaixado, idDaUrl } = require("./baixado");
const { motivoFalha } = require("./yt-falha");
const { autoUpdater } = require("electron-updater");

// mp4 1080p por padrao: qualidade de projecao sem pegar 4K, que incha o arquivo
// sem ganho numa TV de bar. H.264/AAC, que toca em qualquer lugar. O KJ troca
// em Ajustes.
const QUALIDADE_PADRAO = "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]";

const store = new Store();
const SESSAO_ID = "sessao_default";

const ICONE_APP  = path.join(__dirname, "assets", "icons", "icon.png");

let hostWindow      = null;
let playerWindow    = null;
let audienceWindow  = null;
let musicWatcher    = null;
let catalogoLocal   = [];
let servidorCatalogo= null;
let servidorLocal   = null;

// ── Catálogo local ─────────────────────────────────────────

// Retorna lista de fullPaths de arquivos com extensão em `exts`, recursivamente
// Em disco exFAT (comum em HD externo) o macOS nao consegue gravar atributos
// estendidos no proprio arquivo e cria um sidecar AppleDouble "._Nome.mp4" ao
// lado. Ele tem a mesma extensao e uns poucos KB. Sem descartar isso, o codigo
// que procura "o arquivo mais recente" pegava o sidecar, renomeava ELE, e o
// video real ficava com o nome original — a origem dos arquivos extras.
function ehSidecarMac(nome) {
  return nome.startsWith("._") || nome === ".DS_Store";
}

// Intermediarios do yt-dlp: ao baixar video e audio separados ele grava
// "Nome.f399.mp4" e "Nome.f140.m4a" antes de juntar. Se o merge nao completa,
// eles ficam na pasta — e o codigo que procura o "arquivo mais recente" tratava
// o fragmento de audio como se fosse a musica.
function ehFragmentoYt(nome) {
  return /\.f\d{2,4}\.[a-z0-9]+$/i.test(nome) || nome.endsWith(".part");
}

function ehArquivoUtil(nome) {
  return !ehSidecarMac(nome) && !ehFragmentoYt(nome);
}

function listarArquivosRecursivo(dir, exts) {
  const resultado = [];
  try {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        resultado.push(...listarArquivosRecursivo(fullPath, exts));
      } else if (entrada.isFile() && ehArquivoUtil(entrada.name)
                 && exts.includes(path.extname(entrada.name).toLowerCase())) {
        resultado.push(fullPath);
      }
    }
  } catch(e) {
    console.warn(`[FS] Erro ao ler ${dir}:`, e.message);
  }
  return resultado;
}

// Ruido comum em titulo do YouTube. Sem tirar isso, a musica aparece na lista
// com "[OFFICIAL VIDEO] [4K UPGRADE]" grudado no nome.
const RE_RUIDO = /\s*[\[(](?:official\s*(?:music\s*)?video|video\s*oficial|official\s*audio|lyrics?|letra|legendado|hd|hq|4k|8k|fhd|1080p|720p|remaster(?:ed)?(?:\s*\d{4})?|\d{1,2}k\s*upgrade)[^\])]*[\])]/gi;

// O separador nem sempre e " - ": o yt-dlp troca ":" por "：" ao sanitizar o
// nome, e muitos titulos usam traco longo. Sem cobrir esses casos, o catalogo
// mostrava "Desconhecido" para arquivos que tinham artista no nome.
function separarArtistaMusica(base) {
  const limpo = base.replace(RE_RUIDO, "").replace(/\s+/g, " ").trim();

  // "Artista： Musica" — dois-pontos sanitizado pelo yt-dlp.
  const doisPontos = limpo.split(/\s*[：:]\s+/);
  if (doisPontos.length >= 2 && doisPontos[0].trim()) {
    return { artista: doisPontos[0].trim(), musica: doisPontos.slice(1).join(": ").trim() };
  }

  // So o hifen: e o separador que o proprio app escreve ao renomear. Traco
  // longo foi testado e descartado — titulos como "Musica – Artista" invertem
  // os campos, e artista errado e pior que artista ausente.
  const partes = limpo.split(/\s+-\s+/);
  if (partes.length >= 2 && partes[0].trim()) {
    return { artista: partes[0].trim(), musica: partes.slice(1).join(" - ").trim() };
  }

  return { artista: "Desconhecido", musica: limpo || base };
}

function construirCatalogo(folder) {
  if (!folder || !fs.existsSync(folder)) return [];
  const exts = [".mp4", ".mkv", ".avi", ".webm", ".mp3"];
  return listarArquivosRecursivo(folder, exts).map(fullPath => {
    const base   = path.basename(fullPath, path.extname(fullPath)).replace(RE_ID_SUFIXO, "").trim();
    const { artista, musica } = separarArtistaMusica(base);
    return {
      artista,
      musica,
      arquivo:   path.relative(folder, fullPath),
      disponivel: true
    };
  });
}

// ── Fotos de artistas ──────────────────────────────────────

function pastaArtistas(folder) {
  return path.join(folder, "artistas");
}

function fotoArtistaPath(folder, nome) {
  const nomeSafe = nome.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "_";
  return path.join(pastaArtistas(folder), nomeSafe, "photo.jpg");
}

let _fotoQueue        = [];
let _fotoQueueRunning = false;

async function processarFilaFotos(folder) {
  if (_fotoQueueRunning) return;
  _fotoQueueRunning = true;
  while (_fotoQueue.length) {
    const nome = _fotoQueue.shift();
    await baixarFotoArtista(nome, folder);
    await new Promise(r => setTimeout(r, 400));
  }
  _fotoQueueRunning = false;
  console.log("[ARTISTA] Download de fotos concluído.");
}

async function baixarFotoArtista(nome, folder) {
  const dest = fotoArtistaPath(folder, nome);
  if (fs.existsSync(dest)) return;
  try {
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(nome)}&entity=musicArtist&limit=3`;
    const searchResp = await net.fetch(searchUrl);
    if (!searchResp.ok) return;
    const data = await searchResp.json();
    const results = data.results || [];
    const match = results.find(r => r.artistName?.toLowerCase() === nome.toLowerCase()) || results[0];
    if (!match?.artworkUrl100) return;

    const imgUrl = match.artworkUrl100.replace("100x100bb", "600x600bb");
    const imgResp = await net.fetch(imgUrl);
    if (!imgResp.ok) return;

    const buf = Buffer.from(await imgResp.arrayBuffer());
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    console.log(`[ARTISTA] ✓ ${nome}`);
  } catch(e) {
    console.warn(`[ARTISTA] Erro ${nome}:`, e.message);
  }
}

function agendarDownloadFotos(folder) {
  if (!folder || !fs.existsSync(folder)) return;
  const artistas = [...new Set(catalogoLocal.map(s => s.artista).filter(Boolean))];
  _fotoQueue = artistas.filter(nome => !fs.existsSync(fotoArtistaPath(folder, nome)));
  if (_fotoQueue.length) {
    console.log(`[ARTISTA] ${_fotoQueue.length} fotos para baixar`);
    processarFilaFotos(folder);
  }
}

// ── Servidor HTTP ──────────────────────────────────────────

// Reserva do iTunes: o Deezer nao pode ser chamado do navegador (nao envia
// CORS), mas daqui do host nao ha essa restricao. Usado quando o iTunes nao
// encontra a musica pedida.
async function sugerirNoDeezer(termo) {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(termo)}&limit=8`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const d = await resp.json();
  return (d.data || []).map(t => ({
    artista: t.artist && t.artist.name, musica: t.title, fonte: "deezer",
  })).filter(x => x.artista && x.musica);
}

// ── Locucao com Piper ─────────────────────────────────────
// A voz do navegador (speechSynthesis) soa robotica: as vozes compactas do
// sistema nao foram feitas para locucao. O Piper roda um modelo neural local —
// sem nuvem, sem chave — e as vozes pt-BR do projeto rhasspy sao bem melhores.
// Se o Piper nao estiver instalado, o player cai de volta no speechSynthesis.
const PIPER_DIR   = path.join(app.getPath("userData"), "piper");
const PIPER_BIN   = path.join(PIPER_DIR, "venv", "bin", "piper");
const PIPER_VOZES = path.join(PIPER_DIR, "vozes");

function piperDisponivel() {
  try { fs.accessSync(PIPER_BIN, fs.constants.X_OK); return true; } catch { return false; }
}

function vozesPiper() {
  try {
    return fs.readdirSync(PIPER_VOZES)
      .filter(f => f.endsWith(".onnx"))
      .map(f => ({ arquivo: f, nome: f.replace(/^pt_BR-/, "").replace(/-medium\.onnx$|-low\.onnx$/, "") }));
  } catch { return []; }
}

// Prosodia: os valores padrao do Piper soam chapados para chamar alguem num
// salao. Um pouco mais lento e com mais variacao de ritmo fica de locutor.
const PIPER_PROSODIA = ["--length_scale", "1.08", "--noise_scale", "0.85", "--noise_w", "0.9"];

function sintetizarFala(texto, arquivoVoz) {
  return new Promise((resolve) => {
    if (!piperDisponivel()) return resolve(null);
    const vozes = vozesPiper();
    if (!vozes.length) return resolve(null);

    const escolhida = vozes.find(v => v.arquivo === arquivoVoz || v.nome === arquivoVoz) || vozes[0];
    const modelo = path.join(PIPER_VOZES, escolhida.arquivo);
    const saida  = path.join(app.getPath("temp"), `voxly-fala-${Date.now()}.wav`);

    const proc = spawn(PIPER_BIN, ["--model", modelo, "--output_file", saida, ...PIPER_PROSODIA]);
    proc.on("error", () => resolve(null));
    proc.on("close", (code) => resolve(code === 0 && fs.existsSync(saida) ? saida : null));
    proc.stdin.write(texto);
    proc.stdin.end();
  });
}

// Instalacao sob demanda: o Piper pesa ~60 MB por voz, mais um ambiente
// Python. Nada disso vem junto do app — o KJ marca em Ajustes e o Voxly baixa,
// instala e configura sozinho.
const PIPER_VOZ_URL = (v) =>
  `https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/${v}/medium/pt_BR-${v}-medium.onnx`;

function rodar(cmd, args, opcoes = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, opcoes);
    let saida = "";
    proc.stdout?.on("data", d => saida += d);
    proc.stderr?.on("data", d => saida += d);
    proc.on("error", e => resolve({ ok: false, saida: e.message }));
    proc.on("close", c => resolve({ ok: c === 0, saida }));
  });
}

async function baixarArquivo(url, destino) {
  const r = await rodar("/usr/bin/curl", ["-sL", "--max-time", "600", "-o", destino, url]);
  return r.ok && fs.existsSync(destino) && fs.statSync(destino).size > 1024 * 100;
}

ipcMain.handle("piper-instalar", async (evento, voz) => {
  const avisar = (etapa) => evento.sender.send("piper-progresso", etapa);
  const nomeVoz = voz || "cadu";

  try {
    fs.mkdirSync(PIPER_VOZES, { recursive: true });

    if (!piperDisponivel()) {
      // O venv usa o Python do sistema de proposito: o do Homebrew costuma ser
      // novo demais e o onnxruntime ainda nao tem wheel para ele.
      avisar("Criando ambiente Python...");
      const venv = await rodar("/usr/bin/python3", ["-m", "venv", path.join(PIPER_DIR, "venv")]);
      if (!venv.ok) throw new Error("Falha ao criar o ambiente: " + venv.saida.slice(-200));

      avisar("Instalando o Piper (pode demorar)...");
      const pip = path.join(PIPER_DIR, "venv", "bin", "pip");
      const inst = await rodar(pip, ["install", "--quiet", "piper-tts"]);
      if (!inst.ok) throw new Error("Falha ao instalar o Piper: " + inst.saida.slice(-200));
    }

    const modelo = path.join(PIPER_VOZES, `pt_BR-${nomeVoz}-medium.onnx`);
    if (!fs.existsSync(modelo)) {
      avisar(`Baixando a voz ${nomeVoz} (60 MB)...`);
      const okModelo = await baixarArquivo(PIPER_VOZ_URL(nomeVoz), modelo);
      const okJson = await baixarArquivo(PIPER_VOZ_URL(nomeVoz) + ".json", modelo + ".json");
      if (!okModelo || !okJson) throw new Error("Falha ao baixar a voz.");
    }

    avisar("Pronto!");
    return { ok: true, vozes: vozesPiper() };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle("piper-instalado", () => ({
  instalado: piperDisponivel() && vozesPiper().length > 0,
  vozes: piperDisponivel() ? vozesPiper() : [],
}));

ipcMain.handle("piper-vozes", () => (piperDisponivel() ? vozesPiper() : []));
ipcMain.handle("piper-falar", async (_, { texto, voz }) => sintetizarFala(texto, voz));

// Consulta o YouTube e devolve so o que serve para uma fila de karaoke.
async function buscarKaraokeYt(termo, artista) {
  const ytDlp = resolverBinario("yt-dlp");
  if (!ytDlp) throw new Error("yt-dlp nao encontrado no host.");

  // Artista separado da musica: com ele vazio, a pontuacao por artista somava
  // sempre zero e versoes de OUTROS cantores empatavam com a certa.
  const consulta = ytBusca.montarConsulta({ musica: termo, artista: artista || "" });

  const saida = await new Promise((resolve, reject) => {
    const proc = spawn(ytDlp, [
      `ytsearch12:${consulta}`,
      "--dump-json", "--skip-download", "--no-warnings",
      "--socket-timeout", "15",
      "--extractor-args", "youtubetab:skip=authcheck",
    ], { windowsHide: true });

    let out = "", err = "";
    proc.stdout.on("data", d => out += d.toString());
    proc.stderr.on("data", d => err += d.toString());
    proc.on("error", e => reject(new Error(`Falha ao executar o yt-dlp: ${e.message}`)));
    proc.on("close", () => out.trim() ? resolve(out) : reject(new Error(err.trim() || "busca sem resultado")));
  });

  const videos = saida.split("\n").map(l => l.trim()).filter(Boolean)
    .flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });

  const pasta = store.get("musicFolder");
  const jaTemos = idsBaixados(pasta);

  const candidatos = ytBusca
    .ordenarCandidatos(videos, { musica: termo, artista: artista || "" }, { limite: 8 })
    .map(c => ({ ...c, jaBaixado: jaTemos.has(c.id) }));

  // Devolve tambem o que o YouTube trouxe antes do filtro. Sem isso, "nada
  // encontrado" nao distingue busca vazia de busca cheia de resultados que nao
  // eram karaoke — e o KJ fica sem saber se o problema e o termo.
  return { candidatos, brutos: videos.length, consulta };
}

function iniciarServidorCatalogo() {
  if (servidorCatalogo) return;
  servidorCatalogo = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Preflight para Private Network Access (Chrome/Firefox)
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    // Busca de karaoke no YouTube. O app do cantor roda no navegador e nao
    // alcanca o yt-dlp; quem fala com ele e o host, e devolve os candidatos ja
    // filtrados e ordenados. Tambem informa o que ja existe na pasta, para a
    // interface poder dizer "toca na hora" em vez de "vai baixar".
    if (req.url.startsWith("/buscar")) {
      const params = new URL(req.url, "http://local").searchParams;
      const q = params.get("q") || "";
      const artistaParam = params.get("artista") || "";
      if (!q.trim()) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ candidatos: [] }));
        return;
      }
      buscarKaraokeYt(q, artistaParam)
        .then(r => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(r));
        })
        .catch(e => {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ erro: e.message }));
        });
      return;
    }

    if (req.url.startsWith("/sugerir")) {
      const q = new URL(req.url, "http://local").searchParams.get("q") || "";
      sugerirNoDeezer(q)
        .then(itens => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ itens })); })
        .catch(e => { res.statusCode = 500; res.end(JSON.stringify({ erro: e.message })); });
      return;
    }

    if (req.url === "/catalogo") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(catalogoLocal));

    } else if (req.url === "/ping") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, total: catalogoLocal.length }));

    } else if (req.url.startsWith("/artista-foto/")) {
      const folder = store.get("musicFolder", null);
      if (!folder) { res.statusCode = 404; res.end(""); return; }
      const nome = decodeURIComponent(req.url.slice("/artista-foto/".length));
      const filePath = fotoArtistaPath(folder, nome);
      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "max-age=86400");
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.statusCode = 404; res.end("");
      }

    } else {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end("{}");
    }
  });
  let tentativasCat = 0;
  servidorCatalogo.on("error", (e) => {
    if (e.code === "EADDRINUSE" && tentativasCat < 6) {
      tentativasCat++;
      console.warn(`[CATALOGO] Porta 7432 ocupada — tentativa ${tentativasCat}/6 em 1s`);
      setTimeout(() => servidorCatalogo.listen(7432, "0.0.0.0"), 1000);
      return;
    }
    if (e.code === "EADDRINUSE") {
      console.error("[CATALOGO] Porta 7432 segue ocupada — busca e catalogo indisponiveis.");
    } else {
      console.error("[CATALOGO] Erro no servidor:", e.message);
    }
    servidorCatalogo = null;
  });

  servidorCatalogo.listen(7432, "0.0.0.0", () => {
    console.log(`[CATALOGO] Servidor HTTP: 0.0.0.0:7432 — ${catalogoLocal.length} músicas`);
  });
}

// ── Janelas ────────────────────────────────────────────────
function escolherDisplayOcupado() {
  // Displays escolhidos automaticamente, para a tela do publico evitar
  // o monitor primario (KJ) e o do palco quando houver mais monitores.
  const displays = screen.getAllDisplays();
  const primario = displays.find(d => d.bounds.x === 0 && d.bounds.y === 0) || displays[0];

  // Calcula qual display o palco usaria (mesma logica do player)
  const ext = displays.find(d => d.bounds.x !== 0 || d.bounds.y !== 0);
  const displayPalco = ext || primario;

  // Tela do publico: primeiro display que não seja KJ nem palco; senão, o primario.
  const livre = displays.find(d => (d.bounds.x !== 0 || d.bounds.y !== 0)
    && (d.id !== displayPalco.id));
  return livre || primario;
}

// Palco e Publico ocupam o display inteiro — o que so faz sentido quando ha
// monitor externo. Em tela unica as tres janelas disputam o mesmo espaco: com
// 60% da largura cada, Palco e Publico somavam 2150px numa tela de 1792 e se
// cobriam; a Gerencia (1440x900) enterrava as duas. O video tocava sem ninguem
// ver. Em tela unica a tela vira faixas: Gerencia em cima, as outras duas lado
// a lado embaixo.
const FOLGA = 8;
// 0.45 deixava a Gerencia com ~518px uteis: fila espremida e barra de
// botoes colada no conteudo. As secundarias em tela unica sao previa —
// quem precisa de espaco e o console do KJ.
const ALTURA_SECUNDARIA = 0.32;

function geometriaSecundaria(display, canto) {
  const externo = display.bounds.x !== 0 || display.bounds.y !== 0;
  if (externo) {
    const { x, y, width, height } = display.bounds;
    return { x, y, width, height };
  }

  // workArea (e nao bounds) para a janela nao nascer sob a barra de menu / Dock.
  const area = display.workArea;
  const width  = Math.floor((area.width - FOLGA * 3) / 2);
  const height = Math.round(area.height * ALTURA_SECUNDARIA);
  return {
    x: canto === "esquerda" ? area.x + FOLGA : area.x + area.width - width - FOLGA,
    y: area.y + area.height - height,
    width,
    height,
  };
}

function temMonitorExterno() {
  return screen.getAllDisplays().some(d => d.bounds.x !== 0 || d.bounds.y !== 0);
}

// Reposiciona as tres janelas sempre que uma secundaria abre ou fecha. Sem
// isto a Gerencia continua com os 1440x900 do nascimento e volta a cobrir tudo
// no primeiro clique. Nao mexe em janela em tela cheia — ali a escolha e do KJ.
function arrumarJanelasTelaUnica() {
  if (temMonitorExterno()) return;

  const principal = screen.getPrimaryDisplay();
  const area = principal.workArea;
  const viva = j => j && !j.isDestroyed() && !j.isFullScreen();

  if (viva(playerWindow))   playerWindow.setBounds(geometriaSecundaria(principal, "direita"));
  if (viva(audienceWindow)) audienceWindow.setBounds(geometriaSecundaria(principal, "esquerda"));

  if (!viva(hostWindow)) return;
  const temSecundaria = viva(playerWindow) || viva(audienceWindow);
  const altura = temSecundaria
    ? area.height - Math.round(area.height * ALTURA_SECUNDARIA) - FOLGA
    : area.height;
  hostWindow.setBounds({ x: area.x, y: area.y, width: area.width, height: altura });
}

function createHostWindow() {
  hostWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 480,
    title: "Voxly - Gerência",
    icon: ICONE_APP,
    backgroundColor: "#101014",
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  hostWindow.loadFile(path.join(__dirname, "screens", "host.html"));
  hostWindow.on("closed", () => { hostWindow = null; });
}

function createPlayerWindow() {
  const displays = screen.getAllDisplays();
  const extDisplay = displays.find(d => d.bounds.x !== 0 || d.bounds.y !== 0);
  const target = extDisplay || displays[0];
  const geo = geometriaSecundaria(target, "direita");

  playerWindow = new BrowserWindow({
    x: geo.x,
    y: geo.y,
    width:  geo.width,
    height: geo.height,
    title: "Voxly - Palco",
    icon: ICONE_APP,
    fullscreenable: true,
    frame: true,
    backgroundColor: "#07070b",
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  playerWindow.loadFile(path.join(__dirname, "screens", "player.html"));
  playerWindow.webContents.once("did-finish-load", () => {
    console.log("[MAIN] Player carregado e pronto.");
  });
  playerWindow.on("closed", () => { playerWindow = null; arrumarJanelasTelaUnica(); });
  arrumarJanelasTelaUnica();
}

// Tela 3: auditório/público — painel opcional ligado pelo host.
// Mostra cantor atual + música + QR codes (sem repetir o vídeo).
function createAudienceWindow() {
  const geo = geometriaSecundaria(escolherDisplayOcupado(), "esquerda");

  audienceWindow = new BrowserWindow({
    x: geo.x,
    y: geo.y,
    width:  geo.width,
    height: geo.height,
    title: "Voxly - Público",
    icon: ICONE_APP,
    fullscreenable: true,
    frame: true,
    backgroundColor: "#07070b",
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  audienceWindow.loadFile(path.join(__dirname, "screens", "player.html"), {
    search: "tela=publico",
  });
  audienceWindow.once("ready-to-show", () => {
    arrumarJanelasTelaUnica();
    audienceWindow.show();
    audienceWindow.moveTop();
    if (hostWindow) hostWindow.webContents.send("audiencia-estado", true);
  });
  audienceWindow.on("closed", () => {
    audienceWindow = null;
    arrumarJanelasTelaUnica();
    if (hostWindow) hostWindow.webContents.send("audiencia-estado", false);
  });
}

// Duas instancias do Voxly disputam as portas 8030 e 7432 e a segunda morria
// com EADDRINUSE. Em vez disso, a segunda encerra e traz a primeira para frente.
const instanciaUnica = app.requestSingleInstanceLock();
if (!instanciaUnica) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (hostWindow && !hostWindow.isDestroyed()) {
      if (hostWindow.isMinimized()) hostWindow.restore();
      hostWindow.show();
      hostWindow.focus();
    }
  });
}

// O macOS suspende apps em segundo plano (App Nap): o processo fica com 0% de
// CPU, o socket continua aceitando conexao pelo kernel, mas nada e atendido.
// Na pratica, o Voxly minimizado durante o show pararia de servir o app dos
// cantores e o catalogo. Como este app e um servidor enquanto a sessao roda,
// ele nao pode ser suspenso.
let bloqueioSuspensao = null;

app.whenReady().then(() => {
  try {
    bloqueioSuspensao = powerSaveBlocker.start("prevent-app-suspension");
    console.log("[MAIN] Suspensao em segundo plano desativada:", bloqueioSuspensao);
  } catch (e) {
    console.warn("[MAIN] Nao foi possivel impedir a suspensao:", e.message);
  }

  createHostWindow();
  createPlayerWindow();
  const folder = store.get("musicFolder");
  if (folder && fs.existsSync(folder)) {
    catalogoLocal = construirCatalogo(folder);
    startWatcher(folder);
    agendarDownloadFotos(folder);
  }
  iniciarServidorCatalogo();
  servidorLocal = new ServidorLocal({
    caminhoDados: path.join(app.getPath("userData"), "voxly-offline.json"),
  });
  servidorLocal.iniciar();
  configurarAutoUpdate();
});

function abrirHost() {
  if (hostWindow && !hostWindow.isDestroyed()) {
    if (hostWindow.isMinimized()) hostWindow.restore();
    hostWindow.show();
    hostWindow.focus();
  } else {
    createHostWindow();
  }
}

function abrirAudiencia() {
  if (audienceWindow && !audienceWindow.isDestroyed()) {
    audienceWindow.close();
    audienceWindow = null;
  } else {
    createAudienceWindow();
  }
}

// ── Atualização automática (GitHub Releases) ────────────────
function confiarEstadoAtualizacao(estado) {
  if (hostWindow && !hostWindow.isDestroyed()) {
    hostWindow.webContents.send("status-atualizacao", estado);
  }
}

function configurarAutoUpdate() {
  if (!app.isPackaged) return; // sem auto-update em dev

  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[UPDATE] verificando atualizacoes...");
    confiarEstadoAtualizacao({ fase: "checando" });
  });
  autoUpdater.on("update-not-available", () => {
    console.log("[UPDATE] ja esta na versao mais recente");
    confiarEstadoAtualizacao({ fase: "atualizado" });
  });
  autoUpdater.on("update-available", () => {
    console.log("[UPDATE] nova versao disponivel");
    confiarEstadoAtualizacao({ fase: "baixando", percentual: 0 });
  });
  autoUpdater.on("error", (err) => {
    console.warn("[UPDATE] erro:", err.message);
    confiarEstadoAtualizacao({ fase: "erro", erro: err.message });
  });

  autoUpdater.on("download-progress", (p) => {
    const pct = Math.round(p.percent);
    confiarEstadoAtualizacao({ fase: "baixando", percentual: pct });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    console.log(`[UPDATE] pronto (${info.version})`);
    confiarEstadoAtualizacao({ fase: "pronto", versao: info.version });
    const janela = hostWindow || playerWindow || null;
    if (!janela) { autoUpdater.quitAndInstall(); return; }
    const { response } = await dialog.showMessageBox(janela, {
      type: "info",
      title: "Voxly — atualização disponível",
      message: `Nova versão ${info.version} instalada.`,
      detail: "Reinicie agora para aplicar a atualização?",
      buttons: ["Reiniciar agora", "Depois"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdatesAndNotify().catch((e) => console.warn("[UPDATE] falha ao checar:", e.message));
}

// ── IPC: Atualização automática ────────────────────────────
ipcMain.handle("check-for-updates", () => {
  if (!app.isPackaged) return { fase: "dev" };
  try {
    autoUpdater.checkForUpdates();
    return { fase: "checando" };
  } catch (e) {
    return { fase: "erro", erro: e.message };
  }
});

ipcMain.handle("restart-to-update", () => {
  try { autoUpdater.quitAndInstall(); return true; } catch { return false; }
});

ipcMain.handle("app-versao", () => app.getVersion());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── IPC: Pasta de músicas ──────────────────────────────────
ipcMain.handle("select-music-folder", async () => {
  const result = await dialog.showOpenDialog(hostWindow, {
    properties: ["openDirectory"],
    title: "Selecionar pasta de músicas",
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const folder = result.filePaths[0];
    store.set("musicFolder", folder);
    catalogoLocal = construirCatalogo(folder);
    startWatcher(folder);
    agendarDownloadFotos(folder);
    console.log(`[CATALOGO] ${catalogoLocal.length} músicas carregadas de ${folder}`);
    return folder;
  }
  return null;
});

function pastaMusicasPadrao() {
  return path.join(app.getPath("music"), "Voxly");
}

// Devolve sempre um caminho: sem isto, instalacao nova ficava sem pasta e o
// primeiro download estourava num readdirSync ("ENOENT scandir"), erro que nao
// dizia nada sobre a causa.
ipcMain.handle("get-music-folder", () => store.get("musicFolder", null) || pastaMusicasPadrao());
// Preferencias de download, definidas uma vez pelo KJ e usadas em todo pedido.
const PREFS_PADRAO = { qualidade: QUALIDADE_PADRAO, renomear: true, organizar: false, voz: "", chamadaVoz: true };
ipcMain.handle("get-prefs-download", () => ({ ...PREFS_PADRAO, ...(store.get("prefsDownload") || {}) }));
ipcMain.handle("set-prefs-download", (_, p) => {
  store.set("prefsDownload", { ...PREFS_PADRAO, ...(store.get("prefsDownload") || {}), ...p });
  return true;
});

// Caminho local de um video ja baixado, pelo id do YouTube. E assim que o host
// decide entre apontar para o arquivo e disparar o download.
// Todas as versoes da musica ja presentes na pasta. O KJ escolhe qual tocar:
// a mesma faixa costuma existir em canais diferentes, com tom e arranjo
// diferentes, e pegar "a primeira que achar" tirava essa decisao dele.
// Resolve o arquivo de um item da fila na ordem confiavel: versao escolhida
// pelo KJ, depois id do video, e so entao casamento por nome. O nome e o pior
// criterio — basta o arquivo ter sido renomeado de forma um pouco diferente do
// pedido para "nao achar" uma musica que esta ali.
ipcMain.handle("resolver-arquivo-item", (_, item) => {
  const pasta = store.get("musicFolder", null);
  if (!pasta || !fs.existsSync(pasta) || !item) return null;

  // Vinculo manual do KJ vale mais que qualquer palpite: ele apontou o arquivo.
  const links = store.get("musicLinks", {});
  if (item.id && links[item.id] && fs.existsSync(links[item.id])) return links[item.id];

  if (item.arquivoEscolhido) {
    const alvo = path.join(pasta, item.arquivoEscolhido);
    if (fs.existsSync(alvo)) return alvo;
  }
  if (item.videoId) {
    const porId = caminhoLocalDoVideo(pasta, item.videoId);
    if (porId) return porId;
  }
  return null; // quem chama cai no resolveMusicFile por nome
});

// Apaga um arquivo do acervo. Restrito a pasta de musicas de proposito: o
// renderer manda um nome, e nome vindo de fora nunca deve poder alcancar o
// disco inteiro.
ipcMain.handle("apagar-arquivo", (_, nomeArquivo) => {
  const pasta = store.get("musicFolder", null);
  if (!pasta || !nomeArquivo) return { ok: false, erro: "pasta nao configurada" };

  const alvo = path.resolve(pasta, nomeArquivo);
  if (!alvo.startsWith(path.resolve(pasta) + path.sep)) {
    return { ok: false, erro: "caminho fora da pasta de musicas" };
  }
  if (!fs.existsSync(alvo)) return { ok: false, erro: "arquivo nao encontrado" };

  try {
    fs.unlinkSync(alvo);
    // Sidecar do macOS em exFAT, se houver.
    const sidecar = path.join(path.dirname(alvo), "._" + path.basename(alvo));
    if (fs.existsSync(sidecar)) { try { fs.unlinkSync(sidecar); } catch (_) {} }

    const folder = store.get("musicFolder");
    if (folder) catalogoLocal = construirCatalogo(folder);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle("versoes-locais", (_, pedido) => {
  const pasta = store.get("musicFolder", null);
  if (!pasta || !fs.existsSync(pasta)) return [];
  const exts = [".mp4", ".mkv", ".avi", ".webm", ".mp3"];
  const nomes = listarArquivosRecursivo(pasta, exts).map(fp => path.basename(fp));
  return versoesLocais(nomes, pedido).map(v => ({
    ...v,
    caminho: path.join(pasta, v.arquivo),
  }));
});

ipcMain.handle("localizar-video", (_, idVideo) => {
  const pasta = store.get("musicFolder", null);
  return caminhoLocalDoVideo(pasta, idVideo);
});

ipcMain.handle("scan-music-folder", () => {
  const folder = store.get("musicFolder", null);
  if (folder) {
    catalogoLocal = construirCatalogo(folder);
    agendarDownloadFotos(folder);
    console.log(`[CATALOGO] Varredura: ${catalogoLocal.length} músicas`);
    if (hostWindow) hostWindow.webContents.send("music-folder-changed");
  }
  return catalogoLocal.length;
});

ipcMain.handle("select-music-files", async () => {
  const result = await dialog.showOpenDialog(hostWindow, {
    properties: ["openFile", "multiSelections"],
    title: "Selecionar arquivo(s) de música",
    filters: [
      { name: "Mídia", extensions: ["mp4", "mkv", "avi", "webm", "mp3"] }
    ]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return [];
});

// ── IPC: Resolver arquivo ──────────────────────────────────
ipcMain.handle("resolve-music-file", (_, songName, artist) => {
  const folder = store.get("musicFolder", null);
  if (!folder) return null;
  const exts  = [".mp4", ".mkv", ".avi", ".webm"];
  const files = listarArquivosRecursivo(folder, exts);

  // Links manuais primeiro
  const links = store.get("musicLinks", {});
  for (const filePath of Object.values(links)) {
    if (filePath && fs.existsSync(filePath)) {
      const base = path.basename(filePath, path.extname(filePath)).toLowerCase();
      if (base.includes(songName.toLowerCase()) || base.includes(artist.toLowerCase())) {
        return filePath;
      }
    }
  }

  const melhor = escolherPorNome(files, { musica: songName, artista: artist });
  console.log(`[RESOLVE] "${artist} - ${songName}" → ${melhor || "nao encontrado"}`);
  return melhor;
});

// ── IPC: Vincular arquivo manualmente ─────────────────────
ipcMain.handle("link-music-file", async (_, songId) => {
  const result = await dialog.showOpenDialog(hostWindow, {
    properties: ["openFile"],
    title: "Selecionar arquivo da música",
    filters: [{ name: "Vídeos", extensions: ["mp4", "mkv", "avi", "webm"] }],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const links    = store.get("musicLinks", {});
    links[songId]  = filePath;
    store.set("musicLinks", links);
    return filePath;
  }
  return null;
});

ipcMain.handle("sincronizar-publico", (_, { filePath, tempo }) => {
  if (!audienceWindow || audienceWindow.isDestroyed() || !filePath) return false;
  audienceWindow.webContents.send("play-video", filePath, tempo || 0);
  return true;
});

// "sessao-iniciada" (QR, nome da casa, horarios) e enviado uma unica vez. Uma
// tela recarregada perdia tudo e ficava no aviso de espera para sempre. Agora
// ela pede o estado de volta ao nascer, e a Gerencia reenvia.
ipcMain.on("pedir-estado", () => {
  if (hostWindow && !hostWindow.isDestroyed()) hostWindow.webContents.send("pedir-estado");
});

// Acerto de relogio do painel: so o numero, sem tocar no src. Reenviar
// "play-video" para corrigir deriva recarregaria o arquivo e daria engasgo.
ipcMain.on("ajustar-tempo-publico", (_e, tempo) => {
  if (!audienceWindow || audienceWindow.isDestroyed()) return;
  audienceWindow.webContents.send("ajustar-tempo", tempo);
});

ipcMain.handle("player-command", (_, cmd) => {
  if (playerWindow) {
    playerWindow.webContents.send("player-cmd", cmd);
    console.log(`[CMD] → ${String(cmd).slice(0, 80)}`);
  }
  // Tela do público recebe a mesma info (ignora vídeo se não quiser)
  if (audienceWindow) {
    audienceWindow.webContents.send("player-cmd", cmd);
  }
});

ipcMain.handle("song-ended", () => {
  if (hostWindow) hostWindow.webContents.send("song-ended");
  console.log("[MAIN] song-ended enviado ao host");
});

// ── IPC: Reabrir player ────────────────────────────────────
ipcMain.handle("open-player", () => {
  if (!playerWindow || playerWindow.isDestroyed()) {
    createPlayerWindow();
  } else {
    playerWindow.show();
    playerWindow.focus();
  }
});

// ── IPC: Tela do público (opcional) ───────────────────────
ipcMain.handle("toggle-audience", () => {
  if (audienceWindow && !audienceWindow.isDestroyed()) {
    audienceWindow.close();
    audienceWindow = null;
  } else {
    createAudienceWindow();
  }
  return !!audienceWindow;
});

ipcMain.handle("get-audience-state", () => !!(audienceWindow && !audienceWindow.isDestroyed()));

// ── IPC: Resolve caminho completo p/ playlist de intervalo ──
ipcMain.handle("resolve-arquivo", (e, arquivo) => {
  try {
    const folder = store.get("musicFolder");
    if (!folder || !arquivo) return null;
    const fullPath = path.join(folder, arquivo);
    return fs.existsSync(fullPath) ? fullPath : null;
  } catch {
    return null;
  }
});

// ── IPC: Importa música para dentro do app (temas de intervalo) ──
function pastaTemasIntervalo() {
  return path.join(app.getPath("userData"), "intervalo-temas");
}

function copiarSemColisao(origem, pastaDestino) {
  fs.mkdirSync(pastaDestino, { recursive: true });
  const ext  = path.extname(origem);
  const base = path.basename(origem, ext);
  let destino = path.join(pastaDestino, path.basename(origem));
  let n = 2;
  while (fs.existsSync(destino)) {
    destino = path.join(pastaDestino, `${base} (${n})${ext}`);
    n++;
  }
  fs.copyFileSync(origem, destino);
  return destino;
}

ipcMain.handle("importar-musica-tema", (e, arquivo) => {
  try {
    const folder = store.get("musicFolder");
    if (!folder || !arquivo) return null;
    const origem = path.join(folder, arquivo);
    if (!fs.existsSync(origem)) return null;
    const destino = copiarSemColisao(origem, pastaTemasIntervalo());
    console.log("[TEMA] música importada para o app:", path.basename(destino));
    return destino;
  } catch (err) {
    console.warn("[TEMA] falha ao importar:", err.message);
    return null;
  }
});

ipcMain.handle("remover-musica-tema", (e, filePath) => {
  try {
    const pasta = pastaTemasIntervalo();
    const rel   = path.relative(pasta, filePath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return false; // só apaga dentro do app
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
});

// ── IPC: Imagem externa (bypass CORS — net.fetch roda no processo principal) ──
const { net } = require('electron');
ipcMain.handle("fetch-image", async (_, url) => {
  if (!url) return null;
  try {
    const resp = await net.fetch(url);
    if (!resp.ok) return null;
    const buf  = Buffer.from(await resp.arrayBuffer());
    const mime = resp.headers.get('content-type') || 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch(e) {
    return null;
  }
});

// ── IPC: SoundTouch source para AudioWorklet ───────────────
ipcMain.handle("get-soundtouch-src", () => {
  try {
    const p = require.resolve("soundtouchjs/dist/soundtouch.js");
    // Remove export {} para funcionar em contexto não-módulo do AudioWorklet
    return fs.readFileSync(p, "utf8").replace(/^export\s*\{[^}]*\};\s*$/m, "");
  } catch(e) {
    console.error("[MAIN] soundtouchjs não encontrado:", e.message);
    return "";
  }
});

// ── IPC: IP local da máquina ───────────────────────────────
ipcMain.handle("get-local-ip", () => {
  const { networkInterfaces } = require("os");
  const nets = networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
});

// ── IPC: QR Code ───────────────────────────────────────────
ipcMain.handle("get-webapp-url", () => store.get("webAppUrl", "https://voxly-karaoke.web.app"));
ipcMain.handle("set-webapp-url", (_, url) => store.set("webAppUrl", url));
ipcMain.handle("get-local-webapp-url", () => servidorLocal ? servidorLocal.urlWeb() : null);

// ── IPC: YouTube Download ───────────────────────────────────
const { spawn } = require("child_process");
const os = require("os");

// Apps abertos pelo Finder/Launchpad nao herdam o PATH do shell: o launchd
// entrega so /usr/bin:/bin:/usr/sbin:/sbin, sem /usr/local/bin (Homebrew Intel)
// nem /opt/homebrew/bin (Apple Silicon). Chamar spawn("yt-dlp") direto so
// funcionava com o app iniciado de um terminal; no .app instalado dava
// "spawn yt-dlp ENOENT" e derrubava o processo.
const PASTAS_BIN = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  path.join(os.homedir(), ".local", "bin"),
  "/usr/bin",
  "/bin",
];

function resolverBinario(nome) {
  const salvo = store.get(`bin.${nome}`);
  if (salvo && fs.existsSync(salvo)) return salvo;
  for (const dir of PASTAS_BIN) {
    const alvo = path.join(dir, nome);
    try {
      fs.accessSync(alvo, fs.constants.X_OK);
      return alvo;
    } catch { /* segue procurando */ }
  }
  return null; // nao encontrado: quem chama decide o que dizer ao KJ
}

const YT_ARCHIVE_FILE = path.join(app.getPath("userData"), "yt-archive.txt");
const YT_DB_FILE = path.join(app.getPath("userData"), "yt-db.json");

function ytDbLoad() {
  try { return JSON.parse(fs.readFileSync(YT_DB_FILE, "utf8")); } catch { return { videos: {} }; }
}
function ytDbSave(db) { fs.writeFileSync(YT_DB_FILE, JSON.stringify(db, null, 2)); }
function ytArchiveLoad() {
  try { return new Set(fs.readFileSync(YT_ARCHIVE_FILE, "utf8").trim().split("\n").filter(Boolean)); } catch { return new Set(); }
}
function ytArchiveSave(ids) { fs.writeFileSync(YT_ARCHIVE_FILE, Array.from(ids).join("\n") + "\n"); }

// O id no nome do arquivo e a identidade da faixa. Era um MD5 de
// artista+musica, que nao aponta para lugar nenhum e ainda COLIDE: dois
// karaokes da mesma musica, de canais diferentes, geravam o mesmo id. Agora
// guardamos o id do video do YouTube, que volta ao link original
// (https://www.youtube.com/watch?v=<id>) e serve para saber se ja baixamos.
// O padrao aceita os dois formatos para nao quebrar o acervo ja existente.
const RE_ID_ARQUIVO = /\[(?:[0-9a-f]{6}|[A-Za-z0-9_-]{11})\]/;
const RE_ID_SUFIXO  = /\s*-?\s*\[(?:[0-9a-f]{6}|[A-Za-z0-9_-]{11})\]\s*$/i;
const RE_ID_VIDEO   = /\[([A-Za-z0-9_-]{11})\]/;

function gerarIdYt(nome) {
  const crypto = require("crypto");
  return crypto.createHash("md5").update(nome).digest("hex").slice(0, 6);
}

// Conjunto de ids de video ja presentes na pasta de musicas. E assim que o
// Voxly sabe que nao precisa baixar de novo.
function idsBaixados(folder) {
  const set = new Set();
  if (!folder || !fs.existsSync(folder)) return set;
  const exts = [".mp4", ".mkv", ".avi", ".webm", ".mp3"];
  for (const fp of listarArquivosRecursivo(folder, exts)) {
    const m = path.basename(fp).match(RE_ID_VIDEO);
    if (m) set.add(m[1]);
  }
  return set;
}

// Caminho local de um video ja baixado, ou null.
function caminhoLocalDoVideo(folder, idVideo) {
  if (!folder || !idVideo || !fs.existsSync(folder)) return null;
  const exts = [".mp4", ".mkv", ".avi", ".webm", ".mp3"];
  for (const fp of listarArquivosRecursivo(folder, exts)) {
    if (path.basename(fp).includes(`[${idVideo}]`)) return fp;
  }
  return null;
}

function limparNomeYt(s) {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/['‘’‚‛`´]/g, "").replace(/[“”„‟]/g, "").trim().replace(/\.+$/, "");
}

function normalizarCaseYt(s) {
  if (!s) return s;
  const excecoes = new Set(['de','do','da','dos','das','e','a','o','os','as','em','no','na','nos','nas','por','para','com','sem','the','an','of','in','on','at','by','for','and','or']);
  return s.split(" ").map((p, i) => {
    if (/^[A-Z]{2,5}$/.test(p) || /^([A-Z]\.){2,}$/.test(p) || /^[A-Z]{1,3}[\/\\-][A-Z]{1,3}$/.test(p)) return p;
    if (i > 0 && excecoes.has(p.toLowerCase())) return p.toLowerCase();
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }).join(" ");
}

let ytCancelado = false;
let ytProcessoAtivo = null;

function enviarProgresso(info) {
  if (hostWindow && !hostWindow.isDestroyed()) {
    hostWindow.webContents.send("yt-progress", info);
  }
}

function extrairCanalDoTitulo(titulo, uploader, channel) {
  // Prioridade: uploader > channel > extrair do título (entre colchetes no final)
  if (uploader) return uploader;
  if (channel) return channel;
  const m = titulo.match(/\[([^\]{]{2,40})\]\s*$/);
  if (m) return m[1].trim();
  return "Desconhecido";
}

// Identificacao confiavel, sem depender de LLM: usa artist/track que o proprio
// YouTube preenche em faixas de musica.
//
// Deliberadamente NAO deduz do titulo. Foi testado e sai errado justamente no
// caso de uso: "Evidencias - Chitaozinho e Xororo (Karaoke Version)" daria
// artista "Evidencias", e "Karaoke - Evidencias - ..." daria artista
// "Karaoke". Nao ha como distinguir "Artista - Musica" de "Musica - Artista"
// pelo texto, e gravar nome errado no disco e pior que manter o titulo cru.
function identificarPorMetadados(meta) {
  if (meta && meta.artist && meta.track) {
    return { artista: String(meta.artist).trim(), musica: String(meta.track).trim() };
  }
  return null;
}

// Prazo da edicao manual. Passado ele o arquivo fica com o nome do YouTube —
// feio, mas achavel; um download pendurado nao e nem uma coisa nem outra.
const MINUTOS_EDICAO_MANUAL = 3;

// Substituiu o Ollama. Rodar um modelo local so para extrair "artista" e
// "musica" de um titulo consome CPU e RAM da mesma maquina que esta tocando o
// show — e ainda dependia de o modelo certo estar baixado, que foi como isso
// virou "erro de IA" no Linux. O iTunes ja e a fonte oficial dos nomes no app.
const buscaItunes = criarBuscaItunes({});

async function baixarUrl(opts) {
  const { urls, cookies, navegador, playlist } = opts;
  const pasta = pastaDeDownload({
    pedida: opts.pasta,
    configurada: store.get("musicFolder", null),
    padrao: pastaMusicasPadrao(),
    existe: p => fs.existsSync(p),
  });
  // O yt-dlp cria a pasta do -o, mas o resto do fluxo (procurar o arquivo
  // baixado, listar versoes) le o diretorio direto e quebra se ele nao existe.
  try { fs.mkdirSync(pasta, { recursive: true }); }
  catch (e) { throw new Error(`Não consegui usar a pasta "${pasta}": ${e.message}`); }
  const prefs = { ...PREFS_PADRAO, ...(store.get("prefsDownload") || {}) };
  const qualidade = opts.qualidade || prefs.qualidade;
  const renomear  = opts.renomear  !== undefined ? opts.renomear  : prefs.renomear;
  const organizar = opts.organizar !== undefined ? opts.organizar : prefs.organizar;

  const ytDlp = resolverBinario("yt-dlp");
  if (!ytDlp) {
    throw new Error(
      "yt-dlp nao encontrado. Instale com \"brew install yt-dlp ffmpeg\" " +
      "ou aponte o caminho em Configuracoes."
    );
  }

  ytCancelado = false;
  const archive = ytArchiveLoad();
  const db = ytDbLoad();
  let totalBaixados = 0;
  let erroFinal = null;   // motivo real da ultima recusa, para chegar ao KJ

  // --no-playlist isola o video quando a URL e "watch?v=X&list=Y", mas nao tem
  // o que isolar numa URL que ja E uma playlist ou um canal: ali ele baixa tudo
  // (medido: 183 videos numa playlist comum). Sem este aviso, colar um link
  // desses enche a pasta sem o KJ entender de onde veio.
  if (!playlist) {
    const coletiva = urls.find(u => /[?&]list=/.test(u) && /\/playlist\b/.test(u)
      || /youtube\.com\/(channel\/|user\/|@)/.test(u)
      || /[?&]list=/.test(u) && !/[?&]v=/.test(u));
    if (coletiva) {
      throw new Error(
        "Esse link e de uma playlist ou canal, nao de uma musica: baixaria varios " +
        "videos de uma vez. Cole o link de um video, ou marque \"Baixar playlist " +
        "inteira\" se e isso mesmo que voce quer."
      );
    }
  }

  for (let i = 0; i < urls.length && !ytCancelado; i++) {
    const url = urls[i];
    enviarProgresso({ status: `[${i+1}/${urls.length}] Processando: ${url}`, progress: Math.round(i/urls.length*100), log: `Iniciando: ${url}`, logTipo: 'canal' });

    const args = [
      "-f", qualidade,
      "-o", path.join(pasta, "%(title)s [%(id)s].%(ext)s"),
      // Sem --download-archive: ele guardava ids ja baixados e fazia o yt-dlp
      // PULAR o download reportando sucesso. Trocando a pasta de destino (ou
      // apagando um arquivo), o id continuava no registro e a musica nunca mais
      // baixava — "baixou" e pasta vazia. Agora quem responde "ja tenho isto?"
      // e caminhoLocalDoVideo(), que olha a pasta real.
      "--no-overwrites",
      "--ignore-errors",
      "--sleep-interval", "2",
      "--max-sleep-interval", "5",
      "--extractor-args", "youtubetab:skip=authcheck",
      // Karaoke precisa tocar no QuickTime e no Finder, nao so no Chromium do
      // player. Sem fixar o contêiner, o merge de bestvideo+bestaudio pode sair
      // em mkv/webm mesmo quando as faixas escolhidas sao mp4.
      "--merge-output-format", "mp4",
    ];

    // Link copiado de dentro de uma Mix vem com "&list=" grudado, e o yt-dlp
    // trata isso como "baixe a lista inteira" — uma Mix do YouTube chega a
    // passar de mil videos. Baixa so o video pedido, a menos que o KJ marque
    // explicitamente que quer a playlist.
    args.push(playlist ? "--yes-playlist" : "--no-playlist");

    if (cookies && navegador) {
      args.push("--cookies-from-browser", navegador);
    }

    // As opcoes de video usam bestvideo+bestaudio, que o yt-dlp so consegue
    // juntar com ffmpeg — e ele tambem nao acha o binario pelo PATH aqui.
    const ffmpeg = resolverBinario("ffmpeg");
    if (ffmpeg) args.push("--ffmpeg-location", path.dirname(ffmpeg));

    // yt-dlp com progress hooks
    const child = spawn(ytDlp, [...args, url], { windowsHide: true });
    ytProcessoAtivo = child;
    let erroSpawn = null;
    child.on("error", (e) => { erroSpawn = e; });

    let arquivoBaixado = null;
    let infoVideo = {};
    const idDestaUrl = idDaUrl(url);
    const inicioDownload = Date.now();

    child.stdout.on("data", (data) => {
      const txt = data.toString();
      // Detecta arquivo baixado
      const m = txt.match(/\[download\] Destination: (.+)/);
      if (m) arquivoBaixado = m[1].trim();
      // Progresso
      const p = txt.match(/\[download\]\s+(\d+\.?\d*)%/);
      if (p) {
        enviarProgresso({ progress: Math.round(i/urls.length*100 + parseFloat(p[1])/urls.length), status: `Baixando ${p[1]}%` });
      }
      // Canal
      const c = txt.match(/\[info\]\s+(.+?)\s+-\s+(.+)/);
      if (c && !infoVideo.canal) {
        infoVideo.canal = c[1].trim();
      }
    });

    let saidaErro = "";
    child.stderr.on("data", (data) => {
      const txt = data.toString();
      // Guarda tudo: era aqui que vinha o motivo real da recusa do YouTube, e
      // o codigo antigo procurava uma unica string e jogava o resto fora.
      saidaErro += txt;
      if (txt.includes("already been downloaded") || txt.includes("already been recorded")) {
        enviarProgresso({ log: `⏭ Já baixado (archive): ${url}`, logTipo: 'info' });
      }
    });

    const codigoSaida = await new Promise((resolve) => {
      child.on("close", (code) => {
        ytProcessoAtivo = null;
        resolve(code);
      });
      child.on("error", () => {
        ytProcessoAtivo = null;
        resolve(-1);
      });
    });

    if (erroSpawn) throw new Error(`Falha ao executar o yt-dlp: ${erroSpawn.message}`);

    if (ytCancelado) break;

    // O codigo de saida era resolvido e nunca lido. Uma recusa do YouTube
    // passava em silencio e virava "nada foi baixado", sem motivo e sem saida.
    const falha = motivoFalha(codigoSaida, saidaErro);
    if (falha) {
      enviarProgresso({ status: "Download recusado", log: `❌ ${falha}`, logTipo: 'erro' });
      erroFinal = falha;
      continue;
    }

    // Encontra o arquivo baixado (o yt-dlp pode ter mudado o nome)
    if (!arquivoBaixado || !fs.existsSync(arquivoBaixado)) {
      const candidatos = (fs.existsSync(pasta) ? fs.readdirSync(pasta) : [])
        .filter(f => ehArquivoUtil(f)
          && [".mp4", ".mkv", ".webm", ".mp3", ".m4a"].includes(path.extname(f).toLowerCase()))
        .map(f => {
          try {
            const st = fs.statSync(path.join(pasta, f));
            return st.isFile() ? { nome: f, mtimeMs: st.mtimeMs } : null;
          } catch { return null; }
        })
        .filter(Boolean);

      const escolhido = escolherArquivoBaixado(candidatos, {
        inicioMs: inicioDownload,
        idVideo: idDestaUrl,
      });
      if (escolhido) arquivoBaixado = path.join(pasta, escolhido);
    }

    if (!arquivoBaixado || !fs.existsSync(arquivoBaixado)) {
      // Antes, aqui, o codigo pegava "o arquivo mais recente da pasta" — que
      // podia ser o download de OUTRO pedido. Ele era renomeado para o artista
      // deste, entrava no banco no lugar errado e o original sumia. Falhar e o
      // comportamento certo: o KJ tenta outra versao.
      enviarProgresso({
        log: `⚠️ O download não produziu arquivo nenhum para esta música`,
        logTipo: 'erro',
      });
      continue;
    }

    enviarProgresso({ log: `⬇ Baixado: ${path.basename(arquivoBaixado)}`, logTipo: 'ok' });
    totalBaixados++;

    // Extrai metadados do yt-dlp (rodar novamente só para info)
    let meta = {};
    try {
      const metaChild = spawn(ytDlp, ["--skip-download", "--print-json", url], { windowsHide: true });
      let metaOut = "";
      metaChild.stdout.on("data", d => metaOut += d.toString());
      await new Promise(r => { metaChild.on("close", r); metaChild.on("error", r); });
      meta = JSON.parse(metaOut.trim().split("\n")[0]);
      infoVideo.titulo = meta.title || "";
      infoVideo.uploader = meta.uploader || "";
      infoVideo.channel = meta.channel || "";
      infoVideo.id = meta.id || "";
    } catch (e) {
      console.log("[YT] Falha ao extrair meta:", e.message);
    }

    const canal = extrairCanalDoTitulo(infoVideo.titulo || "", infoVideo.uploader, infoVideo.channel);
    const idVideo = infoVideo.id || gerarIdYt(path.basename(arquivoBaixado));

    // Salva no DB
    db.videos[idVideo] = {
      titulo: infoVideo.titulo || path.basename(arquivoBaixado),
      url,
      canal,
      artista: "",
      musica: "",
      arquivo: path.basename(arquivoBaixado),
      data: new Date().toISOString()
    };
    ytDbSave(db);

    // Renomear com IA se solicitado
    if (renomear && !ytCancelado) {
      enviarProgresso({ status: "Identificando com IA...", log: "🤖 Identificando artista/música...", logTipo: 'info' });

      const nomeLimpo = path.basename(arquivoBaixado, path.extname(arquivoBaixado))
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\([^)]{0,30}\)/g, " ")
        .replace(/\b(karaoke|playback|instrumental|backing\s*track|vers[aã]o|version|oficial|official|lyrics|legendado|hd|4k|hq|fhd|1080p|720p|full)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

      // O pedido manda: o cantor escolheu pelo iTunes e esses nomes ja vem com
      // a grafia oficial. Perguntar a um LLM o que o proprio app ja sabe era
      // trocar certeza por palpite — e, sem Ollama respondendo, travava o
      // download inteiro numa edicao manual.
      let identificado = escolherIdentidade({
        pedido:    { artista: opts.artista, musica: opts.musica },
        metadados: identificarPorMetadados(meta),
      });

      if (!identificado) {
        enviarProgresso({ log: "🔎 Consultando o iTunes pelo título...", logTipo: 'info' });
        identificado = escolherIdentidade({ itunes: await buscaItunes(semCanal(nomeLimpo, canal)) });
      }

      if (identificado) {
        const de = { pedido: "pelo pedido", metadados: "pelos metadados", itunes: "pelo iTunes" }[identificado.origem];
        enviarProgresso({ log: `🎯 ${identificado.artista} — ${identificado.musica} (${de})`, logTipo: 'ok' });
      } else {
        enviarProgresso({
          status: "Não consegui identificar — edição manual",
          log: "⚠️ Nem o pedido, nem os metadados, nem o iTunes deram artista e música",
          logTipo: 'erro'
        });

        if (hostWindow && !hostWindow.isDestroyed()) {
          hostWindow.webContents.send("yt-edit-request", {
            arquivoOriginal: arquivoBaixado,
            nomeArquivo: path.basename(arquivoBaixado),
            sugestaoArtista: opts.artista || "",
            sugestaoMusica: opts.musica || "",
            canal,
            idVideo
          });
        }

        // Espera a edicao, mas com prazo. Sem isto o download ficava pendurado
        // para sempre; eles se acumulavam e o modal que aparecia era o de um
        // pedido antigo, com o nome de outra musica.
        await new Promise((resolve) => {
          const prazo = setTimeout(() => {
            ipcMain.removeListener("yt-confirm-edit", handler);
            enviarProgresso({
              log: "⏱️ Sem resposta na edição — o arquivo fica com o nome do YouTube",
              logTipo: 'erro',
            });
            resolve();
          }, MINUTOS_EDICAO_MANUAL * 60000);

          function handler(_e, resposta) {
            if (!resposta || resposta.idVideo !== idVideo) return;
            clearTimeout(prazo);
            ipcMain.removeListener("yt-confirm-edit", handler);
            identificado = { artista: resposta.artista, musica: resposta.musica };
            resolve();
          }
          ipcMain.on("yt-confirm-edit", handler);
        });

        if (ytCancelado) break;
      }

      if (identificado && identificado.artista && identificado.musica) {
        const artista = limparNomeYt(normalizarCaseYt(identificado.artista));
        const musica = limparNomeYt(normalizarCaseYt(identificado.musica));
        const ext = path.extname(arquivoBaixado);
        // idVideo vem do yt-dlp; o hash so entra se o video nao tiver id.
        const idHex = idVideo || gerarIdYt(artista + musica);
        // Novo formato: Artista - Música - Canal [id]
        const novoNome = `${artista} - ${musica} - ${limparNomeYt(canal)} [${idHex}]${ext}`;

        let pastaDest = pasta;
        if (organizar) {
          pastaDest = path.join(pasta, artista);
          fs.mkdirSync(pastaDest, { recursive: true });
        }

        const novoPath = path.join(pastaDest, novoNome);
        if (arquivoBaixado !== novoPath) {
          fs.renameSync(arquivoBaixado, novoPath);
          arquivoBaixado = novoPath;
        }

        db.videos[idVideo].artista = artista;
        db.videos[idVideo].musica = musica;
        db.videos[idVideo].arquivo = path.basename(arquivoBaixado);
        ytDbSave(db);

        enviarProgresso({ log: `✏️ Renomeado: ${path.basename(arquivoBaixado)}`, logTipo: 'ok' });
      }
    }

    // Mesmo sem conseguir identificar artista e musica, o [id] tem que estar no
    // nome: e ele que responde "ja baixei isto?". Sem isso, uma identificacao
    // falha condenava a musica a ser baixada de novo toda vez.
    if (idVideo && arquivoBaixado && !RE_ID_VIDEO.test(path.basename(arquivoBaixado))) {
      const ext = path.extname(arquivoBaixado);
      const base = path.basename(arquivoBaixado, ext);
      const comId = path.join(path.dirname(arquivoBaixado), `${base} [${idVideo}]${ext}`);
      try {
        fs.renameSync(arquivoBaixado, comId);
        arquivoBaixado = comId;
        enviarProgresso({ log: `🔖 Id do video anexado: ${path.basename(comId)}`, logTipo: 'info' });
      } catch (e) {
        console.warn("[YT] nao consegui anexar o id:", e.message);
      }
    }

    // Adiciona ao archive
    archive.add(idVideo);
    ytArchiveSave(archive);
  }

  // "sucesso" com zero arquivos e mentira util para ninguem: quem chama precisa
  // saber que a pasta continua sem a musica.
  return {
    sucesso: !ytCancelado && totalBaixados > 0,
    totalBaixados,
    cancelado: ytCancelado,
    // "Nada foi baixado" nao ajuda ninguem no meio do show: quando o yt-dlp
    // explicou o motivo, e o motivo que sobe.
    erro: erroFinal || ((!ytCancelado && totalBaixados === 0) ? "Nada foi baixado." : undefined),
  };
}

ipcMain.handle("yt-download", async (_, opts) => {
  ytCancelado = false;
  try {
    const resultado = await baixarUrl(opts);
    if (hostWindow && !hostWindow.isDestroyed()) {
      hostWindow.webContents.send("yt-done", resultado);
    }
    return resultado;
  } catch (e) {
    console.error("[YT] Erro:", e);
    if (hostWindow && !hostWindow.isDestroyed()) {
      hostWindow.webContents.send("yt-done", { sucesso: false, erro: e.message });
    }
    return { sucesso: false, erro: e.message };
  }
});

// ── IPC: procura candidatos de karaoke no YouTube ──────────
ipcMain.handle("yt-cancel", () => {
  ytCancelado = true;
  if (ytProcessoAtivo) {
    ytProcessoAtivo.kill();
    ytProcessoAtivo = null;
  }
  return true;
});

// ── Watcher ────────────────────────────────────────────────
function startWatcher(folder) {
  if (musicWatcher) musicWatcher.close();
  musicWatcher = chokidar.watch(folder, { ignoreInitial: true });
  musicWatcher.on("add", () => {
    catalogoLocal = construirCatalogo(folder);
    if (hostWindow) hostWindow.webContents.send("music-folder-changed");
  });
  musicWatcher.on("unlink", () => {
    catalogoLocal = construirCatalogo(folder);
    if (hostWindow) hostWindow.webContents.send("music-folder-changed");
  });
}
