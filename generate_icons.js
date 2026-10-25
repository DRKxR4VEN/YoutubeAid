const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Core PNG Generator without any external dependencies
function createPNG(width, height, drawFn) {
  const stride = width * 4;
  const rawData = Buffer.alloc((stride + 1) * height);

  // 2x2 supersampling for smooth anti-aliased edges
  const SAMPLES = 2;
  const invSamplesSq = 1 / (SAMPLES * SAMPLES);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (stride + 1);
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;

      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const subX = x + (sx + 0.5) / SAMPLES;
          const subY = y + (sy + 0.5) / SAMPLES;
          const [r, g, b, a] = drawFn(subX, subY, width, height);
          const alphaNorm = a / 255;
          rSum += r * alphaNorm;
          gSum += g * alphaNorm;
          bSum += b * alphaNorm;
          aSum += a;
        }
      }

      const finalA = Math.round(aSum * invSamplesSq);
      let finalR = 0, finalG = 0, finalB = 0;
      if (finalA > 0) {
        finalR = Math.min(255, Math.round((rSum * invSamplesSq) / (finalA / 255)));
        finalG = Math.min(255, Math.round((gSum * invSamplesSq) / (finalA / 255)));
        finalB = Math.min(255, Math.round((bSum * invSamplesSq) / (finalA / 255)));
      }

      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = finalR;
      rawData[pxOffset + 1] = finalG;
      rawData[pxOffset + 2] = finalB;
      rawData[pxOffset + 3] = finalA;
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

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // 8-bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // Deflate
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// -------------------------------------------------------------
// Helper Geometry
// -------------------------------------------------------------
function isInRoundedRect(px, py, rx, ry, rw, rh, rad) {
  if (px < rx || px > rx + rw || py < ry || py > ry + rh) return false;
  const innerLeft = rx + rad;
  const innerRight = rx + rw - rad;
  const innerTop = ry + rad;
  const innerBottom = ry + rh - rad;

  if (px >= innerLeft && px <= innerRight) return true;
  if (py >= innerTop && py <= innerBottom) return true;

  const dx = px < innerLeft ? px - innerLeft : px - innerRight;
  const dy = py < innerTop ? py - innerTop : py - innerBottom;
  return (dx * dx + dy * dy) <= (rad * rad);
}

// -------------------------------------------------------------
// 1. DISTINCTIVE YOUTUBE AID EXTENSION LOGO
// YouTube Red rounded screen with Play triangle & Aid Assistant Cross badge
// -------------------------------------------------------------
function drawYouTubeAid(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;

  // YouTube outer rounded badge
  const pad = 0.08;
  const rad = 0.22;
  const inScreen = isInRoundedRect(nx, ny, pad, pad * 1.3, 1 - pad * 2, 1 - pad * 2.6, rad);

  if (!inScreen) {
    return [0, 0, 0, 0];
  }

  // YouTube Red gradient
  const grad = ny * 0.15;
  const redR = Math.round(255 - grad * 30);
  const redG = Math.round(0);
  const redB = Math.round(30 - grad * 20);

  // 1. Play Button Triangle (left/center)
  const triLeft = 0.28;
  const triRight = 0.54;
  const triTop = 0.32;
  const triBottom = 0.68;
  const triHeight = triBottom - triTop;

  let inPlay = false;
  if (nx >= triLeft && nx <= triRight) {
    const progress = (nx - triLeft) / (triRight - triLeft);
    const curTop = triTop + (triHeight / 2) * progress;
    const curBottom = triBottom - (triHeight / 2) * progress;
    if (ny >= curTop && ny <= curBottom) {
      inPlay = true;
    }
  }

  if (inPlay) {
    return [255, 255, 255, 255];
  }

  // 2. Aid Badge (Right side: Modern helper cross badge)
  const aidCx = 0.72;
  const aidCy = 0.50;
  const aidSize = 0.16;
  const aidThick = 0.065;
  const aidRad = 0.02;

  // Horizontal bar of plus
  const inHBar = isInRoundedRect(
    nx, ny,
    aidCx - aidSize, aidCy - aidThick / 2,
    aidSize * 2, aidThick,
    aidRad
  );

  // Vertical bar of plus
  const inVBar = isInRoundedRect(
    nx, ny,
    aidCx - aidThick / 2, aidCy - aidSize,
    aidThick, aidSize * 2,
    aidRad
  );

  if (inHBar || inVBar) {
    return [255, 255, 255, 255];
  }

  return [redR, redG, redB, 255];
}

// -------------------------------------------------------------
// 2. MONOCHROME LOOP ICON (White on Transparent)
// Continuous circular refresh/repeat arrows
// -------------------------------------------------------------
function drawLoopIcon(x, y, w, h) {
  const cx = 0.5, cy = 0.5;
  const nx = x / w, ny = y / h;
  const dx = nx - cx, dy = ny - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Circular arc ring (radius ~ 0.30, thickness ~ 0.075)
  const ringR = 0.28;
  const ringThick = 0.06;
  const inRing = (dist >= ringR - ringThick / 2 && dist <= ringR + ringThick / 2);

  // Two breaks in ring for arrow heads
  const angle = Math.atan2(dy, dx); // -PI to PI
  // Upper break near top-right (angle ~ -0.4 to 0.4 rad)
  // Lower break near bottom-left (angle ~ 2.7 to -2.7 rad)
  const isBreak1 = (angle > -0.5 && angle < 0.2);
  const isBreak2 = (angle > 2.6 || angle < -2.6);

  let isPixel = inRing && !isBreak1 && !isBreak2;

  // Arrowhead 1 (top right pointing down-right)
  const a1x = 0.78, a1y = 0.40;
  if (nx >= 0.70 && nx <= 0.88 && ny >= 0.28 && ny <= 0.48) {
    // Triangle pointing down
    const p1 = (nx - 0.70) / 0.18;
    if (ny <= 0.46 && ny >= 0.30 + p1 * 0.14) {
      isPixel = true;
    }
  }

  // Arrowhead 2 (bottom left pointing up-left)
  if (nx >= 0.12 && nx <= 0.30 && ny >= 0.52 && ny <= 0.72) {
    const p2 = (0.30 - nx) / 0.18;
    if (ny >= 0.54 && ny <= 0.70 - p2 * 0.14) {
      isPixel = true;
    }
  }

  return isPixel ? [240, 240, 240, 255] : [0, 0, 0, 0];
}

// -------------------------------------------------------------
// 3. MONOCHROME SHORTCUTS / KEYBOARD ICON
// Sleek command/keyboard frame with clean keys
// -------------------------------------------------------------
function drawShortcutsIcon(x, y, w, h) {
  const nx = x / w, ny = y / h;

  // Outer keyboard frame
  const inOuter = isInRoundedRect(nx, ny, 0.12, 0.22, 0.76, 0.56, 0.08);
  const inInner = isInRoundedRect(nx, ny, 0.18, 0.28, 0.64, 0.44, 0.04);

  if (inOuter && !inInner) {
    return [240, 240, 240, 255];
  }

  // Key grid inside
  if (inInner) {
    const row = Math.floor((ny - 0.32) / 0.11);
    const col = Math.floor((nx - 0.22) / 0.15);
    if (row >= 0 && row < 3 && col >= 0 && col < 4) {
      const kx = 0.22 + col * 0.15;
      const ky = 0.32 + row * 0.11;
      // Spacebar on bottom row
      if (row === 2) {
        if (nx >= 0.30 && nx <= 0.70 && ny >= 0.54 && ny <= 0.62) {
          return [240, 240, 240, 255];
        }
      } else {
        if (nx >= kx + 0.02 && nx <= kx + 0.11 && ny >= ky + 0.01 && ny <= ky + 0.08) {
          return [240, 240, 240, 255];
        }
      }
    }
  }

  return [0, 0, 0, 0];
}

// -------------------------------------------------------------
// 4. MONOCHROME COPY ICON
// Two overlapping clean document sheets
// -------------------------------------------------------------
function drawCopyIcon(x, y, w, h) {
  const nx = x / w, ny = y / h;

  // Back sheet (top-right)
  const inBackOuter = isInRoundedRect(nx, ny, 0.32, 0.14, 0.52, 0.62, 0.06);
  const inBackInner = isInRoundedRect(nx, ny, 0.38, 0.20, 0.40, 0.50, 0.04);
  const isBack = inBackOuter && !inBackInner;

  // Front sheet (bottom-left)
  const inFrontOuter = isInRoundedRect(nx, ny, 0.16, 0.28, 0.52, 0.62, 0.06);
  const inFrontInner = isInRoundedRect(nx, ny, 0.22, 0.34, 0.40, 0.50, 0.04);
  const isFront = inFrontOuter && !inFrontInner;

  // If in front sheet interior, clear out back sheet
  if (inFrontOuter && !isFront) {
    // inside front page body: horizontal text lines
    if (nx >= 0.28 && nx <= 0.56) {
      if ((ny >= 0.44 && ny <= 0.48) || (ny >= 0.54 && ny <= 0.58) || (ny >= 0.64 && ny <= 0.68)) {
        return [240, 240, 240, 255];
      }
    }
    return [0, 0, 0, 0];
  }

  if (isFront || isBack) {
    return [240, 240, 240, 255];
  }

  return [0, 0, 0, 0];
}

// -------------------------------------------------------------
// 5. MONOCHROME LINK ICON
// Interlocking chain link symbol
// -------------------------------------------------------------
function drawLinkIcon(x, y, w, h) {
  const nx = x / w, ny = y / h;
  // Rotate by 45 degrees around center (0.5, 0.5)
  const cx = 0.5, cy = 0.5;
  const dx = nx - cx, dy = ny - cy;
  const cos45 = Math.SQRT1_2, sin45 = Math.SQRT1_2;
  const rx = dx * cos45 - dy * sin45;
  const ry = dx * sin45 + dy * cos45;

  // Link 1 (left oblong ring)
  const l1Outer = isInRoundedRect(rx, ry, -0.32, -0.12, 0.34, 0.24, 0.12);
  const l1Inner = isInRoundedRect(rx, ry, -0.26, -0.06, 0.22, 0.12, 0.06);
  const isL1 = l1Outer && !l1Inner;

  // Link 2 (right oblong ring)
  const l2Outer = isInRoundedRect(rx, ry, -0.02, -0.12, 0.34, 0.24, 0.12);
  const l2Inner = isInRoundedRect(rx, ry, 0.04, -0.06, 0.22, 0.12, 0.06);
  const isL2 = l2Outer && !l2Inner;

  if (isL1 || isL2) {
    return [240, 240, 240, 255];
  }

  return [0, 0, 0, 0];
}

// -------------------------------------------------------------
// 6. MONOCHROME BELL ICON
// Sleek notification bell with clapper
// -------------------------------------------------------------
function drawBellIcon(x, y, w, h) {
  const nx = x / w, ny = y / h;

  // Top hanger loop
  const dx = nx - 0.5;
  const topDist = Math.sqrt(dx * dx + (ny - 0.18) * (ny - 0.18));
  if (topDist <= 0.07 && topDist >= 0.035 && ny <= 0.18) {
    return [240, 240, 240, 255];
  }

  // Bell body (curved dome widening down)
  if (ny >= 0.20 && ny <= 0.70) {
    const prog = (ny - 0.20) / 0.50; // 0 to 1
    const halfW = 0.14 + prog * prog * 0.22;
    if (Math.abs(dx) <= halfW) {
      return [240, 240, 240, 255];
    }
  }

  // Bell rim lip
  if (ny >= 0.70 && ny <= 0.76 && Math.abs(dx) <= 0.38) {
    return [240, 240, 240, 255];
  }

  // Bottom clapper ball
  const clapDist = Math.sqrt(dx * dx + (ny - 0.81) * (ny - 0.81));
  if (clapDist <= 0.075 && ny >= 0.76) {
    return [240, 240, 240, 255];
  }

  return [0, 0, 0, 0];
}

// -------------------------------------------------------------
// 7. MONOCHROME KEYBOARD TABLE ICON
// -------------------------------------------------------------
function drawKeyboardTableIcon(x, y, w, h) {
  const nx = x / w, ny = y / h;

  // Table frame
  const inFrame = isInRoundedRect(nx, ny, 0.10, 0.14, 0.80, 0.72, 0.08);
  const inBody = isInRoundedRect(nx, ny, 0.15, 0.19, 0.70, 0.62, 0.04);

  if (inFrame && !inBody) {
    return [240, 240, 240, 255];
  }

  // Grid dividers inside
  if (inBody) {
    // Header divider line
    if (ny >= 0.34 && ny <= 0.38) {
      return [240, 240, 240, 255];
    }
    // Row 2 divider line
    if (ny >= 0.54 && ny <= 0.57) {
      return [240, 240, 240, 255];
    }
    // Vertical column divider line
    if (nx >= 0.40 && nx <= 0.43) {
      return [240, 240, 240, 255];
    }
  }

  return [0, 0, 0, 0];
}

// -------------------------------------------------------------
// 8. MONOCHROME PASTE ICON (Clipboard with downward arrow)
// -------------------------------------------------------------
function drawPasteIcon(x, y, w, h) {
  const nx = x / w, ny = y / h;

  // Clipboard frame
  const inFrame = isInRoundedRect(nx, ny, 0.18, 0.20, 0.64, 0.68, 0.08);
  const inBody = isInRoundedRect(nx, ny, 0.24, 0.26, 0.52, 0.56, 0.04);
  if (inFrame && !inBody) {
    return [240, 240, 240, 255];
  }

  // Top clip tab
  if (isInRoundedRect(nx, ny, 0.36, 0.10, 0.28, 0.14, 0.05)) {
    return [240, 240, 240, 255];
  }

  // Arrow shaft
  if (nx >= 0.46 && nx <= 0.54 && ny >= 0.34 && ny <= 0.58) {
    return [240, 240, 240, 255];
  }

  // Arrow head
  if (ny >= 0.54 && ny <= 0.74) {
    const half = (0.74 - ny) * 1.1;
    if (Math.abs(nx - 0.5) <= half) {
      return [240, 240, 240, 255];
    }
  }

  return [0, 0, 0, 0];
}

// -------------------------------------------------------------
// 9. MONOCHROME THUMBNAIL ICON (Photo frame + download arrow)
// -------------------------------------------------------------
function drawThumbnailIcon(x, y, w, h) {
  const nx = x / w, ny = y / h;

  // Photo frame
  const inFrame = isInRoundedRect(nx, ny, 0.08, 0.10, 0.84, 0.58, 0.08);
  const inInner = isInRoundedRect(nx, ny, 0.15, 0.17, 0.70, 0.44, 0.04);

  if (inFrame && !inInner) {
    return [240, 240, 240, 255];
  }

  if (inInner) {
    // Sun
    const sunDist = Math.sqrt((nx - 0.29) ** 2 + (ny - 0.28) ** 2);
    if (sunDist <= 0.055) {
      return [240, 240, 240, 255];
    }

    // Two mountain silhouettes rising from the bottom of the frame
    if (ny >= 0.44 && ny <= 0.61) {
      const bigProg = (ny - 0.44) / 0.17;
      if (Math.abs(nx - 0.40) <= 0.04 + bigProg * 0.19) {
        return [240, 240, 240, 255];
      }

      const smallProg = (ny - 0.50) / 0.11;
      if (Math.abs(nx - 0.64) <= 0.03 + smallProg * 0.12) {
        return [240, 240, 240, 255];
      }
    }
  }

  // Download arrow under the frame
  if (nx >= 0.45 && nx <= 0.55 && ny >= 0.70 && ny <= 0.83) {
    return [240, 240, 240, 255];
  }
  if (ny >= 0.81 && ny <= 0.95) {
    const headHalf = 0.14 * (0.95 - ny) / (0.95 - 0.81);
    if (Math.abs(nx - 0.5) <= headHalf) {
      return [240, 240, 240, 255];
    }
  }

  return [0, 0, 0, 0];
}

// -------------------------------------------------------------
// Write Icons to disk
// -------------------------------------------------------------
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 1. YouTube Aid Extension Icons (16, 48, 128)
[16, 48, 128].forEach(size => {
  const buf = createPNG(size, size, drawYouTubeAid);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buf);
  console.log(`Generated icon${size}.png`);
});

// 2. High-res YouTube Aid Logo for Header
const logoBuf = createPNG(128, 128, drawYouTubeAid);
fs.writeFileSync(path.join(iconsDir, 'youtube_aid.png'), logoBuf);
console.log('Generated youtube_aid.png');

// 3. Monochrome B&W Feature Icons (48x48)
const bAndWIcons = [
  { name: 'loop.png', fn: drawLoopIcon },
  { name: 'shortcuts.png', fn: drawShortcutsIcon },
  { name: 'copy.png', fn: drawCopyIcon },
  { name: 'link.png', fn: drawLinkIcon },
  { name: 'bell.png', fn: drawBellIcon },
  { name: 'table.png', fn: drawKeyboardTableIcon },
  { name: 'paste.png', fn: drawPasteIcon },
  { name: 'thumbnail.png', fn: drawThumbnailIcon }
];

bAndWIcons.forEach(({ name, fn }) => {
  const buf = createPNG(48, 48, fn);
  fs.writeFileSync(path.join(iconsDir, name), buf);
  console.log(`Generated monochrome ${name}`);
});

console.log('All icons generated successfully!');
