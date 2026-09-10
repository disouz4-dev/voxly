"use strict";

// Se o app deve procurar atualizacao sozinho.

const MOTIVO_MAC =
  "No macOS a atualização automática não está disponível — o app não é assinado " +
  "pela Apple. Baixe o .dmg novo em github.com/disouz4-dev/voxly/releases.";

function podeAtualizarSozinho({ plataforma, empacotado } = {}) {
  // Em desenvolvimento o electron-updater nao tem release para comparar.
  if (!empacotado) return { pode: false, motivo: "Rodando a partir do código-fonte." };

  // No macOS o updater nem chega a instalar: falta assinatura e notarizacao.
  // E o latest-mac.yml fica fora do release de proposito, porque o CI so
  // compila arm64 e ele mandaria um Mac Intel baixar o pacote errado. Checar
  // assim mesmo so produzia um 404 na cara do KJ, com jeito de defeito.
  if (plataforma === "darwin") return { pode: false, motivo: MOTIVO_MAC };

  return { pode: true };
}

// Como instalar o que ja foi baixado.
//
// O electron-updater instala sozinho o AppImage e os instaladores do Windows.
// Num pacote .deb ele precisa de sudo grafico e, sem ele, o quitAndInstall nao
// faz NADA — o botao "Reiniciar para atualizar" ficava com cara de quebrado.
// Dizer o comando e honesto; um botao que nao responde nao e.
const RELEASES = "https://github.com/disouz4-dev/voxly/releases/latest";

function comoInstalar({ plataforma, appimage, arquivo } = {}) {
  if (plataforma !== "linux" || appimage) return { modo: "automatico" };

  return {
    modo: "manual",
    comando: arquivo
      ? `sudo dpkg -i "${arquivo}" && sudo apt-get install -f -y`
      : `Baixe o .deb novo em ${RELEASES} e instale com: sudo dpkg -i voxly_*.deb`,
  };
}

module.exports = { podeAtualizarSozinho, comoInstalar, MOTIVO_MAC };
