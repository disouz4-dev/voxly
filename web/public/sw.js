// Service worker do app do cantor: existe so para o navegador oferecer
// "instalar na tela inicial". De proposito NAO intercepta nenhum pedido
// (sem "fetch"): a fila e o Firestore precisam estar sempre ao vivo, e um
// cache aqui ja serviu tela velha depois de atualizacao.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
