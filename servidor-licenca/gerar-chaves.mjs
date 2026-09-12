// Cria o par de chaves que assina as licencas do Voxly.
//
//   node servidor-licenca/gerar-chaves.mjs
//
// Sai uma chave PUBLICA, que vai dentro do app (qualquer um pode ver, so serve
// para conferir), e uma chave PRIVADA, que assina os bilhetes. A privada nao
// pode entrar no repositorio, nem no app, nem em conversa de WhatsApp: quem a
// tiver fabrica licenca vitalicia para qualquer maquina. O lugar dela e o
// cofre do Cloudflare, e ela vai para la por um comando que le do teclado.
//
// Se um dia ela vazar: gere outro par, publique um Voxly novo com a chave
// publica nova e reemita os bilhetes. Por isso o bilhete e curto e o servidor
// assina na hora do pedido — trocar a chave nao quebra ninguem que pagou.

import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const publica = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const privada = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");

console.log(`
┌─ CHAVE PUBLICA ──────────────────────────────────────────────
│ Cole em app/src/chave-licenca.js, no campo chavePublica:
└──────────────────────────────────────────────────────────────
${publica}

┌─ CHAVE PRIVADA ──────────────────────────────────────────────
│ NAO salve em arquivo. Rode o comando abaixo e cole quando ele
│ pedir. Depois limpe o historico do terminal.
│
│   cd servidor-licenca && npx wrangler secret put LICENCA_CHAVE_PRIVADA
└──────────────────────────────────────────────────────────────
${privada}
`);
