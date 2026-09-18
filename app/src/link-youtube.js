"use strict";

// Le o video de um link do YouTube colado pelo KJ.
//
// Pedido do dono no show de 17/09: na escolha de versoes, uma caixa para
// colar o link quando ele ja sabe qual gravacao quer (uma versao especifica
// que a busca nao traz). Aceita os formatos que o celular e o navegador
// copiam: watch?v=, youtu.be/, shorts/, embed/, live/, music. e m., com ou
// sem https, e o proprio id de 11 caracteres. Playlist sozinha nao serve:
// aqui e uma musica so.

(function (raiz) {

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;

function idDoVideo(texto) {
  const bruto = String(texto || "").trim();
  if (!bruto) return null;
  if (ID.test(bruto)) return bruto;

  let url;
  try { url = new URL(/^[a-z]+:\/\//i.test(bruto) ? bruto : "https://" + bruto); }
  catch (_) { return null; }
  if (!HOSTS.test(url.hostname)) return null;

  let id = null;
  if (/youtu\.be$/i.test(url.hostname)) id = url.pathname.split("/")[1];
  else if (url.searchParams.get("v")) id = url.searchParams.get("v");
  else {
    const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
    if (m) id = m[1];
  }
  return id && ID.test(id) ? id : null;
}

function urlDoVideo(id) { return `https://www.youtube.com/watch?v=${id}`; }

const api = { idDoVideo, urlDoVideo };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyLinkYoutube = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
