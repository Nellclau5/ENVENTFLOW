/**
 * Génère les icônes PWA à partir de img/logo.png
 * Usage: node scripts/generate-pwa-icons.js
 */

const fs = require('fs');
const path = require('path');

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('Installez sharp: npm install sharp --save-dev');
    process.exit(1);
  }

  const root = path.join(__dirname, '..');
  const src = path.join(root, 'img', 'logo.png');
  const outDir = path.join(root, 'icons');

  if (!fs.existsSync(src)) {
    console.error('Logo introuvable:', src);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

  for (const size of sizes) {
    await sharp(src)
      .resize(size, size, { fit: 'contain', background: { r: 57, g: 54, b: 79, alpha: 1 } })
      .png()
      .toFile(path.join(outDir, `icon-${size}.png`));
    console.log(`✓ icon-${size}.png`);
  }

  await sharp(src)
    .resize(180, 180, { fit: 'contain', background: { r: 57, g: 54, b: 79, alpha: 1 } })
    .png()
    .toFile(path.join(outDir, 'apple-touch-icon.png'));
  console.log('✓ apple-touch-icon.png');

  // Icône maskable avec padding (80% safe zone)
  const maskableSize = 512;
  const inner = Math.round(maskableSize * 0.8);
  const resized = await sharp(src)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: maskableSize,
      height: maskableSize,
      channels: 4,
      background: { r: 57, g: 54, b: 79, alpha: 1 }
    }
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toFile(path.join(outDir, 'icon-maskable-512.png'));
  console.log('✓ icon-maskable-512.png');

  console.log('\nIcônes PWA générées dans icons/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
