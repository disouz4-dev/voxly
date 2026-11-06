// Gera a pagina do comparador cego a partir do dados.json do comparador.mjs.
//
// Separada do comparador porque a medicao leva minutos (iTunes limita por IP) e
// a pagina se refaz em um segundo — mexer no texto nao pode custar uma nova
// rodada de download.
//
// Uso: node test/comparador-pagina.mjs [pasta]

import fs from "node:fs";
import path from "node:path";

const PASTA = process.argv[2] || process.env.VOXLY_SAIDA || path.join(process.cwd(), "comparador");
const itens = JSON.parse(fs.readFileSync(path.join(PASTA, "dados.json"), "utf8"));

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const cartoes = itens.map((it, i) => `
  <section class="cartao" data-i="${i}">
    <header>
      <span class="passo">${i + 1} de ${itens.length}</span>
      <h2>${esc(it.artista)} — ${esc(it.musica)}</h2>
      <p class="trecho">trecho em ${it.trecho.segundos}s da versão · ${it.trecho.duracao}s</p>
    </header>

    <div class="pares">
      <div class="lado">
        <div class="rotulo original">ORIGINAL (master)</div>
        <audio controls preload="none" src="${esc(it.audioOriginal)}"></audio>
      </div>
      <div class="lado">
        <div class="rotulo versao">VERSÃO DE KARAOKÊ</div>
        <audio controls preload="none" src="${esc(it.audioVersao)}"></audio>
      </div>
    </div>

    <div class="voto">
      <button data-voto="master">É o master com a voz tirada</button>
      <button data-voto="regravado">É regravado</button>
      <button data-voto="duvida">Não sei</button>
    </div>

    <div class="revelado" hidden>
      <div class="nota"><b>${it.nota}</b><span>/100</span></div>
      <div class="partes">
        ${["harmonia", "grave", "timbre", "tempo"].map(k =>
          `<span>${k} <b>${it.partes[k] === undefined ? "--" : it.partes[k]}</b></span>`).join("")}
      </div>
      <div class="meta">canal: ${esc(it.canal)} · iTunes: ${esc(it.itunes)} · alinhamento ${it.trecho.correlacao}</div>
    </div>
  </section>`).join("");

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comparador de Qualidade</title>
<style>
  :root { --fundo:#0e0e18; --caixa:#17172a; --caixa2:#1f1f36; --texto:#ececf4;
          --mudo:#8a8aa8; --linha:#ffffff14; --accent:#7c4dff; --ok:#00e676; --alerta:#ff9100; }
  * { box-sizing:border-box; }
  body { margin:0; padding:24px 16px 80px; background:var(--fundo); color:var(--texto);
         font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; }
  .capa { max-width:860px; margin:0 auto 28px; }
  h1 { font-size:1.35rem; margin:0 0 8px; }
  .explica { color:var(--mudo); font-size:.9rem; max-width:62ch; }
  .explica b { color:var(--texto); }
  .barra { max-width:860px; margin:0 auto 20px; height:6px; background:var(--caixa2);
           border-radius:999px; overflow:hidden; }
  .barra > div { height:100%; width:0; background:linear-gradient(90deg,var(--accent),var(--ok)); transition:width .3s; }
  .cartao { max-width:860px; margin:0 auto 18px; background:var(--caixa); border:1px solid var(--linha);
            border-radius:14px; padding:18px; }
  .cartao.feito { opacity:.62; }
  .passo { font-size:.68rem; letter-spacing:1.5px; text-transform:uppercase; color:var(--mudo); }
  h2 { font-size:1.05rem; margin:4px 0 2px; }
  .trecho { margin:0 0 14px; font-size:.75rem; color:var(--mudo); }
  .pares { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media (max-width:680px) { .pares { grid-template-columns:1fr; } }
  .rotulo { font-size:.66rem; letter-spacing:1.5px; font-weight:800; margin-bottom:6px; }
  .rotulo.original { color:var(--ok); }
  .rotulo.versao { color:var(--accent); }
  audio { width:100%; }
  .voto { display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; }
  .voto button { flex:1; min-width:150px; padding:11px 12px; border-radius:10px; cursor:pointer;
                 background:var(--caixa2); color:var(--texto); border:1px solid var(--linha);
                 font-size:.86rem; font-weight:600; }
  .voto button:hover { border-color:var(--accent); }
  .voto button.escolhido { background:var(--accent); border-color:var(--accent); color:#fff; }
  .revelado { margin-top:14px; padding-top:14px; border-top:1px solid var(--linha);
              display:flex; flex-wrap:wrap; gap:16px; align-items:center; }
  .nota b { font-size:1.9rem; }
  .nota span { color:var(--mudo); font-size:.8rem; }
  .partes { display:flex; gap:14px; flex-wrap:wrap; font-size:.78rem; color:var(--mudo); }
  .partes b { color:var(--texto); }
  .meta { font-size:.7rem; color:var(--mudo); width:100%; }
  .fim { max-width:860px; margin:26px auto 0; background:var(--caixa); border:1px solid var(--linha);
         border-radius:14px; padding:18px; }
  textarea { width:100%; height:120px; margin-top:10px; background:#0a0a12; color:var(--texto);
             border:1px solid var(--linha); border-radius:10px; padding:10px; font-family:ui-monospace,monospace;
             font-size:.78rem; }
  .fim button { margin-top:10px; padding:11px 16px; border-radius:10px; border:none; cursor:pointer;
                background:var(--ok); color:#06281a; font-weight:800; }
</style>
</head>
<body>
  <div class="capa">
    <h1>Comparador de qualidade — teste cego</h1>
    <p class="explica">
      Para cada música você ouve <b>o mesmo trecho</b> duas vezes: o master original
      (30 s do iTunes) e a versão de karaokê, recortada no ponto exato da música em que
      aquele trecho cai. A ordem das músicas está embaralhada e <b>a nota só aparece
      depois do seu voto</b> — se o número vier antes, você ouve o que ele mandou ouvir.
      No fim, copie o resultado e me mande.
    </p>
  </div>
  <div class="barra"><div id="progresso"></div></div>

  ${cartoes}

  <div class="fim">
    <b>Resultado</b>
    <p class="explica" style="margin:6px 0 0">Cole isto na conversa para eu calibrar o corte do selo.</p>
    <textarea id="saida" readonly></textarea>
    <button id="copiar">Copiar resultado</button>
  </div>

<script>
const DADOS = ${JSON.stringify(itens.map(i => ({ slug: i.slug, artista: i.artista, musica: i.musica, canal: i.canal, nota: i.nota })))};
const votos = {};

document.querySelectorAll(".cartao").forEach(cartao => {
  const i = Number(cartao.dataset.i);
  cartao.querySelectorAll("[data-voto]").forEach(b => {
    b.addEventListener("click", () => {
      votos[i] = b.dataset.voto;
      cartao.querySelectorAll("[data-voto]").forEach(o => o.classList.toggle("escolhido", o === b));
      cartao.querySelector(".revelado").hidden = false;
      cartao.classList.add("feito");
      atualizar();
    });
  });
});

// Um audio por vez: dois tocando juntos nao se comparam.
const todos = [...document.querySelectorAll("audio")];
todos.forEach(a => a.addEventListener("play", () => todos.forEach(o => { if (o !== a) o.pause(); })));

function atualizar() {
  const n = Object.keys(votos).length;
  document.getElementById("progresso").style.width = (n * 100 / DADOS.length) + "%";
  const linhas = DADOS.map((d, i) => {
    const v = votos[i];
    return v ? \`\${String(d.nota).padStart(3)} | \${v.padEnd(10)} | \${d.artista} — \${d.musica} [\${d.canal}]\` : null;
  }).filter(Boolean);
  document.getElementById("saida").value = linhas.length
    ? "nota | seu ouvido | musica\\n" + linhas.join("\\n")
    : "";
}

document.getElementById("copiar").addEventListener("click", async () => {
  const t = document.getElementById("saida");
  try { await navigator.clipboard.writeText(t.value); } catch { t.select(); document.execCommand("copy"); }
  const b = document.getElementById("copiar");
  b.textContent = "copiado"; setTimeout(() => (b.textContent = "Copiar resultado"), 1500);
});

atualizar();
</script>
</body>
</html>`;

const destino = path.join(PASTA, "index.html");
fs.writeFileSync(destino, html);
console.log(`pagina: ${destino}\ncomparacoes: ${itens.length}`);
