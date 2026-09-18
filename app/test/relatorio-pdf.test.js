const test = require("node:test");
const assert = require("node:assert");
const { paginaDaNoite, nomeDoArquivo } = require("../src/relatorio-pdf");

const noite = {
  nomeCasa: "Casa do Rock", codigo: "10U7R2",
  inicioPlanejado: new Date(2026, 8, 17, 21, 0).getTime(),
  terminoPlanejado: new Date(2026, 8, 18, 2, 0).getTime(),
  primeiraMusica: new Date(2026, 8, 17, 21, 12).getTime(),
  ultimaMusica: new Date(2026, 8, 18, 1, 48).getTime(),
  participantes: 3, cantaram: 2, pedidos: 4, cantadas: 3, naoCantadas: 1,
  cantores: [
    { nome: "Lady Lu", pediu: 2, cantou: 2 },
    { nome: "Adão", pediu: 1, cantou: 1 },
    { nome: "Só olhou", pediu: 0, cantou: 0 },
  ],
  musicas: [
    { musica: "Plush", artista: "Stone Temple Pilots", cantor: "Lady Lu", dupla: null, horario: new Date(2026, 8, 17, 21, 12).getTime() },
    { musica: "Evidências", artista: "Chitãozinho & Xororó", cantor: "Adão", dupla: "Lady Lu", horario: new Date(2026, 8, 17, 21, 20).getTime() },
  ],
};

test("a pagina traz a casa, o dia, os numeros e cada musica com o cantor", () => {
  const h = paginaDaNoite(noite, { agora: new Date(2026, 8, 18, 10, 0).getTime() });
  for (const trecho of ["Casa do Rock", "quinta, 17/09/2026", "10U7R2", "21:00 às 02:00", "21:12 às 01:48",
                        "Plush", "Lady Lu", "Adão &amp; Lady Lu", "Chitãozinho &amp; Xororó", "Gerado pelo Voxly"])
    assert.ok(h.includes(trecho), trecho);
});

test("quem nao pediu nem cantou nao entra na lista de cantores", () => {
  assert.ok(!paginaDaNoite(noite).includes("Só olhou"));
});

test("nome de cantor nao vira HTML", () => {
  const h = paginaDaNoite({ ...noite, musicas: [{ musica: "<script>x()</script>", artista: "a", cantor: "<img src=x onerror=y>" }] });
  assert.ok(!h.includes("<script>x()"));
  assert.ok(!h.includes("<img src=x"));
});

test("noite vazia ainda gera uma pagina", () => {
  const h = paginaDaNoite({});
  assert.ok(h.includes("Nenhuma música cantada."));
  assert.ok(h.includes("<div class=\"marca\">Voxly</div>"));
});

test("nome do arquivo com a casa e o dia, sem caracteres proibidos", () => {
  assert.strictEqual(nomeDoArquivo(noite), "Voxly - Casa do Rock - 2026-09-17.pdf");
  assert.strictEqual(nomeDoArquivo({ ...noite, nomeCasa: "Bar: A/B?" }), "Voxly - Bar A B - 2026-09-17.pdf");
  assert.strictEqual(nomeDoArquivo({}), "Voxly - noite.pdf");
});
