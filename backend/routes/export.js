const express = require('express');
const router = express.Router();
const sharp = require('sharp');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET_NAME = process.env.R2_BUCKET_NAME;

const requireAdminKey = (req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_SECRET_KEY) return res.status(500).json({ error: 'Admin key not configured' });
  if (!key || key !== process.env.ADMIN_SECRET_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

// Max DPI that fits within memory budget.
// Sharp composite keeps ~3 buffers in memory simultaneously (src, dst, result).
// Free tier = 512MB total; Node.js + sharp overhead ~80MB → usable ~400MB → per-buffer ~130MB.
function safeDpi(boardW, boardH, budgetMB = 130) {
  const maxPixels = (budgetMB * 1024 * 1024) / 4;
  const rawDpi = Math.sqrt(maxPixels / (boardW * boardH));
  // Round down to nearest 25, cap at 300, floor at 72
  return Math.max(72, Math.min(300, Math.floor(rawDpi / 25) * 25));
}

// Minimal uncompressed TIFF encoder — auto-detects 3-channel (RGB) or 4-channel (RGBA) input.
// sharp().raw() may output RGB or RGBA depending on source PNG alpha state; we handle both.
function writeTiff(rawData, w, h, dpi) {
  const pixelCount = w * h;
  // Detect actual channel count from buffer size (must be integer)
  const ch = rawData.length / pixelCount;
  if (ch !== 3 && ch !== 4) {
    throw new Error(`writeTiff: unexpected channel count ${ch} (buffer ${rawData.length}, pixels ${pixelCount})`);
  }
  const rgb = Buffer.alloc(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    rgb[i * 3]     = rawData[i * ch];
    rgb[i * 3 + 1] = rawData[i * ch + 1];
    rgb[i * 3 + 2] = rawData[i * ch + 2];
  }

  const NUM_TAGS = 13;
  const IFD_OFF  = 8;
  const IFD_LEN  = 2 + NUM_TAGS * 12 + 4;
  const VALS_OFF = IFD_OFF + IFD_LEN;
  const BITS_OFF = VALS_OFF;
  const XRES_OFF = VALS_OFF + 8;
  const YRES_OFF = VALS_OFF + 16;
  const DATA_OFF = VALS_OFF + 24;

  const buf = Buffer.alloc(DATA_OFF + rgb.length);
  buf.writeUInt16LE(0x4949, 0);
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(IFD_OFF, 4);

  let p = IFD_OFF;
  buf.writeUInt16LE(NUM_TAGS, p); p += 2;

  const e = (tag, type, count, val) => {
    buf.writeUInt16LE(tag,   p);
    buf.writeUInt16LE(type,  p + 2);
    buf.writeUInt32LE(count, p + 4);
    buf.writeUInt32LE(val,   p + 8);
    p += 12;
  };

  e(256, 4, 1, w);              // ImageWidth
  e(257, 4, 1, h);              // ImageLength
  e(258, 3, 3, BITS_OFF);       // BitsPerSample (8,8,8)
  e(259, 3, 1, 1);              // Compression = none
  e(262, 3, 1, 2);              // PhotometricInterpretation = RGB
  e(273, 4, 1, DATA_OFF);       // StripOffsets
  e(277, 3, 1, 3);              // SamplesPerPixel = 3
  e(278, 4, 1, h);              // RowsPerStrip
  e(279, 4, 1, rgb.length);     // StripByteCounts
  e(282, 5, 1, XRES_OFF);       // XResolution
  e(283, 5, 1, YRES_OFF);       // YResolution
  e(284, 3, 1, 1);              // PlanarConfiguration = chunky
  e(296, 3, 1, 2);              // ResolutionUnit = inch
  buf.writeUInt32LE(0, p);      // next IFD = 0

  buf.writeUInt16LE(8, BITS_OFF);
  buf.writeUInt16LE(8, BITS_OFF + 2);
  buf.writeUInt16LE(8, BITS_OFF + 4);
  buf.writeUInt32LE(dpi, XRES_OFF); buf.writeUInt32LE(1, XRES_OFF + 4);
  buf.writeUInt32LE(dpi, YRES_OFF); buf.writeUInt32LE(1, YRES_OFF + 4);

  rgb.copy(buf, DATA_OFF);
  return buf;
}

// POST /api/export/render-tiff
// Body: { customerId, designId }
// Returns: TIFF file at the highest DPI safe for the board size
router.post('/render-tiff', requireAdminKey, async (req, res) => {
  const { customerId, designId } = req.body;
  if (!customerId || !designId) {
    return res.status(400).json({ error: 'customerId and designId are required' });
  }

  try {
    // Load design JSON from R2
    const designRes = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `users/${customerId}/designs/${designId}.json`,
    }));
    const design = JSON.parse((await streamToBuffer(designRes.Body)).toString('utf-8'));

    let { canvasData, assetsMetadata, boardSize } = design;
    if (!canvasData || !boardSize) {
      return res.status(422).json({ error: 'Design missing canvasData or boardSize' });
    }

    // Ensure all assetsMetadata entries have r2Keys — fall back to guessed R2 path if missing
    if (assetsMetadata) {
      for (const [assetId, meta] of Object.entries(assetsMetadata)) {
        if (!meta.r2Key) {
          meta.r2Key = `exports/${customerId}/${designId}/assets/${assetId}.png`;
        }
      }
    } else {
      // No assetsMetadata at all — try to reconstruct from canvasData + guessed R2 paths
      try {
        const parsedItems = JSON.parse(canvasData);
        const assetIds = [...new Set(parsedItems.map(i => i.assetId).filter(Boolean))];
        const rebuilt = {};
        for (const assetId of assetIds) {
          rebuilt[assetId] = {
            name: assetId,
            originalWidth: 0,
            originalHeight: 0,
            r2Key: `exports/${customerId}/${designId}/assets/${assetId}.png`,
          };
        }
        if (Object.keys(rebuilt).length > 0) {
          assetsMetadata = rebuilt;
        } else {
          return res.status(422).json({ error: 'Design has no items with assets.' });
        }
      } catch {
        return res.status(422).json({ error: 'Could not parse canvasData.' });
      }
    }

    const items = JSON.parse(canvasData);
    const { width: boardW, height: boardH } = boardSize;
    const dpi    = safeDpi(boardW, boardH);
    const scale  = dpi / 300; // canvasData coords are stored in 300 DPI units

    const boardPxW = Math.round(boardW * dpi);
    const boardPxH = Math.round(boardH * dpi);

    // Sort items by zIndex ascending
    const sorted = [...items].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    // Start with white background as PNG buffer
    let canvas = await sharp({
      create: { width: boardPxW, height: boardPxH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    }).png().toBuffer();

    // Composite items one at a time to keep peak memory low
    let renderedCount = 0;
    const skippedReasons = [];

    for (const item of sorted) {
      const meta = assetsMetadata[item.assetId];
      if (!meta?.r2Key) {
        skippedReasons.push(`item ${item.id}: no r2Key for assetId ${item.assetId}`);
        continue;
      }

      try {
        const assetBuf = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: meta.r2Key }))
          .then(r => streamToBuffer(r.Body));

        const tW = Math.max(1, Math.round(item.width  * scale));
        const tH = Math.max(1, Math.round(item.height * scale));

        let img = sharp(assetBuf).resize(tW, tH, { fit: 'fill' }).ensureAlpha();
        if (item.flipX) img = img.flop();
        if (item.flipY) img = img.flip();

        let compLeft, compTop;
        const rotation = item.rotation ?? 0;

        if (rotation !== 0) {
          const θ   = (rotation * Math.PI) / 180;
          const cos = Math.cos(θ);
          const sin = Math.sin(θ);
          const new_cx = item.x * scale + (tW / 2) * cos - (tH / 2) * sin;
          const new_cy = item.y * scale + (tW / 2) * sin + (tH / 2) * cos;
          const rotW = tW * Math.abs(cos) + tH * Math.abs(sin);
          const rotH = tW * Math.abs(sin) + tH * Math.abs(cos);
          compLeft = Math.round(new_cx - rotW / 2);
          compTop  = Math.round(new_cy - rotH / 2);
          img = img.rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
        } else {
          compLeft = Math.round(item.x * scale);
          compTop  = Math.round(item.y * scale);
        }

        const layerBuf = await img.png().toBuffer();

        // Composite this single layer onto current canvas, replace canvas buffer
        canvas = await sharp(canvas)
          .composite([{ input: layerBuf, left: Math.max(0, compLeft), top: Math.max(0, compTop), blend: 'over' }])
          .png()
          .toBuffer();

        renderedCount++;
      } catch (err) {
        skippedReasons.push(`item ${item.id}: ${err.message} (r2Key: ${meta.r2Key})`);
      }
    }

    // If nothing rendered, fall back to full-export.png stored in R2
    if (renderedCount === 0) {
      console.warn(`[export] All ${sorted.length} items skipped. Trying full-export.png fallback.`);
      // Try full-export.png first, then thumbnail.png as last resort
      const fallbackKeys = [
        `exports/${customerId}/${designId}/full-export.png`,
        `exports/${customerId}/${designId}/thumbnail.png`,
      ];
      let fullBuf = null;
      for (const key of fallbackKeys) {
        try {
          fullBuf = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
            .then(r => streamToBuffer(r.Body));
          console.log(`[export] Using fallback: ${key}`);
          break;
        } catch { /* try next */ }
      }
      try {
        if (!fullBuf) throw new Error('no fallback found');
        // Resize to target DPI dimensions and convert to TIFF
        const { data: fallbackData, info } = await sharp(fullBuf)
          .resize(boardPxW, boardPxH, { fit: 'fill' })
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .raw()
          .toBuffer({ resolveWithObject: true });
        const tiffBuf = writeTiff(fallbackData, info.width, info.height, dpi);
        const filename = `${design.name || designId}_${boardW}x${boardH}_${dpi}dpi_fallback.tiff`
          .replace(/[^a-zA-Z0-9._\-x]/g, '_');
        res.setHeader('Content-Type', 'image/tiff');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('X-Render-DPI', String(dpi));
        res.setHeader('Content-Length', String(tiffBuf.length));
        return res.send(tiffBuf);
      } catch (fallbackErr) {
        return res.status(422).json({
          error: 'Asset dosyaları ve full-export.png R2\'de bulunamadı. Tasarımı editörde açıp tekrar kaydet.',
          diagnostics: { customerId, designId, skipped: skippedReasons },
        });
      }
    }

    if (skippedReasons.length > 0) {
      console.warn(`[export] ${skippedReasons.length} item(s) skipped:`, skippedReasons);
    }

    // Final: flatten to white (removes alpha) then extract raw RGB for TIFF encoding.
    // flatten() guarantees 3-channel output; writeTiff auto-detects channel count.
    const { data } = await sharp(canvas).flatten({ background: { r: 255, g: 255, b: 255 } }).raw().toBuffer({ resolveWithObject: true });

    const tiffBuf = writeTiff(data, boardPxW, boardPxH, dpi);

    const filename = `${design.name || designId}_${boardW}x${boardH}_${dpi}dpi.tiff`
      .replace(/[^a-zA-Z0-9._\-x]/g, '_');

    res.setHeader('Content-Type', 'image/tiff');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Render-DPI', String(dpi));
    res.setHeader('Content-Length', String(tiffBuf.length));
    res.send(tiffBuf);

  } catch (err) {
    console.error('[export] render-tiff failed:', err);
    res.status(500).json({ error: 'Render failed', message: err.message });
  }
});

module.exports = router;
