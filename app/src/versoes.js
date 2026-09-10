"use strict";

// Versoes da mesma musica ja presentes na pasta. O KJ decide qual tocar: a
// mesma faixa costuma existir em canais diferentes, com tom e arranjo
// diferentes, e pegar "a primeira que aparecer" tira essa escolha dele.

function normalizar(txt) {
  return String(txt || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

// Nome no padrao "Artista - Musica - Canal [id].ext".
function decompor(nomeArquivo) {
  const semExt = String(nomeArquivo).replace(/\.[^.]+$/, "");
  const mId = semExt.match(/\[([A-Za-z0-9_-]{11})\]\s*$/);
  const videoId = mId ? mId[1] : null;
  const base = semExt.replace(/\s*\[[A-Za-z0-9_-]{11}\]\s*$/, "").trim();
  const partes = base.split(" - ");
  return {
    artista: partes.length >= 3 ? partes[0].trim() : (partes[0] || "").trim(),
    musica:  partes.length >= 3 ? partes.slice(1, -1).join(" - ").trim() : (partes[1] || "").trim(),
    canal:   partes.length >= 3 ? partes[partes.length - 1].trim() : "",
    videoId,
    arquivo: nomeArquivo,
  };
}

// "Chitaozinho & Xororo" e "Chitaozinho e Xororo" sao o mesmo artista, mas o
// "&" some na normalizacao e o "e" fica: comparar texto exato falharia. Compara
// por sobreposicao das palavras que importam.
const LIGACOES = new Set(["e", "and", "feat", "ft", "com", "the", "de", "da", "do"]);

function palavrasChave(txt) {
  return normalizar(txt).split(" ").filter(p => p.length > 2 && !LIGACOES.has(p));
}

function mesmoArtista(a, b) {
  const pa = palavrasChave(a), pb = palavrasChave(b);
  if (!pa.length || !pb.length) return true;
  const menor = pa.length <= pb.length ? pa : pb;
  const maior = new Set(pa.length <= pb.length ? pb : pa);
  const comuns = menor.filter(p => maior.has(p)).length;
  return comuns / menor.length >= 0.7;
}

function versoesLocais(arquivos, pedido) {
  if (!Array.isArray(arquivos) || !pedido) return [];
  const musica  = normalizar(pedido.musica);
  const artista = normalizar(pedido.artista);
  if (!musica) return [];

  return arquivos
    .map(decompor)
    .filter(v => {
      if (normalizar(v.musica) !== musica) return false;
      // Artista "Desconhecido" ou ausente nao deve excluir a versao.
      if (!artista || artista === "desconhecido") return true;
      return mesmoArtista(v.artista, pedido.artista);
    });
}

module.exports = { versoesLocais, decompor, normalizar, mesmoArtista };
