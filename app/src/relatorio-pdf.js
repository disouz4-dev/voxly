"use strict";

// A pagina impressa do relatorio de uma noite, para virar PDF e ir para a
// casa (pedido do dono no show de 17/09).
//
// Recebe o resumo que o relatorio.js monta (o mesmo que fica em relatorios/)
// e devolve um HTML completo, claro e em A4, que o main imprime com
// printToPDF. Todo texto que veio de fora (nome de cantor, titulo de musica)
// passa por escapar: o PDF nasce de um HTML.

const escapar = t => String(t == null ? "" : t)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const dois = n => String(n).padStart(2, "0");
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function data(ms) {
  if (ms == null) return "—";
  const d = new Date(ms);
  return `${DIAS[d.getDay()]}, ${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function hora(ms) {
  if (ms == null) return "—";
  const d = new Date(ms);
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

// "Voxly - Casa do Rock - 2026-09-17.pdf". Sem os caracteres que o Windows
// recusa em nome de arquivo.
function nomeDoArquivo(r) {
  const quando = r && (r.inicioPlanejado ?? r.primeiraMusica ?? r.geradoEm);
  const d = quando != null ? new Date(quando) : null;
  const dia = d ? `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}` : "noite";
  const casa = String((r && r.nomeCasa) || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return ["Voxly", casa, dia].filter(Boolean).join(" - ") + ".pdf";
}

function paginaDaNoite(r, { logo = null, agora = Date.now() } = {}) {
  const R = r || {};
  const musicas = Array.isArray(R.musicas) ? R.musicas : [];
  const cantores = (Array.isArray(R.cantores) ? R.cantores : []).filter(c => c && (c.cantou || c.pediu));
  const quando = R.inicioPlanejado ?? R.primeiraMusica ?? R.geradoEm;
  const faixa = (R.primeiraMusica != null && R.ultimaMusica != null)
    ? `${hora(R.primeiraMusica)} às ${hora(R.ultimaMusica)}` : "—";
  const previsto = (R.inicioPlanejado != null && R.terminoPlanejado != null)
    ? `${hora(R.inicioPlanejado)} às ${hora(R.terminoPlanejado)}` : "—";

  const numero = (v, rotulo) => `<div class="num"><b>${escapar(v ?? 0)}</b><span>${rotulo}</span></div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${escapar(nomeDoArquivo(R).replace(/\.pdf$/, ""))}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1b1b1f; font-size: 10.5pt; margin: 0; }
  header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #1b1b1f; padding-bottom: 10px; }
  /* A logo tem muita margem transparente: a moldura escura corta o excesso. */
  header .logo { width: 150px; height: 72px; overflow: hidden; background: #141418; border-radius: 10px;
                 display: flex; align-items: center; justify-content: center; }
  header .logo img { height: 96px; }
  header .marca { font-weight: 800; font-size: 20pt; letter-spacing: -.5px; }
  header .titulo { flex: 1; text-align: right; }
  header .titulo h1 { font-size: 15pt; margin: 0; }
  header .titulo p { margin: 2px 0 0; color: #555; }
  .horas { display: flex; gap: 24px; margin: 10px 0 4px; color: #444; }
  .nums { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 12px 0 6px; }
  .num { border: 1px solid #d6d6dc; border-radius: 8px; padding: 8px 10px; }
  .num b { display: block; font-size: 16pt; }
  .num span { color: #555; font-size: 8.5pt; }
  h2 { font-size: 11.5pt; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .6px; color: #333; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #e4e4ea; vertical-align: top; }
  th { font-size: 8.5pt; color: #555; text-transform: uppercase; letter-spacing: .4px; border-bottom: 1px solid #1b1b1f; }
  td.n, th.n { text-align: right; width: 56px; }
  td.h { width: 48px; color: #555; font-variant-numeric: tabular-nums; }
  tr { break-inside: avoid; }
  .artista { color: #666; }
  footer { margin-top: 18px; color: #777; font-size: 8.5pt; border-top: 1px solid #d6d6dc; padding-top: 6px; }
</style></head><body>
<header>
  ${logo ? `<div class="logo"><img src="${escapar(logo)}" alt="Voxly"></div>` : `<div class="marca">Voxly</div>`}
  <div class="titulo">
    <h1>Relatório da noite${R.nomeCasa ? " — " + escapar(R.nomeCasa) : ""}</h1>
    <p>${escapar(data(quando))}${R.codigo ? " · sessão " + escapar(R.codigo) : ""}</p>
  </div>
</header>
<div class="horas"><span>Previsto: <b>${previsto}</b></span><span>Músicas: <b>${faixa}</b></span></div>
<div class="nums">
  ${numero(R.participantes, "participantes")}
  ${numero(R.cantaram, "cantaram")}
  ${numero(R.cantadas, "músicas cantadas")}
  ${numero(R.pedidos, "pedidos")}
  ${numero(R.naoCantadas, "ficaram sem tocar")}
</div>

<h2>Músicas cantadas (${musicas.length})</h2>
${musicas.length ? `<table>
  <thead><tr><th>Hora</th><th>Música</th><th>Cantor</th></tr></thead>
  <tbody>${musicas.map(m => `<tr>
    <td class="h">${hora(m.horario)}</td>
    <td>${escapar(m.musica)} <span class="artista">— ${escapar(m.artista)}</span></td>
    <td>${escapar(m.cantor)}${m.dupla ? " &amp; " + escapar(m.dupla) : ""}</td>
  </tr>`).join("")}</tbody>
</table>` : "<p>Nenhuma música cantada.</p>"}

<h2>Cantores (${cantores.length})</h2>
${cantores.length ? `<table>
  <thead><tr><th>Cantor</th><th class="n">Pediu</th><th class="n">Cantou</th></tr></thead>
  <tbody>${cantores.map(c => `<tr><td>${escapar(c.nome)}</td><td class="n">${c.pediu || 0}</td><td class="n">${c.cantou || 0}</td></tr>`).join("")}</tbody>
</table>` : "<p>Ninguém registrado.</p>"}

<footer>Gerado pelo Voxly em ${escapar(data(agora))}, ${hora(agora)}.</footer>
</body></html>`;
}

module.exports = { paginaDaNoite, nomeDoArquivo, escapar };
