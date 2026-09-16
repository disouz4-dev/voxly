"use strict";

// Pix "copia e cola" (BR Code estatico), montado aqui mesmo, sem API e sem
// intermediario: o dinheiro cai direto na chave do KJ (Nubank, Ton, qualquer
// banco). O preco disso e que nenhum banco avisa o Voxly que o Pix caiu — quem
// confirma e o KJ, na Gerencia (ver entrada.js).
//
// Formato do Banco Central (EMV QRCPS-MPM): cada campo e ID de 2 digitos +
// tamanho de 2 digitos + valor, e o codigo termina num CRC16 de tudo que veio
// antes. Um caractere errado e o app do banco recusa o QR.

const LIMITE_NOME   = 25;
const LIMITE_CIDADE = 15;
const LIMITE_TXID   = 25;

function campo(id, valor) {
  const v = String(valor);
  if (v.length > 99) throw new Error(`campo ${id} grande demais`);
  return id + String(v.length).padStart(2, "0") + v;
}

// CRC16-CCITT (polinomio 0x1021, inicio 0xFFFF), como pede o manual do Pix.
function crc16(texto) {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Nome e cidade vao sem acento e em maiusculas: varios apps de banco recusam
// ou embaralham caractere fora do ASCII nesses campos.
function semAcento(texto, limite) {
  return String(texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, limite);
}

// Entende a chave do jeito que o KJ digitar e devolve no formato do Pix.
// Devolve { tipo, chave } ou null quando nao da para saber o que e.
function normalizarChave(entrada) {
  const bruto = String(entrada || "").trim();
  if (!bruto) return null;

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bruto)) {
    return { tipo: "aleatoria", chave: bruto.toLowerCase() };
  }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(bruto)) {
    return { tipo: "email", chave: bruto.toLowerCase() };
  }
  if (bruto.startsWith("+")) {
    const d = bruto.replace(/\D/g, "");
    return /^55\d{10,11}$/.test(d) ? { tipo: "telefone", chave: "+" + d } : null;
  }
  const d = bruto.replace(/\D/g, "");
  // Pontuacao de CPF/CNPJ ("123.456.789-09") denuncia o tipo.
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(bruto)) return cpfValido(d) ? { tipo: "cpf", chave: d } : null;
  if (/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(bruto)) return cnpjValido(d) ? { tipo: "cnpj", chave: d } : null;
  if (d.length === 14 && cnpjValido(d)) return { tipo: "cnpj", chave: d };
  if (d.length === 11 && cpfValido(d)) return { tipo: "cpf", chave: d };
  // Celular sem +55: "(11) 98765-4321" ou "11987654321".
  if ((d.length === 10 || d.length === 11) && /[()\s-]/.test(bruto) || (d.length === 11 && d[2] === "9")) {
    return { tipo: "telefone", chave: "+55" + d };
  }
  return null;
}

function cpfValido(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpjValido(d) {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n) => {
    const pesos = n === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const soma = pesos.reduce((s, p, i) => s + Number(d[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

// Reais com duas casas e ponto, como pede o Pix. Aceita "15", "15,5", 15.5.
function valorPix(valor) {
  const n = typeof valor === "number" ? valor : Number(String(valor || "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 10000) return null;
  return (Math.round(n * 100) / 100).toFixed(2);
}

// txid: so letras e numeros. Ajuda o KJ a achar o Pix no extrato quando o
// banco mostra o identificador.
function txidDe(texto) {
  const t = String(texto || "").replace(/[^A-Za-z0-9]/g, "").slice(0, LIMITE_TXID);
  return t || "***";
}

function gerarBrCode({ chave, nome, cidade, valor, txid, descricao } = {}) {
  const k = normalizarChave(chave);
  if (!k) throw new Error("chave Pix invalida");
  const v = valor == null ? null : valorPix(valor);
  if (valor != null && !v) throw new Error("valor invalido");
  const n = semAcento(nome, LIMITE_NOME);
  if (!n) throw new Error("informe o nome de quem recebe");
  const c = semAcento(cidade, LIMITE_CIDADE) || "BRASIL";

  let conta = campo("00", "br.gov.bcb.pix") + campo("01", k.chave);
  const desc = semAcento(descricao, 40);
  if (desc) conta += campo("02", desc);

  const semCrc =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    (v ? campo("54", v) : "") +
    campo("58", "BR") +
    campo("59", n) +
    campo("60", c) +
    campo("62", campo("05", txidDe(txid))) +
    "6304";
  return semCrc + crc16(semCrc);
}

// Le um BR Code de volta (usado nos testes e para mostrar ao KJ o que o QR
// cobra de verdade). So o primeiro nivel e o que interessa.
function lerBrCode(codigo) {
  const s = String(codigo || "");
  if (s.length < 8 || crc16(s.slice(0, -4)) !== s.slice(-4)) return null;
  const campos = {};
  let i = 0;
  while (i < s.length - 4) {
    const id = s.slice(i, i + 2);
    const tam = Number(s.slice(i + 2, i + 4));
    if (!Number.isInteger(tam)) return null;
    campos[id] = s.slice(i + 4, i + 4 + tam);
    i += 4 + tam;
  }
  const sub = (texto) => {
    const r = {}; let j = 0;
    while (j < texto.length) {
      const id = texto.slice(j, j + 2); const tam = Number(texto.slice(j + 2, j + 4));
      r[id] = texto.slice(j + 4, j + 4 + tam); j += 4 + tam;
    }
    return r;
  };
  const conta = sub(campos["26"] || "");
  return {
    chave:  conta["01"] || null,
    valor:  campos["54"] ? Number(campos["54"]) : null,
    nome:   campos["59"] || null,
    cidade: campos["60"] || null,
    txid:   sub(campos["62"] || "")["05"] || null,
  };
}

module.exports = {
  crc16, normalizarChave, cpfValido, cnpjValido, valorPix, txidDe, semAcento, gerarBrCode, lerBrCode,
};
