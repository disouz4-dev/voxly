"use strict";

// Gera os icones do Voxly a partir da logo atual, inteira (microfone, onda e
// "Voxly karaoke"), sobre um quadrado escuro arredondado — as letras sao
// brancas e sumiriam no fundo claro do Finder:
//   src/assets/icons/icon.png   1024x1024 — Mac (Dock, app, .dmg) e Linux
//   src/assets/icons/icon.ico   Windows, com 16 a 256 px dentro
//   src/assets/icons/tray.png   32x32
//   ../web/public/assets/icons/ app-192, app-512 e apple-touch-icon (180):
//                               o app do cantor instalado na tela do celular.
//                               Quadrado cheio, sem cantos: o Android e o iOS
//                               recortam do jeito deles, e a logo fica dentro
//                               da zona segura (80% do centro).
//
// Roda no proprio Electron, desenhando numa janela invisivel: nao depende de
// nenhuma ferramenta de imagem instalada. Quando a logo mudar:
//
//   npx electron scripts/gerar-icones.js src/assets/logo/logo_voxly.png
//
// A logo precisa ter fundo transparente: o recorte e feito pelo que nao e
// transparente.

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const ORIGEM = path.resolve(process.argv[process.argv.length - 1]);
const DESTINO = path.join(__dirname, "..", "src", "assets", "icons");
const DESTINO_WEB = path.join(__dirname, "..", "..", "web", "public", "assets", "icons");

// Um .ico e um indice seguido das imagens; desde o Vista cada imagem pode ser
// um PNG inteiro, entao basta empacotar os PNGs de cada tamanho.
function montarIco(pngs) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0); cabecalho.writeUInt16LE(1, 2); cabecalho.writeUInt16LE(pngs.length, 4);
  const indice = Buffer.alloc(16 * pngs.length);
  let desloc = 6 + indice.length;
  pngs.forEach(({ lado, dados }, i) => {
    const o = i * 16;
    indice.writeUInt8(lado >= 256 ? 0 : lado, o);
    indice.writeUInt8(lado >= 256 ? 0 : lado, o + 1);
    indice.writeUInt8(0, o + 2); indice.writeUInt8(0, o + 3);
    indice.writeUInt16LE(1, o + 4); indice.writeUInt16LE(32, o + 6);
    indice.writeUInt32LE(dados.length, o + 8); indice.writeUInt32LE(desloc, o + 12);
    desloc += dados.length;
  });
  return Buffer.concat([cabecalho, indice, ...pngs.map(p => p.dados)]);
}

const DESENHO = `(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();

  // 1) Acha onde a logo esta de verdade (o arquivo tem muita margem
  //    transparente em volta).
  const base = document.createElement('canvas');
  base.width = img.naturalWidth; base.height = img.naturalHeight;
  const b = base.getContext('2d');
  b.drawImage(img, 0, 0);
  const d = b.getImageData(0, 0, base.width, base.height).data;
  let x0 = base.width, y0 = base.height, x1 = 0, y1 = 0;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 24) {
      const p = (i - 3) / 4, x = p % base.width, y = Math.floor(p / base.width);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const larg = x1 - x0 + 1, alt = y1 - y0 + 1;

  // 2) Monta o icone num lado qualquer.
  function icone(lado, comFundo) {
    const c = document.createElement('canvas');
    c.width = c.height = lado;
    const k = c.getContext('2d');
    if (comFundo === 'cheio') {
      const grad = k.createLinearGradient(0, 0, 0, lado);
      grad.addColorStop(0, '#1b2030'); grad.addColorStop(1, '#0b0c11');
      k.fillStyle = grad; k.fillRect(0, 0, lado, lado);
      const escala = Math.min(lado * 0.62 / larg, lado * 0.62 / alt);
      const w = larg * escala, h = alt * escala;
      k.imageSmoothingEnabled = true; k.imageSmoothingQuality = 'high';
      k.drawImage(base, x0, y0, larg, alt, (lado - w) / 2, (lado - h) / 2, w, h);
    } else if (comFundo) {
      // Grade do macOS: quadrado de 824/1024 com margem, cantos de ~22%.
      const q = lado * 824 / 1024, m = (lado - q) / 2, raio = q * 0.2237;
      const grad = k.createLinearGradient(0, m, 0, m + q);
      grad.addColorStop(0, '#1b2030'); grad.addColorStop(1, '#0b0c11');
      k.save();
      k.shadowColor = 'rgba(0,0,0,.45)'; k.shadowBlur = lado * 0.03; k.shadowOffsetY = lado * 0.012;
      k.beginPath(); k.roundRect(m, m, q, q, raio); k.fillStyle = grad; k.fill();
      k.restore();
      k.lineWidth = Math.max(1, lado * 0.004); k.strokeStyle = 'rgba(255,255,255,.08)';
      k.beginPath(); k.roundRect(m + k.lineWidth / 2, m + k.lineWidth / 2, q - k.lineWidth, q - k.lineWidth, raio); k.stroke();
      // A logo inteira, ocupando ~78% do quadrado.
      const escala = Math.min(q * 0.78 / larg, q * 0.78 / alt);
      const w = larg * escala, h = alt * escala;
      k.imageSmoothingEnabled = true; k.imageSmoothingQuality = 'high';
      k.drawImage(base, x0, y0, larg, alt, (lado - w) / 2, (lado - h) / 2, w, h);
    } else {
      const escala = Math.min(lado * 0.92 / larg, lado * 0.92 / alt);
      const w = larg * escala, h = alt * escala;
      k.drawImage(base, x0, y0, larg, alt, (lado - w) / 2, (lado - h) / 2, w, h);
    }
    return c.toDataURL('image/png');
  }

  const saida = {};
  for (const lado of [1024, 256, 128, 64, 48, 32, 24, 16]) saida['i' + lado] = icone(lado, true);
  saida.tray = icone(32, true);
  for (const lado of [512, 192, 180]) saida['web' + lado] = icone(lado, 'cheio');
  saida.recorte = { x0, y0, larg, alt };
  return saida;
})`;

app.whenReady().then(async () => {
  const janela = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await janela.loadURL("data:text/html,<html><body></body></html>");
  const src = "data:image/" + (ORIGEM.endsWith(".png") ? "png" : "jpeg") + ";base64," + fs.readFileSync(ORIGEM).toString("base64");
  const r = await janela.webContents.executeJavaScript(`${DESENHO}(${JSON.stringify(src)})`);
  const bin = url => Buffer.from(url.split(",")[1], "base64");
  fs.writeFileSync(path.join(DESTINO, "icon.png"), bin(r.i1024));
  fs.writeFileSync(path.join(DESTINO, "tray.png"), bin(r.tray));
  fs.writeFileSync(path.join(DESTINO, "icon.ico"),
    montarIco([16, 24, 32, 48, 64, 128, 256].map(lado => ({ lado, dados: bin(r["i" + lado]) }))));
  fs.mkdirSync(DESTINO_WEB, { recursive: true });
  fs.writeFileSync(path.join(DESTINO_WEB, "app-512.png"), bin(r.web512));
  fs.writeFileSync(path.join(DESTINO_WEB, "app-192.png"), bin(r.web192));
  fs.writeFileSync(path.join(DESTINO_WEB, "apple-touch-icon.png"), bin(r.web180));
  console.log("simbolo recortado:", JSON.stringify(r.recorte));
  console.log("icones gravados em", DESTINO);
  app.quit();
});
