"use strict";

// Manter o yt-dlp atualizado sozinho.
//
// O YouTube muda com frequencia e quebra versoes antigas do yt-dlp; o sintoma
// e 403/404 no meio de um show. Depender do que a distro empacota e o pior dos
// mundos: o apt do Ubuntu costuma estar meses atras, e "yt-dlp -U" recusa
// atualizar quando a instalacao veio de um gerenciador de pacotes. Por isso o
// Voxly mantem a propria copia, baixada do repositorio oficial.

const BASE_OFICIAL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";
const API_ULTIMA = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";

// O build "independente" e um bundle PyInstaller que se extrai A CADA
// invocacao — medido: 24 a 46 SEGUNDOS por chamada, contra 950ms do zipapp e
// 516ms do script do sistema. Como o Voxly chama o yt-dlp em toda busca e todo
// download, escolher errado aqui deixa o app inteiro dezenas de vezes mais
// lento. O zipapp so pede Python, que macOS e Linux ja trazem.
const ZIPAPP = "yt-dlp";
const BUNDLE_POR_SISTEMA = {
  linux:  "yt-dlp_linux",
  darwin: "yt-dlp_macos",
  win32:  "yt-dlp.exe",
};

// A versao do yt-dlp E a data de publicacao: "2026.08.19".
function idadeEmDias(versao, agora) {
  const m = String(versao || "").trim().match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (!m) return null;
  const publicada = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const hoje = agora == null ? Date.now() : agora;
  return Math.floor((hoje - publicada) / 86400000);
}

// "Atualize se a versao tem mais de N dias" estava errado: a ULTIMA versao
// publicada pode ter tres semanas, e o app se declarava desatualizado para
// sempre, rebaixando o mesmo arquivo a cada abertura. O que importa e se
// existe versao mais nova que a minha.
function precisaAtualizar(versaoLocal, versaoPublicada) {
  const local = String(versaoLocal || "").trim();
  if (!local) return true;                 // sem yt-dlp: precisa, ponto

  const publicada = String(versaoPublicada || "").trim();
  // Sem saber o que esta publicado (sem rede, GitHub fora), nao troca o que ja
  // funciona: baixar as cegas so arrisca.
  if (!publicada) return false;

  return publicada.localeCompare(local, "en", { numeric: true }) > 0;
}

function urlDoBinario(plataforma, { temPython } = {}) {
  if (temPython) return BASE_OFICIAL + ZIPAPP;
  const arquivo = BUNDLE_POR_SISTEMA[plataforma];
  return arquivo ? BASE_OFICIAL + arquivo : null;
}

// Entre a copia do Voxly e a do sistema, vale a mais nova: sem isto o app
// ficava preso na propria copia velha mesmo com uma melhor instalada ao lado.
function maisNova(a, b) {
  const x = String(a || "").trim(), y = String(b || "").trim();
  if (!x) return y || null;
  if (!y) return x;
  return y.localeCompare(x, "en", { numeric: true }) > 0 ? y : x;
}

function nomeDoBinario(plataforma) {
  return plataforma === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

// Integridade: o release traz SHA2-256SUMS ("<hash>  <arquivo>" por linha).
// Antes so se conferia tamanho e se "--version" rodava — um binario adulterado
// no caminho passaria pelos dois.
function urlDasSomas() {
  return BASE_OFICIAL + "SHA2-256SUMS";
}

function nomeNoRelease(url) {
  return String(url || "").split("/").pop();
}

function somaEsperada(conteudo, arquivo) {
  for (const linha of String(conteudo || "").split(/\r?\n/)) {
    // "*" antes do nome e o modo binario do sha256sum.
    const m = linha.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (m && m[2] === arquivo) return m[1].toLowerCase();
  }
  return null;
}

module.exports = {
  idadeEmDias, precisaAtualizar, urlDoBinario, nomeDoBinario, maisNova, API_ULTIMA,
  urlDasSomas, nomeNoRelease, somaEsperada,
};
