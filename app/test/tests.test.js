const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const APP_DIR = path.join(__dirname, "..");

test("infraestrutura basica valida", () => {
  assert.ok(fs.existsSync(path.join(APP_DIR, "package-lock.json")), "package-lock.json ausente");
});

test("package.json possui scripts essenciais", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, "package.json"), "utf8"));
  for (const script of ["start", "dev", "build", "build:win", "test", "lint"]) {
    assert.ok(pkg.scripts[script], `script '${script}' ausente`);
  }
});

test("todos os canais IPC do main.js estao expostos no preload.js", () => {
  const main = fs.readFileSync(path.join(APP_DIR, "src/main.js"), "utf8");
  const preload = fs.readFileSync(path.join(APP_DIR, "src/preload.js"), "utf8");

  const canais = [...main.matchAll(/ipcMain\.handle\(\s*["']([\w-]+)["']/g)]
    .map(m => m[1]);

  assert.ok(canais.length > 10, "esperava pelo menos 10 canais IPC");

  // O nome entre aspas: numa funcao exposta ou na lista de canais permitidos.
  // O "|| preload.includes('invoke')" que havia aqui era sempre verdadeiro —
  // um canal esquecido no preload passava.
  const esquecidos = canais.filter(c => !preload.includes(`"${c}"`));
  assert.deepStrictEqual(esquecidos, [], `canais IPC sem porta no preload.js: ${esquecidos.join(", ")}`);
});

test("main.js nao expoe invocacao generica de IPC sem sanitizacao", () => {
  const preload = fs.readFileSync(path.join(APP_DIR, "src/preload.js"), "utf8");
  const genericInvoke = preload.match(/invoke:\s*\(channel[^)]*\)\s*=>\s*ipcRenderer\.invoke\(channel/);
  assert.ok(!genericInvoke, "invocacao generica de IPC exposta no preload — risco de seguranca");
});

test("arquivos das telas existem", () => {
  for (const tela of ["host.html", "player.html", "profile.html"]) {
    assert.ok(
      fs.existsSync(path.join(APP_DIR, "src/screens", tela)),
      `tela '${tela}' ausente`
    );
  }
});

test("preload.js tem sintaxe valida", () => {
  const src = fs.readFileSync(path.join(APP_DIR, "src/preload.js"), "utf8");
  assert.doesNotThrow(() => new Function(src.replace(/^const .*require.*$/m, "")), "erro de sintaxe");
});