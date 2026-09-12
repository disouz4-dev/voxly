// Licenca do Voxly: a casa paga por mes e recebe um bilhete assinado.
//
// Tres coisas guiam este arquivo, nessa ordem:
//
// 1. O SHOW NUNCA PARA. Licenca nao se checa durante a noite. A conta e feita
//    uma vez, na hora de ABRIR a sessao. Se a internet do bar cair, se o
//    servidor sair do ar, se o pagamento atrasar no banco — a noite que ja
//    esta rolando segue ate o fim, e ainda ha dias de tolerancia depois do
//    vencimento antes de travar qualquer coisa.
// 2. FUNCIONA SEM INTERNET. O bilhete traz a data de validade dentro dele e
//    vem assinado. O app confere a assinatura sozinho, com a chave publica que
//    veio junto no pacote. Nao existe "ligar para casa" para poder tocar.
// 3. A CHAVE PRIVADA NAO MORA AQUI. Quem assina e o servidor de licenca. O app
//    so sabe conferir. Nem lendo o codigo inteiro do Voxly alguem fabrica um
//    bilhete.
//
// Formato do bilhete (uma linha so, da para mandar por WhatsApp):
//   VOXLY1.<dados em base64url>.<assinatura em base64url>
// Dados: { i: instalacao, c: casa, p: plano, e: emitida em, v: vale ate, n: n. da emissao }

const MARCA = "VOXLY1";

const DIA = 24 * 60 * 60 * 1000;
const PADROES = {
  diasDeTeste:     14,   // experimenta sem pagar nada, sem cartao, sem cadastro
  diasDeAviso:      7,   // a partir daqui a tela avisa que esta pertinho
  diasDeTolerancia: 7,   // vencida mas sem conseguir falar com o servidor: ainda abre
};

// ── Ler o bilhete ──────────────────────────────────────────

function deBase64url(s) {
  return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function paraBase64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Separa o bilhete em partes sem conferir nada. Quem confere e abrirLicenca.
function partesDaLicenca(texto) {
  const partes = String(texto || "").trim().split(".");
  if (partes.length !== 3 || partes[0] !== MARCA) return null;
  return { corpo: partes[1], assinatura: partes[2] };
}

// Confere a assinatura e devolve os dados. `verificar` recebe
// (bytesDoCorpo, bytesDaAssinatura) e devolve true/false — quem passa isso e o
// main.js, com o crypto do Node. Assim este arquivo continua testavel sozinho.
function abrirLicenca(texto, verificar) {
  const p = partesDaLicenca(texto);
  if (!p) return { ok: false, motivo: "formato" };
  let dados;
  try {
    dados = JSON.parse(deBase64url(p.corpo).toString("utf8"));
  } catch (_) { return { ok: false, motivo: "ilegivel" }; }
  let assinaturaOk = false;
  try {
    assinaturaOk = !!verificar(Buffer.from(p.corpo, "utf8"), deBase64url(p.assinatura));
  } catch (_) { assinaturaOk = false; }
  if (!assinaturaOk) return { ok: false, motivo: "assinatura" };
  if (typeof dados.v !== "number" || !dados.i) return { ok: false, motivo: "incompleto" };
  return {
    ok: true,
    instalacao: String(dados.i),
    casa:       dados.c ? String(dados.c) : "",
    plano:      dados.p ? String(dados.p) : "mensal",
    emitidaEm:  Number(dados.e) || 0,
    valeAte:    Number(dados.v),
    emissao:    Number(dados.n) || 1,
  };
}

// ── Relogio ────────────────────────────────────────────────
// Atrasar o relogio do computador e a maneira obvia de esticar uma licenca.
// Contra isso o app guarda a maior data que ja viu: o tempo pode adiantar, mas
// nao anda para tras. A folga de um dia existe porque fuso, horario de verao e
// acerto de NTP mexem no relogio por motivo honesto.
function relogioDe(agora, ultimaVista) {
  const a = Number(agora) || 0;
  const u = Number(ultimaVista) || 0;
  return a < u - DIA ? u : a;
}

// ── O estado que a tela mostra e a regra que trava ─────────

function diasAte(alvo, agora) {
  return Math.ceil((alvo - agora) / DIA);
}

function estadoDaLicenca(e = {}) {
  const opcoes = { ...PADROES, ...(e.opcoes || {}) };
  const agora  = relogioDe(e.agora, e.ultimaVista);

  // Sem chave de producao configurada o Voxly nao cobra nada: e o mesmo app de
  // sempre. Serve para o desenvolvimento e para instalacao caseira.
  if (!e.cobrando) {
    return { situacao: "aberto", podeAbrirSessao: true, diasRestantes: null, valeAte: null, casa: "", aviso: "" };
  }

  const lic = e.licenca || null;

  if (lic && lic.instalacao && e.instalacao && lic.instalacao !== e.instalacao) {
    return {
      situacao: "outra-maquina", podeAbrirSessao: false, diasRestantes: null,
      valeAte: lic.valeAte, casa: lic.casa || "",
      aviso: "Esta licenca foi emitida para outro computador.",
    };
  }

  if (lic && lic.valeAte > agora) {
    const dias = diasAte(lic.valeAte, agora);
    return {
      situacao: dias <= opcoes.diasDeAviso ? "vencendo" : "ativa",
      podeAbrirSessao: true, diasRestantes: dias, valeAte: lic.valeAte, casa: lic.casa || "",
      aviso: dias <= opcoes.diasDeAviso
        ? `A licenca vence em ${dias} dia${dias === 1 ? "" : "s"}.` : "",
    };
  }

  // Nunca houve licenca: vale o periodo de teste, contado da instalacao.
  if (!lic) {
    const fimDoTeste = (Number(e.instaladoEm) || agora) + opcoes.diasDeTeste * DIA;
    if (fimDoTeste > agora) {
      const dias = diasAte(fimDoTeste, agora);
      return {
        situacao: "teste", podeAbrirSessao: true, diasRestantes: dias, valeAte: fimDoTeste, casa: "",
        aviso: `Periodo de teste: ${dias} dia${dias === 1 ? "" : "s"}.`,
      };
    }
    return {
      situacao: "sem-licenca", podeAbrirSessao: false, diasRestantes: 0, valeAte: fimDoTeste, casa: "",
      aviso: "O periodo de teste terminou.",
    };
  }

  // Venceu. Antes de travar, a tolerancia: se o app nao conseguiu falar com o
  // servidor desde o vencimento, o problema pode nao ser do cliente — internet
  // do bar, servidor fora do ar, pagamento que demorou a compensar. Travar a
  // noite de alguem que pagou e pior do que deixar passar uma semana de graca.
  const semContatoDesde = Number(e.ultimoContato) || 0;
  const dentroDaTolerancia = semContatoDesde < lic.valeAte
    && agora < lic.valeAte + opcoes.diasDeTolerancia * DIA;
  if (dentroDaTolerancia) {
    const dias = diasAte(lic.valeAte + opcoes.diasDeTolerancia * DIA, agora);
    return {
      situacao: "tolerancia", podeAbrirSessao: true, diasRestantes: dias, valeAte: lic.valeAte,
      casa: lic.casa || "",
      aviso: `A licenca venceu e o Voxly nao conseguiu conferir o pagamento. Ainda da para abrir por ${dias} dia${dias === 1 ? "" : "s"}.`,
    };
  }

  return {
    situacao: "vencida", podeAbrirSessao: false, diasRestantes: 0, valeAte: lic.valeAte,
    casa: lic.casa || "", aviso: "A licenca venceu.",
  };
}

// Texto curto para a barra do topo. Vazio = nao precisa incomodar o KJ.
function recadoDoTopo(estado) {
  if (!estado) return "";
  switch (estado.situacao) {
    case "teste":        return `Teste · ${estado.diasRestantes}d`;
    case "vencendo":     return `Licenca vence em ${estado.diasRestantes}d`;
    case "tolerancia":   return "Licenca vencida · tolerancia";
    case "vencida":      return "Licenca vencida";
    case "sem-licenca":  return "Teste terminado";
    case "outra-maquina":return "Licenca de outro computador";
    default:             return "";
  }
}

module.exports = {
  MARCA, DIA, PADROES,
  paraBase64url, deBase64url, partesDaLicenca,
  abrirLicenca, relogioDe, estadoDaLicenca, recadoDoTopo,
};
