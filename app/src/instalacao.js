// Quem e este computador.
//
// A licenca e de uma maquina, nao de um arquivo — senao bastava copiar a pasta
// do Voxly para o computador do vizinho. O identificador nasce de coisas que a
// maquina tem e que nao viajam junto com uma copia de pasta: placa de rede,
// nome, sistema, arquitetura. Tudo isso vira um resumo (SHA-256) de 16 letras.
//
// Nao e cofre, e tranca de porta. Quem entende de computador contorna; o que
// isso impede e a copia despreocupada, que e o caso real. E de proposito que
// nao usa numero de serie nem nada que identifique a PESSOA: o Voxly nao
// precisa saber quem e o dono, so precisa distinguir uma maquina da outra.
//
// Se a placa de rede mudar (trocou o notebook, pos um adaptador USB novo), o
// identificador muda e a licenca precisa ser transferida. Por isso o painel
// mostra o codigo na tela: e o que o cliente manda para voce.

const crypto = require("crypto");
const os     = require("os");

// Interfaces de maquina virtual, Docker, VPN e afins mudam sozinhas e nao
// servem de identidade. Fica so o que parece hardware de verdade.
const FALSAS = /^(lo|docker|br-|veth|virbr|vmnet|vboxnet|utun|awdl|llw|tun|tap|ham|zt)/i;

function macEstavel(interfaces) {
  const redes = interfaces || os.networkInterfaces();
  const macs = [];
  for (const nome of Object.keys(redes).sort()) {
    if (FALSAS.test(nome)) continue;
    for (const i of redes[nome] || []) {
      if (i.internal) continue;
      const mac = String(i.mac || "").toLowerCase();
      if (!mac || mac === "00:00:00:00:00:00") continue;
      macs.push(mac);
    }
  }
  return macs.length ? macs.sort()[0] : "";
}

function idDaMaquina(dados = {}) {
  const partes = [
    dados.mac !== undefined ? dados.mac : macEstavel(dados.interfaces),
    dados.hostname || os.hostname(),
    dados.platform || process.platform,
    dados.arch     || process.arch,
  ];
  return crypto.createHash("sha256").update(partes.join("|")).digest("hex").slice(0, 16);
}

// Como o codigo aparece na tela e no WhatsApp: 4 grupos de 4.
function codigoLegivel(id) {
  return String(id || "").toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
}

module.exports = { idDaMaquina, macEstavel, codigoLegivel, FALSAS };
