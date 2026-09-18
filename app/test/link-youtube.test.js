const test = require("node:test");
const assert = require("node:assert");
const { idDoVideo, urlDoVideo } = require("../src/link-youtube");

const ID = "dQw4w9WgXcQ";

test("le o video dos formatos que o navegador e o celular copiam", () => {
  for (const link of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&list=PLabc&index=3`,
    `https://youtube.com/watch?feature=share&v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&si=xyz`,
    `https://youtu.be/${ID}?si=abc123`,
    `youtu.be/${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `  ${ID}  `,
  ]) assert.strictEqual(idDoVideo(link), ID, link);
});

test("recusa o que nao e um video do YouTube", () => {
  for (const link of [
    "", null, "   ", "Evidencias karaoke",
    "https://www.youtube.com/playlist?list=PLabc",
    "https://www.youtube.com/@canal",
    "https://vimeo.com/123456789",
    `https://evil.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    "https://www.youtube.com/watch?v=curto",
  ]) assert.strictEqual(idDoVideo(link), null, String(link));
});

test("devolve o endereco canonico, o mesmo que a busca grava", () => {
  assert.strictEqual(urlDoVideo(ID), `https://www.youtube.com/watch?v=${ID}`);
});
