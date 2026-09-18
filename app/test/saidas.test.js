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

// ── Som da casa que nao foge (espelhar para a TV) ──────────
const interface_ = { kind: "audiooutput", deviceId: "iface", groupId: "g-iface", label: "Interface" };
const tv         = { kind: "audiooutput", deviceId: "tv", groupId: "g-tv", label: "TV (AirPlay)" };
const padraoEm = g => ({ kind: "audiooutput", deviceId: "default", groupId: g, label: "Padrão" });
const { aparelhoDoPadrao, saidaEfetiva } = require("../src/saidas");

test("acha o aparelho de verdade por tras do 'padrao'", () => {
  assert.equal(aparelhoDoPadrao([padraoEm("g-iface"), interface_, tv]), "iface");
  assert.equal(aparelhoDoPadrao([padraoEm("g-tv"), interface_, tv]), "tv");
  assert.equal(aparelhoDoPadrao([interface_]), "");
});

test("no 'padrao', o Palco fixa o aparelho da hora e nao segue o sistema depois", () => {
  const antes = saidaEfetiva({ escolhida: "", fixada: "", dispositivos: [padraoEm("g-iface"), interface_] });
  assert.deepEqual(antes, { id: "iface", motivo: "fixou-agora" });
  // Espelhou para a TV: o macOS mudou o padrao para ela.
  const depois = saidaEfetiva({ escolhida: "", fixada: antes.id, dispositivos: [padraoEm("g-tv"), interface_, tv] });
  assert.deepEqual(depois, { id: "iface", motivo: "fixada" });
});

test("se o aparelho fixado sumir, vai para o padrao da hora e avisa", () => {
  const r = saidaEfetiva({ escolhida: "", fixada: "iface", dispositivos: [padraoEm("g-tv"), tv] });
  assert.deepEqual(r, { id: "tv", motivo: "fixada-sumiu" });
});

test("saida escolhida pelo KJ vale enquanto estiver conectada", () => {
  assert.deepEqual(saidaEfetiva({ escolhida: "iface", dispositivos: [padraoEm("g-tv"), interface_, tv] }), { id: "iface", motivo: "escolhida" });
  assert.deepEqual(saidaEfetiva({ escolhida: "iface", dispositivos: [padraoEm("g-tv"), tv] }), { id: "tv", motivo: "escolhida-sumiu" });
});
