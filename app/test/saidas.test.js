"use strict";

// Saidas de audio do Voxly: a principal (o som da casa) e a de monitoria (o
// fone do KJ, para ouvir a previa de uma versao antes de baixar). A regra de
// ouro: a previa NUNCA pode sair no som da casa.

const test = require("node:test");
const assert = require("node:assert");
const { saidasDeAudio, monitoriaSegura } = require("../src/saidas");

// Formato real do enumerateDevices do Electron: "default" e um apelido do
// aparelho padrao, com o mesmo groupId.
const DISPOSITIVOS = [
  { kind: "audioinput",  deviceId: "mic1",    groupId: "g-mac",  label: "Microfone (MacBook Pro)" },
  { kind: "audiooutput", deviceId: "default", groupId: "g-mac",  label: "Default - Alto-falantes (MacBook Pro)" },
  { kind: "audiooutput", deviceId: "mac",     groupId: "g-mac",  label: "Alto-falantes (MacBook Pro)" },
  { kind: "audiooutput", deviceId: "scarlett",groupId: "g-sc",   label: "Scarlett 2i2 USB" },
  { kind: "audiooutput", deviceId: "fone",    groupId: "g-bt",   label: "AirPods do Diego" },
];

test("lista só as saídas de verdade, sem o apelido 'default' e sem microfones", () => {
  assert.deepStrictEqual(saidasDeAudio(DISPOSITIVOS).map(s => s.id), ["mac", "scarlett", "fone"]);
  assert.strictEqual(saidasDeAudio(DISPOSITIVOS)[1].nome, "Scarlett 2i2 USB");
});

test("saída sem nome ganha um nome legível", () => {
  const r = saidasDeAudio([{ kind: "audiooutput", deviceId: "x", groupId: "g", label: "" }]);
  assert.strictEqual(r[0].nome, "Saída de áudio 1");
});

test("fone escolhido, casa na Scarlett: pode ouvir a prévia", () => {
  assert.deepStrictEqual(monitoriaSegura({ monitorId: "fone", principalId: "scarlett", dispositivos: DISPOSITIVOS }), { ok: true });
});

test("sem saída de monitoria escolhida: não toca", () => {
  const r = monitoriaSegura({ monitorId: "", principalId: "scarlett", dispositivos: DISPOSITIVOS });
  assert.strictEqual(r.ok, false);
  assert.match(r.motivo, /Config/);
});

test("'padrão do sistema' não serve de monitoria: ele muda sozinho quando um fone conecta", () => {
  assert.strictEqual(monitoriaSegura({ monitorId: "default", principalId: "scarlett", dispositivos: DISPOSITIVOS }).ok, false);
});

test("monitoria na mesma saída da casa: não toca", () => {
  const r = monitoriaSegura({ monitorId: "scarlett", principalId: "scarlett", dispositivos: DISPOSITIVOS });
  assert.strictEqual(r.ok, false);
  assert.match(r.motivo, /casa/);
});

test("casa no 'padrão do sistema' e monitoria no aparelho que É o padrão: vazaria, não toca", () => {
  // "default" e "mac" sao o mesmo aparelho fisico (mesmo groupId).
  assert.strictEqual(monitoriaSegura({ monitorId: "mac", principalId: "", dispositivos: DISPOSITIVOS }).ok, false);
  assert.strictEqual(monitoriaSegura({ monitorId: "mac", principalId: "default", dispositivos: DISPOSITIVOS }).ok, false);
});

test("casa no padrão (Mac) e monitoria no fone: pode", () => {
  assert.strictEqual(monitoriaSegura({ monitorId: "fone", principalId: "", dispositivos: DISPOSITIVOS }).ok, true);
});

test("fone desconectado: não toca (o navegador jogaria o som no padrão, que é a casa)", () => {
  const semFone = DISPOSITIVOS.filter(d => d.deviceId !== "fone");
  const r = monitoriaSegura({ monitorId: "fone", principalId: "scarlett", dispositivos: semFone });
  assert.strictEqual(r.ok, false);
  assert.match(r.motivo, /conectad/);
});

test("lista de dispositivos vazia ou torta: não toca", () => {
  assert.strictEqual(monitoriaSegura({ monitorId: "fone", principalId: "", dispositivos: null }).ok, false);
});

// A saida da casa escolhida (Scarlett) desconectada: o Palco cai no padrao do
// sistema. Se a monitoria for justamente o aparelho padrao, a previa sairia na
// casa — a regra tem que tratar a casa como o padrao nesse caso.
test("casa escolhida desconectada: ela vira o padrão, e monitoria no padrão não pode", () => {
  const semScarlett = DISPOSITIVOS.filter(d => d.deviceId !== "scarlett");
  assert.strictEqual(monitoriaSegura({ monitorId: "mac", principalId: "scarlett", dispositivos: semScarlett }).ok, false);
  assert.strictEqual(monitoriaSegura({ monitorId: "fone", principalId: "scarlett", dispositivos: semScarlett }).ok, true);
});
