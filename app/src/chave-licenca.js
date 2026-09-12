// Onde mora a configuracao da cobranca.
//
// Enquanto `chavePublica` estiver vazia o Voxly NAO COBRA NADA: e o app de
// sempre, sem licenca, sem trava, sem painel pedindo dinheiro. E assim que ele
// sai daqui do repositorio e assim que ele roda no desenvolvimento.
//
// Para ligar a cobranca, rode `node servidor-licenca/gerar-chaves.mjs`, cole
// aqui a chave PUBLICA que ele imprimir e ponha o endereco do servidor. A
// chave privada nunca entra neste arquivo nem em lugar nenhum do app — ela vai
// para o servidor com `wrangler secret put`. Ver servidor-licenca/README.md.

module.exports = {
  chavePublica: "",                      // base64 da chave publica Ed25519
  servidor:     "",                      // ex.: https://licenca.voxly.workers.dev
  plano: {
    nome:  "Voxly mensal",
    dias:  30,
    preco: 49.9,                         // so para mostrar na tela; quem cobra e o servidor
  },
};
