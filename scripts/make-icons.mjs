// Renders scripts/icon.svg into the PNG/ICO app icons. Run: node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next")] }));

const svg = readFileSync(new URL("./icon.svg", import.meta.url));
const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

const out = [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["src/app/apple-icon.png", 180], // Next adds <link rel="apple-touch-icon"> for this file
];
for (const [path, size] of out) writeFileSync(path, await png(size));

// favicon.ico with 16/32/48 PNG frames (ICO container written by hand; no extra deps).
const frames = await Promise.all([16, 32, 48].map(png));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((buf, i) => {
  const size = [16, 32, 48][i], e = 6 + 16 * i;
  header.writeUInt8(size, e); header.writeUInt8(size, e + 1);
  header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(buf.length, e + 8); header.writeUInt32LE(offset, e + 12);
  offset += buf.length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...frames]));
console.log("icons written");
