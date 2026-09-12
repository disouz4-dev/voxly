// Servidor de licenca do Voxly.
//
// Roda no Cloudflare Workers, no plano gratuito: sem servidor para cuidar, sem
// mensalidade, sem cartao. Faz tres coisas e mais nada:
//
//   1. cria um Pix no Mercado Pago quando a casa quer pagar;
//   2. escuta o Mercado Pago avisar que o Pix caiu, CONFERE de volta com eles
//      e estende a licenca daquela maquina;
//   3. entrega o bilhete assinado quando o Voxly pede.
//
// O que ele NAO faz, de proposito: nao guarda cartao, nao guarda CPF, nao
// guarda nome de ninguem. O que fica gravado e o codigo da maquina, o nome da
// casa (para aparecer no painel) e ate quando a licenca vale.
//
// Segredos (nenhum mora no codigo — `npx wrangler secret put NOME`):
//   MP_TOKEN                 token de producao do Mercado Pago
//   MP_WEBHOOK_SEGREDO       segredo da notificacao, do painel do Mercado Pago
//   LICENCA_CHAVE_PRIVADA    base64 PKCS8 do gerar-chaves.mjs
//
// Guarda-volumes (KV, gratis): binding LICENCAS.
//   lic:<instalacao>   { casa, valeAte, emissao }
//   cob:<id>           { instalacao, meses, casa, status }
//   pago:<idPagamento> "1"  (para nunca creditar o mesmo Pix duas vezes)

const DIA = 24 * 60 * 60 * 1000;
const DIAS_POR_MES = 30;
const PRECO_MENSAL = 49.9;
const MARCA = "VOXLY1";

const MP = "https://api.mercadopago.com";

// ── Utilidades ─────────────────────────────────────────────

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const erro = (msg, status = 400) => json({ erro: msg }, status);

// O codigo da maquina vem do app; nunca deixe ele virar chave de KV sem
// conferir o formato, senao qualquer texto vira gravacao no banco.
const ehInstalacao = (s) => /^[0-9a-f]{16}$/.test(String(s || ""));

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const doB64 = (s) => Uint8Array.from(atob(String(s)), (c) => c.charCodeAt(0));

// Comparacao que nao entrega a resposta pelo tempo que demora.
function igualSemVazar(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

// ── Assinar o bilhete ──────────────────────────────────────

// O Cloudflare ja chamou este algoritmo de dois jeitos; aceita os dois.
async function chaveDeAssinatura(env) {
  const der = doB64(env.LICENCA_CHAVE_PRIVADA);
  for (const nome of ["Ed25519", "NODE-ED25519"]) {
    try {
      return await crypto.subtle.importKey("pkcs8", der, { name: nome, namedCurve: nome }, false, ["sign"]);
    } catch (_) { /* tenta o proximo */ }
  }
  throw new Error("nao consegui carregar a chave de assinatura");
}

async function assinarBilhete(env, { instalacao, casa, valeAte, emissao }) {
  const corpo = b64url(
    new TextEncoder().encode(JSON.stringify({
      i: instalacao, c: casa || "", p: "mensal", e: Date.now(), v: valeAte, n: emissao || 1,
    })),
  );
  const chave = await chaveDeAssinatura(env);
  const assinatura = await crypto.subtle.sign(
    { name: "Ed25519" }, chave, new TextEncoder().encode(corpo),
  ).catch(() => crypto.subtle.sign("NODE-ED25519", chave, new TextEncoder().encode(corpo)));
  return `${MARCA}.${corpo}.${b64url(assinatura)}`;
}

// ── Mercado Pago ───────────────────────────────────────────

async function mp(env, caminho, opcoes = {}) {
  const r = await fetch(MP + caminho, {
    ...opcoes,
    headers: {
      authorization: `Bearer ${env.MP_TOKEN}`,
      "content-type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
  const texto = await r.text();
  let dados = {};
  try { dados = texto ? JSON.parse(texto) : {}; } catch (_) { /* resposta torta */ }
  if (!r.ok) throw new Error(dados.message || `Mercado Pago respondeu ${r.status}`);
  return dados;
}

// A notificacao chega assinada. Sem esta conferencia, qualquer pessoa que
// descobrisse o endereco do webhook mandaria "pagou!" e ganharia licenca.
async function notificacaoAutentica(req, env, idDoPagamento) {
  if (!env.MP_WEBHOOK_SEGREDO) return false;
  const assinatura = req.headers.get("x-signature") || "";
  const idPedido   = req.headers.get("x-request-id") || "";
  const partes = Object.fromEntries(
    assinatura.split(",").map((p) => p.split("=").map((s) => s.trim())).filter((p) => p.length === 2),
  );
  if (!partes.ts || !partes.v1) return false;
  // Notificacao velha nao vale: impede reaproveitar uma captura antiga.
  if (Math.abs(Date.now() - Number(partes.ts)) > 10 * 60 * 1000) return false;

  const manifesto = `id:${idDoPagamento};request-id:${idPedido};ts:${partes.ts};`;
  const chave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env.MP_WEBHOOK_SEGREDO),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(manifesto));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return igualSemVazar(hex, partes.v1);
}

// ── Licenca ────────────────────────────────────────────────

async function creditar(env, instalacao, meses, casa) {
  const atual = (await env.LICENCAS.get(`lic:${instalacao}`, "json")) || {};
  const base = Math.max(Date.now(), Number(atual.valeAte) || 0);
  const novo = {
    casa:    casa || atual.casa || "",
    valeAte: base + meses * DIAS_POR_MES * DIA,
    emissao: (Number(atual.emissao) || 0) + 1,
    pagoEm:  Date.now(),
  };
  await env.LICENCAS.put(`lic:${instalacao}`, JSON.stringify(novo));
  return novo;
}

// ── Rotas ──────────────────────────────────────────────────

async function criarCobranca(req, env, url) {
  const corpo = await req.json().catch(() => ({}));
  const instalacao = String(corpo.instalacao || "");
  if (!ehInstalacao(instalacao)) return erro("codigo de instalacao invalido");

  const meses = Math.min(Math.max(parseInt(corpo.meses, 10) || 1, 1), 12);
  const casa  = String(corpo.casa || "").slice(0, 80);
  const email = String(corpo.email || "").slice(0, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro("informe um e-mail valido para o recibo");

  // Uma cobranca em aberto por maquina de cada vez: evita encher o Mercado
  // Pago de Pix por clique repetido.
  const emAberto = await env.LICENCAS.get(`ultima:${instalacao}`);
  if (emAberto) {
    const anterior = await env.LICENCAS.get(`cob:${emAberto}`, "json");
    if (anterior && anterior.status === "pendente" && anterior.expiraEm > Date.now()) {
      return json({ cobranca: emAberto, ...anterior.mostrar, reaproveitada: true });
    }
  }

  const expira = new Date(Date.now() + 30 * 60 * 1000);
  const pagamento = await mp(env, "/v1/payments", {
    method: "POST",
    headers: { "x-idempotency-key": `${instalacao}-${Date.now()}` },
    body: JSON.stringify({
      transaction_amount: Number((PRECO_MENSAL * meses).toFixed(2)),
      description: `Voxly — licenca ${meses} ${meses === 1 ? "mes" : "meses"}${casa ? " · " + casa : ""}`,
      payment_method_id: "pix",
      payer: { email },
      date_of_expiration: expira.toISOString().replace("Z", "-00:00"),
      notification_url: `${url.origin}/webhook`,
      metadata: { instalacao, meses },
    }),
  });

  const dadosPix = (pagamento.point_of_interaction || {}).transaction_data || {};
  const mostrar = {
    qr:         dadosPix.qr_code_base64 || "",
    copiaECola: dadosPix.qr_code || "",
    valor:      Number((PRECO_MENSAL * meses).toFixed(2)),
    meses,
    expiraEm:   expira.getTime(),
  };

  await env.LICENCAS.put(
    `cob:${pagamento.id}`,
    JSON.stringify({ instalacao, meses, casa, status: "pendente", expiraEm: expira.getTime(), mostrar }),
    { expirationTtl: 7 * 24 * 60 * 60 },
  );
  await env.LICENCAS.put(`ultima:${instalacao}`, String(pagamento.id), { expirationTtl: 60 * 60 });

  return json({ cobranca: String(pagamento.id), ...mostrar });
}

async function estadoDaCobranca(env, id) {
  if (!/^\d{1,24}$/.test(String(id || ""))) return erro("cobranca invalida");
  const guardada = await env.LICENCAS.get(`cob:${id}`, "json");
  if (!guardada) return erro("cobranca desconhecida", 404);
  if (guardada.status === "pago") return json({ pago: true, status: "pago" });

  // O webhook e o caminho normal; esta consulta e a rede de seguranca para
  // quando a notificacao se perde. Quem manda e sempre o Mercado Pago.
  const pagamento = await mp(env, `/v1/payments/${id}`).catch(() => null);
  if (pagamento && pagamento.status === "approved") {
    await confirmarPagamento(env, pagamento);
    return json({ pago: true, status: "pago" });
  }
  return json({ pago: false, status: (pagamento && pagamento.status) || "pendente" });
}

async function confirmarPagamento(env, pagamento) {
  const id = String(pagamento.id);
  if (pagamento.status !== "approved") return false;
  // Um Pix credita uma vez so, aconteca o que acontecer com as notificacoes.
  if (await env.LICENCAS.get(`pago:${id}`)) return true;

  const guardada = (await env.LICENCAS.get(`cob:${id}`, "json")) || {};
  const meta = pagamento.metadata || {};
  const instalacao = guardada.instalacao || String(meta.instalacao || "");
  const meses = Number(guardada.meses || meta.meses || 1);
  if (!ehInstalacao(instalacao)) return false;

  await creditar(env, instalacao, Math.min(Math.max(meses, 1), 12), guardada.casa || "");
  await env.LICENCAS.put(`pago:${id}`, "1", { expirationTtl: 365 * 24 * 60 * 60 });
  await env.LICENCAS.put(
    `cob:${id}`, JSON.stringify({ ...guardada, status: "pago" }),
    { expirationTtl: 7 * 24 * 60 * 60 },
  );
  return true;
}

async function webhook(req, env, url) {
  const idDaUrl = url.searchParams.get("data.id") || url.searchParams.get("id");
  const corpo = await req.json().catch(() => ({}));
  const id = String((corpo.data && corpo.data.id) || idDaUrl || "");
  if (!id) return json({ ok: true });                 // teste do painel do Mercado Pago

  if (!(await notificacaoAutentica(req, env, id))) return erro("assinatura invalida", 401);

  // Nunca acredita no corpo da notificacao: pergunta ao Mercado Pago.
  const pagamento = await mp(env, `/v1/payments/${encodeURIComponent(id)}`).catch(() => null);
  if (pagamento) await confirmarPagamento(env, pagamento);
  return json({ ok: true });
}

async function entregarLicenca(env, instalacao) {
  if (!ehInstalacao(instalacao)) return erro("codigo de instalacao invalido");
  const guardada = await env.LICENCAS.get(`lic:${instalacao}`, "json");
  if (!guardada) return json({ licenca: null }, 404);
  const licenca = await assinarBilhete(env, { instalacao, ...guardada });
  return json({ licenca, valeAte: guardada.valeAte, casa: guardada.casa || "" });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const caminho = url.pathname.replace(/\/+$/, "") || "/";

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
      });
    }

    try {
      if (caminho === "/" ) return json({ voxly: "servidor de licenca", ok: true });
      if (caminho === "/cobranca" && req.method === "POST") return await criarCobranca(req, env, url);
      if (caminho === "/webhook"  && req.method === "POST") return await webhook(req, env, url);

      const cob = caminho.match(/^\/cobranca\/([^/]+)$/);
      if (cob && req.method === "GET") return await estadoDaCobranca(env, cob[1]);

      const lic = caminho.match(/^\/licenca\/([^/]+)$/);
      if (lic && req.method === "GET") return await entregarLicenca(env, lic[1]);

      return erro("nao encontrado", 404);
    } catch (e) {
      // A mensagem crua pode carregar detalhe do Mercado Pago; fica no log.
      console.error("falha", caminho, e && e.message);
      return erro("nao consegui concluir agora", 500);
    }
  },
};

// Expostos so para os testes (app/test/licenca-servidor.test.js), que conferem
// que o bilhete assinado aqui e exatamente o que o Voxly sabe ler.
export { assinarBilhete, creditar, ehInstalacao, igualSemVazar, confirmarPagamento };
