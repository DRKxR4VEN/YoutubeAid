const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, drawFn) {
  // RGBA buffer: 4 bytes per pixel
  const stride = width * 4;
  const rawData = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (stride + 1);
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawFn(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      let byte = buf[i];
      crc ^= byte;
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const crcBuf = Buffer.alloc(4);
    const toCrc = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(toCrc), 0);

    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function drawIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const r = w / 2;

  // Normalized distance from center (0 to 1)
  const dx = (x - cx) / r;
  const dy = (y - cy) / r;
  const distSq = dx * dx + dy * dy;

  // Squircle / rounded rect for YouTube badge
  const cornerR = 0.28;
  const pad = 0.08;
  const boxW = 1.0 - pad * 2;
  const boxH = 0.85 - pad * 2;
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);

  let inside = false;
  if (nx <= boxW && ny <= boxH) {
    const qx = Math.max(0, nx - (boxW - cornerR));
    const qy = Math.max(0, ny - (boxH - cornerR));
    if (qx * qx + qy * qy <= cornerR * cornerR) {
      inside = true;
    }
  }

  if (!inside) {
    return [0, 0, 0, 0];
  }

  // YouTube Red gradient: #FF0000 to #D00000
  const grad = (y / h) * 0.25;
  let red = Math.round(255 - grad * 60);
  let green = Math.round(18 - grad * 18);
  let blue = Math.round(28 - grad * 20);

  // Draw Play triangle & Aid Plus symbol
  // Triangle coords: roughly left x: 0.38 to 0.65, y: 0.3 to 0.7
  const px = x / w;
  const py = y / h;

  // Centered Play triangle
  const triLeft = 0.38;
  const triRight = 0.68;
  const triTop = 0.28;
  const triBottom = 0.72;
  const triHeight = triBottom - triTop;

  let inPlay = false;
  if (px >= triLeft && px <= triRight) {
    const progress = (px - triLeft) / (triRight - triLeft);
    const curTop = triTop + (triHeight / 2) * progress;
    const curBottom = triBottom - (triHeight / 2) * progress;
    if (py >= curTop && py <= curBottom) {
      inPlay = true;
    }
  }

  if (inPlay) {
    return [255, 255, 255, 255];
  }

  return [red, green, blue, 255];
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const pngBuf = createPNG(size, size, drawIcon);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), pngBuf);
  console.log(`Generated icon${size}.png (${size}x${size})`);
});
