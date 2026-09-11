"use strict";

// Texto e enderecos que vem de fora entram em HTML nas telas: nome do cantor,
// foto, titulo do YouTube, nome da casa. A revisao de seguranca de 11/09
// mostrou uma foto com aspas fechando o atributo src e executando codigo na
// Gerencia — que alcanca apagar arquivos e rodar o yt-dlp pelo preload.
//
// Duas regras, para todas as telas (a copia em web/public e vigiada por
// copias.test.js):
//  - texto em HTML passa por escaparHtml, que escapa as aspas tambem (o escHtml
//    antigo, via textContent/innerHTML, nao escapava);
//  - endereco de imagem passa por urlDeImagem: so http(s) ou data:image, sem
//    aspas, parenteses nem espacos, que fechariam o atributo ou o url() do CSS.

(function (raiz) {

const ENTIDADES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escaparHtml(texto) {
  if (texto == null) return "";
  return String(texto).replace(/[&<>"']/g, c => ENTIDADES[c]);
}

const RE_HTTP = /^https?:\/\/[^\s"'<>()\\`]+$/i;
const RE_DATA = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i;

function urlDeImagem(url) {
  if (typeof url !== "string" || !url) return null;
  return (RE_HTTP.test(url) || RE_DATA.test(url)) ? url : null;
}

const api = { escaparHtml, urlDeImagem };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlySeguro = api;

})(globalThis);
