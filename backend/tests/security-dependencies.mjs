import assert from 'node:assert/strict';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import proxyaddr from 'proxy-addr';
import { makeAvatar, makeLogo, makeThumbnail, isProcessableImage } from '../dist/services/image.service.js';

assert.equal(sharp.versions.sharp, '0.35.5');
const source = await sharp({ create: { width: 640, height: 480, channels: 4, background: '#ff000080' } }).png().toBuffer();
for (const transform of [makeAvatar, makeLogo, makeThumbnail]) {
  const result = await transform(source);
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, result.width);
  assert.equal(metadata.height, result.height);
  assert.equal(metadata.exif, undefined);
}
assert.equal(await isProcessableImage(Buffer.from('invalid image')), false);
await assert.rejects(makeAvatar(Buffer.from('invalid image')));
const trust = (_address, hop) => hop < 1;
assert.equal(proxyaddr({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '198.51.100.10, 203.0.113.20' } }, trust), '203.0.113.20');
const app = express();
app.post('/upload', multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } }).single('file'), (req, res) => res.json({ bytes: req.file.size }));
app.use((error, _req, res, _next) => res.status(400).json({ code: error.code }));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
try {
  const upload = async bytes => {
    const body = new FormData();
    body.append('file', new Blob([bytes]), 'test.png');
    return fetch(`http://127.0.0.1:${server.address().port}/upload`, { method: 'POST', body });
  };
  const response = await upload(source);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).bytes, source.length);
  const oversized = await upload(Buffer.alloc(1024 * 1024 + 1));
  assert.equal(oversized.status, 400);
  assert.equal((await oversized.json()).code, 'LIMIT_FILE_SIZE');
} finally { await new Promise(resolve => server.close(resolve)); }
console.log('PASS: Sharp, derivados WebP, imagen invalida, proxy de un salto, multipart en memoria y limite de carga. Sin servicios externos.');
