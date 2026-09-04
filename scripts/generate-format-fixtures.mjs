// SPDX-License-Identifier: GPL-2.0-or-later
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SpzWriter } from "@sparkjsdev/spark";

// Original deterministic geometry: an 8x8 colored Gaussian grid. No external scene data.
const output = path.resolve(import.meta.dirname, "../public/samples");
const points = Array.from({ length: 64 }, (_, i) => {
  const u = (i % 8) / 7;
  const v = Math.floor(i / 8) / 7;
  return { x: u * 2 - 1, y: v * 2 - 1, z: Math.sin(u * Math.PI) * 0.2,
    r: 0.1 + u * 0.8, g: 0.1 + v * 0.8, b: 0.5, scale: 0.07, alpha: 0.9 };
});
const encodeFloats = (values) => {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => bytes.writeFloatLE(value, i * 4));
  return bytes;
};
const properties = ["x", "y", "z", "nx", "ny", "nz", "f_dc_0", "f_dc_1", "f_dc_2", "opacity",
  "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"];
const header = `ply\nformat binary_little_endian 1.0\ncomment Original obs-3dgs test fixture GPL-2.0-or-later\nelement vertex ${points.length}\n${properties.map(p => `property float ${p}\n`).join("")}end_header\n`;
const ply = Buffer.concat([Buffer.from(header), ...points.map(p => encodeFloats([
  p.x, p.y, p.z, 0, 0, 0, (p.r - 0.5) / 0.28209479177387814, (p.g - 0.5) / 0.28209479177387814,
  (p.b - 0.5) / 0.28209479177387814, Math.log(p.alpha / (1 - p.alpha)),
  Math.log(p.scale), Math.log(p.scale), Math.log(p.scale), 1, 0, 0, 0
]))]);
const chunkProperties = ["min_x", "min_y", "min_z", "max_x", "max_y", "max_z",
  "min_scale_x", "min_scale_y", "min_scale_z", "max_scale_x", "max_scale_y", "max_scale_z",
  "min_r", "min_g", "min_b", "max_r", "max_g", "max_b"];
const compressedHeader = `ply\nformat binary_little_endian 1.0\nelement chunk 1\n${chunkProperties.map(p => `property float ${p}\n`).join("")}element vertex ${points.length}\n${["packed_position", "packed_rotation", "packed_scale", "packed_color"].map(p => `property uint ${p}\n`).join("")}end_header\n`;
const scale = Math.log(points[0].scale);
const compressed = Buffer.concat([Buffer.from(compressedHeader), encodeFloats([
  -1, -1, 0, 1, 1, 0.2, scale, scale, scale, scale, scale, scale, 0, 0, 0, 1, 1, 1
]), ...points.map(p => {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32LE(((Math.round((p.x + 1) / 2 * 2047) << 21) |
    (Math.round((p.y + 1) / 2 * 1023) << 11) | Math.round(p.z / 0.2 * 2047)) >>> 0, 0);
  bytes.writeUInt32LE(((512 << 20) | (512 << 10) | 512) >>> 0, 4);
  bytes.writeUInt32LE(0, 8);
  bytes.writeUInt32LE(((Math.round(p.r * 255) << 24) | (Math.round(p.g * 255) << 16) |
    (Math.round(p.b * 255) << 8) | Math.round(p.alpha * 255)) >>> 0, 12);
  return bytes;
})]);
const writer = new SpzWriter({ numSplats: points.length, shDegree: 0 });
points.forEach((p, i) => {
  writer.setCenter(i, p.x, p.y, p.z);
  writer.setAlpha(i, p.alpha);
  writer.setRgb(i, p.r, p.g, p.b);
  writer.setScale(i, p.scale, p.scale, p.scale);
  writer.setQuat(i, 0, 0, 0, 1);
});
const splat = Buffer.concat(points.map(p => Buffer.concat([
  encodeFloats([p.x, p.y, p.z, p.scale, p.scale, p.scale]),
  Buffer.from([p.r * 255, p.g * 255, p.b * 255, p.alpha * 255, 255, 128, 128, 128])
])));
const ksplatHeader = Buffer.alloc(4096 + 1024);
ksplatHeader.writeUInt8(1, 1);
ksplatHeader.writeUInt32LE(1, 4);
ksplatHeader.writeUInt32LE(1, 8);
ksplatHeader.writeUInt32LE(points.length, 12);
ksplatHeader.writeUInt32LE(points.length, 16);
ksplatHeader.writeUInt32LE(points.length, 4096);
ksplatHeader.writeUInt32LE(points.length, 4100);
const ksplat = Buffer.concat([ksplatHeader, ...points.map(p => Buffer.concat([
  encodeFloats([p.x, p.y, p.z, p.scale, p.scale, p.scale, 1, 0, 0, 0]),
  Buffer.from([p.r * 255, p.g * 255, p.b * 255, p.alpha * 255])
]))]);
// Minimal single-file RAD fixture: uncompressed float32 columns, no external chunks.
const descriptor = (magic, metadata) => {
  const json = Buffer.from(JSON.stringify(metadata));
  const prefix = Buffer.alloc(8);
  prefix.write(magic);
  prefix.writeUInt32LE(json.length, 4);
  return Buffer.concat([prefix, json, Buffer.alloc(Math.ceil(json.length / 8) * 8 - json.length)]);
};
const columns = [
  ["center", [points.map(p => p.x), points.map(p => p.y), points.map(p => p.z)]],
  ["alpha", [points.map(p => p.alpha)]],
  ["rgb", [points.map(p => p.r), points.map(p => p.g), points.map(p => p.b)]],
  ["scales", Array.from({ length: 3 }, () => points.map(p => p.scale))],
  ["orientation", Array.from({ length: 3 }, () => points.map(() => 0))]
].map(([property, values]) => ({ property, bytes: encodeFloats(values.flat()) }));
let payloadSize = 0;
const radProperties = columns.map(column => {
  const property = { property: column.property, encoding: "f32", offset: payloadSize, bytes: column.bytes.length };
  payloadSize += column.bytes.length;
  return property;
});
const payloadSizeBytes = Buffer.alloc(8);
payloadSizeBytes.writeBigUInt64LE(BigInt(payloadSize));
const chunk = Buffer.concat([descriptor("RADC", { version: 1, base: 0, count: points.length,
  payloadBytes: payloadSize, maxSh: 0, properties: radProperties }), payloadSizeBytes, ...columns.map(column => column.bytes)]);
const rad = Buffer.concat([descriptor("RAD0", { version: 1, type: "gsplat", count: points.length,
  maxSh: 0, chunkSize: 65536, allChunkBytes: chunk.length, chunks: [{ offset: 0, bytes: chunk.length, base: 0, count: points.length }] }), chunk]);
await mkdir(output, { recursive: true });
for (const [name, bytes] of Object.entries({ "format-grid.ply": ply, "format-grid-compressed.ply": compressed,
  "format-grid.spz": await writer.finalize(), "format-grid.splat": splat, "format-grid.ksplat": ksplat, "format-grid.rad": rad })) {
  await writeFile(path.join(output, name), bytes);
  console.log(`${name}: ${bytes.length} bytes`);
}
