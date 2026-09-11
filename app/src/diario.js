"use strict";

// Diario do Voxly: uma linha JSON por acontecimento, um arquivo por dia. Nasceu
// do "as musicas sumiram" de 11/09, que nao teve como ser explicado depois —
// nada registrava quem tirou os pedidos da fila, nem de qual maquina.
//
// Aqui fica so o formato (testavel); quem grava e o processo principal. A
// Gerencia carrega o mesmo arquivo para calcular o que mudou em cada pedido.

(function (raiz) {

const LIMITE_TEXTO = 2000;   // um console.log de 1 MB nao pode inchar o diario

function doisDig(n) { return String(n).padStart(2, "0"); }

function nomeDoArquivo(data = new Date()) {
  return `voxly-${data.getFullYear()}-${doisDig(data.getMonth() + 1)}-${doisDig(data.getDate())}.jsonl`;
}

// Serializa qualquer coisa sem nunca lancar: erro vira mensagem e pilha,
// referencia circular vira marca, texto longo e cortado.
function limpar(valor, vistos = new WeakSet(), prof = 0) {
  if (valor == null || typeof valor === "boolean" || typeof valor === "number") return valor;
  if (typeof valor === "string") return valor.length > LIMITE_TEXTO ? valor.slice(0, LIMITE_TEXTO) + "…" : valor;
  if (typeof valor === "bigint") return String(valor);
  if (typeof valor === "function") return "[funcao]";
  if (valor instanceof Error) return { mensagem: valor.message, pilha: limpar(String(valor.stack || ""), vistos, prof + 1) };
  if (typeof valor.toMillis === "function") return valor.toMillis();   // Timestamp do Firestore
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor !== "object") return String(valor);
  if (vistos.has(valor)) return "[circular]";
  if (prof > 6) return "[fundo demais]";
  vistos.add(valor);
  if (Array.isArray(valor)) return valor.slice(0, 200).map(v => limpar(v, vistos, prof + 1));
  const saida = {};
  for (const k of Object.keys(valor).slice(0, 100)) saida[k] = limpar(valor[k], vistos, prof + 1);
  return saida;
}

function linhaDoDiario({ t = Date.now(), origem = "main", evento, dados, nivel = "info" } = {}) {
  const d = new Date(t);
  const hora = `${doisDig(d.getHours())}:${doisDig(d.getMinutes())}:${doisDig(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
  // JSON.stringify ja escapa \n dentro das strings: a linha nunca quebra.
  return JSON.stringify({ t, hora, nivel, origem, evento, dados: limpar(dados) });
}

const RE_ARQUIVO = /^voxly-(\d{4})-(\d{2})-(\d{2})\.jsonl$/;

function arquivosVencidos(nomes, hoje = new Date(), dias = 30) {
  const limite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - dias).getTime();
  return (nomes || []).filter(n => {
    const m = RE_ARQUIVO.exec(n);
    if (!m) return false;
    // "Guarda 30 dias" conta hoje: o dia exatamente 30 atras ja sai.
    return new Date(+m[1], +m[2] - 1, +m[3]).getTime() <= limite;
  });
}

// O que mudou entre duas versoes de um documento: { campo: [antes, depois] }.
function diferencas(antes, depois) {
  const a = antes || {}, b = depois || {};
  const valor = v => (v && typeof v.toMillis === "function") ? v.toMillis() : v;
  const saida = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = valor(a[k]), y = valor(b[k]);
    if (JSON.stringify(x) !== JSON.stringify(y)) saida[k] = [x, y];
  }
  return saida;
}

const api = { linhaDoDiario, nomeDoArquivo, arquivosVencidos, diferencas, limpar };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyDiario = api;

})(globalThis);
