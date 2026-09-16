const test = require("node:test");
const assert = require("node:assert");
const pix = require("../src/pix");

test("CRC16 bate com o exemplo do manual do Banco Central", () => {
  const exemplo = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
  assert.equal(pix.crc16(exemplo), "1D3D");
});

test("CRC16 do vetor classico 123456789", () => {
  assert.equal(pix.crc16("123456789"), "29B1");
});

test("monta o copia-e-cola e le de volta o que cobra", () => {
  const codigo = pix.gerarBrCode({
    chave: "diego@exemplo.com", nome: "Diego Souza", cidade: "São Paulo", valor: "15,00", txid: "VOXLY-ABC123",
  });
  const lido = pix.lerBrCode(codigo);
  assert.deepEqual(lido, { chave: "diego@exemplo.com", valor: 15, nome: "DIEGO SOUZA", cidade: "SAO PAULO", txid: "VOXLYABC123" });
  assert.ok(codigo.startsWith("000201"));
});

test("um caractere trocado e o codigo nao passa mais", () => {
  const codigo = pix.gerarBrCode({ chave: "diego@exemplo.com", nome: "Diego", cidade: "SP", valor: 10 });
  const adulterado = codigo.replace("10.00", "01.00");
  assert.equal(pix.lerBrCode(adulterado), null);
});

test("chave: e-mail, aleatoria, CPF, CNPJ e celular", () => {
  assert.deepEqual(pix.normalizarChave(" Diego@Exemplo.com "), { tipo: "email", chave: "diego@exemplo.com" });
  assert.deepEqual(pix.normalizarChave("123E4567-E12B-12D1-A456-426655440000"), { tipo: "aleatoria", chave: "123e4567-e12b-12d1-a456-426655440000" });
  assert.deepEqual(pix.normalizarChave("529.982.247-25"), { tipo: "cpf", chave: "52998224725" });
  assert.deepEqual(pix.normalizarChave("11.222.333/0001-81"), { tipo: "cnpj", chave: "11222333000181" });
  assert.deepEqual(pix.normalizarChave("(11) 98765-4321"), { tipo: "telefone", chave: "+5511987654321" });
  assert.deepEqual(pix.normalizarChave("+55 11 98765-4321"), { tipo: "telefone", chave: "+5511987654321" });
});

test("chave que nao e chave nao vira QR", () => {
  for (const ruim of ["", "abc", "123.456.789-00", "000.000.000-00", "+1 555 1234", "diego@", "12345"]) {
    assert.equal(pix.normalizarChave(ruim), null, `devia recusar: ${ruim}`);
  }
  assert.throws(() => pix.gerarBrCode({ chave: "abc", nome: "D", valor: 10 }), /chave/);
});

test("valor: aceita virgula e ponto, recusa zero, negativo e absurdo", () => {
  assert.equal(pix.valorPix("15"), "15.00");
  assert.equal(pix.valorPix("15,5"), "15.50");
  assert.equal(pix.valorPix(7.999), "8.00");
  assert.equal(pix.valorPix("1.250,00"), "1250.00");
  for (const ruim of [0, -5, "abc", "", null, 50000]) assert.equal(pix.valorPix(ruim), null, String(ruim));
});

test("nome e cidade saem sem acento, maiusculos e no tamanho do Pix", () => {
  const codigo = pix.gerarBrCode({
    chave: "diego@exemplo.com", nome: "Karaokê do João da Esquina Longa Demais", cidade: "São José dos Campos", valor: 10,
  });
  const lido = pix.lerBrCode(codigo);
  assert.equal(lido.nome, "KARAOKE DO JOAO DA ESQUIN");
  assert.equal(lido.nome.length, 25);
  assert.equal(lido.cidade, "SAO JOSE DOS CA");
});

test("sem nome de quem recebe nao gera", () => {
  assert.throws(() => pix.gerarBrCode({ chave: "diego@exemplo.com", nome: "  ", valor: 10 }), /nome/);
});
