const test = require("node:test");
const assert = require("node:assert");
const { idDaMaquina, macEstavel, codigoLegivel } = require("../src/instalacao");

const redes = {
  lo0:    [{ mac: "00:00:00:00:00:00", internal: true }],
  en0:    [{ mac: "AC:DE:48:00:11:22", internal: false }],
  utun3:  [{ mac: "ff:ff:ff:ff:ff:ff", internal: false }],
  docker0:[{ mac: "02:42:ac:11:00:02", internal: false }],
};

test("pega a placa de rede de verdade, ignorando VPN, Docker e loopback", () => {
  assert.equal(macEstavel(redes), "ac:de:48:00:11:22");
});

test("maquina sem placa nenhuma ainda tem identidade", () => {
  assert.equal(macEstavel({ lo0: [{ mac: "00:00:00:00:00:00", internal: true }] }), "");
  const id = idDaMaquina({ mac: "", hostname: "pc", platform: "win32", arch: "x64" });
  assert.equal(id.length, 16);
});

test("a mesma maquina da sempre o mesmo codigo", () => {
  const base = { interfaces: redes, hostname: "mac-do-diego", platform: "darwin", arch: "x64" };
  assert.equal(idDaMaquina(base), idDaMaquina({ ...base }));
});

test("maquinas diferentes dao codigos diferentes", () => {
  const a = idDaMaquina({ mac: "aa:bb:cc:dd:ee:ff", hostname: "pc", platform: "win32", arch: "x64" });
  const b = idDaMaquina({ mac: "aa:bb:cc:dd:ee:00", hostname: "pc", platform: "win32", arch: "x64" });
  const c = idDaMaquina({ mac: "aa:bb:cc:dd:ee:ff", hostname: "outro", platform: "win32", arch: "x64" });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("o codigo nao carrega nada da pessoa, so um resumo", () => {
  const id = idDaMaquina({ mac: "aa:bb:cc:dd:ee:ff", hostname: "mac-do-diego", platform: "darwin", arch: "x64" });
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.ok(!id.includes("diego"));
});

test("codigo legivel sai em grupos de quatro", () => {
  assert.equal(codigoLegivel("0123456789abcdef"), "0123-4567-89AB-CDEF");
  assert.equal(codigoLegivel(""), "");
});
