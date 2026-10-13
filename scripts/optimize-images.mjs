import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ORIGINALS_DIR = path.join(__dirname, '../assets/images/originals');
const OPTIMIZED_DIR = path.join(__dirname, '../apps/web/public/images/optimized');
const CACHE_FILE = path.join(__dirname, '../.image-cache.json');

const WIDTHS = [480, 768, 1200, 1600, 1920];
const FORMATS = [
  { ext: 'webp', format: 'webp', options: { quality: 85, effort: 6 } },
  { ext: 'avif', format: 'avif', options: { quality: 60, effort: 4 } }
];

const isReport = process.argv.includes('--report');

async function run() {
  let cache = {};
  if (fs.existsSync(CACHE_FILE)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch(e){}
  }

  if (isReport) {
    printReport(cache);
    return;
  }

  if (!fs.existsSync(OPTIMIZED_DIR)) {
    fs.mkdirSync(OPTIMIZED_DIR, { recursive: true });
  }

  const files = fs.readdirSync(ORIGINALS_DIR).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
  
  for (const file of files) {
    const filePath = path.join(ORIGINALS_DIR, file);
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    
    // Clean filename: e.g. "ChatGPT Image Oct 12..." -> "photo-oct-12"
    let cleanName = path.parse(file).name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (cleanName.startsWith('chatgpt-image')) {
      cleanName = cleanName.replace('chatgpt-image-', 'photo-');
    }
    
    if (cache[file] && cache[file].hash === hash) {
      continue;
    }
    
    console.log(`Optimizing: ${file} -> ${cleanName}`);
    const image = sharp(fileBuffer);
    const metadata = await image.metadata();
    
    let variants = [];
    
    for (const width of WIDTHS) {
      if (width > metadata.width) continue; // Skip upscaling
      
      for (const fmt of FORMATS) {
        const outName = `${cleanName}-${width}w.${fmt.ext}`;
        const outPath = path.join(OPTIMIZED_DIR, outName);
        
        await image.clone()
          .rotate() // auto correct EXIF orientation
          .resize({ width, withoutEnlargement: true })
          [fmt.format](fmt.options)
          .toFile(outPath);
          
        variants.push({
          name: outName,
          size: fs.statSync(outPath).size,
          width,
          format: fmt.ext
        });
      }
    }
    
    // Also export an original width version for ultra-wide displays
    for (const fmt of FORMATS) {
      const outName = `${cleanName}-original.${fmt.ext}`;
      const outPath = path.join(OPTIMIZED_DIR, outName);
      
      await image.clone()
        .rotate()
        [fmt.format](fmt.options)
        .toFile(outPath);
        
      variants.push({
        name: outName,
        size: fs.statSync(outPath).size,
        width: metadata.width,
        format: fmt.ext
      });
    }
    
    cache[file] = {
      hash,
      originalSize: fileBuffer.length,
      variants
    };
  }
  
  await optimizeBrandRefresh(cache);

  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  printReport(cache);
}

/* ------------------------------------------------------------------
 * 2026 brand refresh pass.
 * Source:  assets/images/2026-brand-refresh/<category>/<name>.png (kept intact)
 * Output:  /images/optimized/<category>-<name>-<w>w.{avif,webp} in every public app
 * Manifest: packages/ui/src/lib/image-manifest.json (stems, widths, intrinsic size)
 * No full-resolution "original" variants are shipped for this set.
 * ------------------------------------------------------------------ */
const BRAND_DIR = path.join(__dirname, '../assets/images/2026-brand-refresh');
const BRAND_WIDTHS = [480, 800, 1200, 1600];
const BRAND_FORMATS = [
  { ext: 'webp', format: 'webp', options: { quality: 80, effort: 6 } },
  { ext: 'avif', format: 'avif', options: { quality: 55, effort: 5 } }
];
const APP_PUBLIC_DIRS = ['web', 'worship', 'academy', 'live', 'production']
  .map((app) => path.join(__dirname, `../apps/${app}/public/images/optimized`));
const MANIFEST_FILE = path.join(__dirname, '../packages/ui/src/lib/image-manifest.json');

async function optimizeBrandRefresh(cache) {
  if (!fs.existsSync(BRAND_DIR)) return;
  const manifest = {};
  const categories = fs.readdirSync(BRAND_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of APP_PUBLIC_DIRS) fs.mkdirSync(dir, { recursive: true });

  for (const category of categories) {
    const files = fs.readdirSync(path.join(BRAND_DIR, category)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
    for (const file of files) {
      const key = `2026-brand-refresh/${category}/${file}`;
      const fileBuffer = fs.readFileSync(path.join(BRAND_DIR, category, file));
      const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
      const stem = `${category}-${path.parse(file).name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const image = sharp(fileBuffer);
      const metadata = await image.metadata();
      let widths = BRAND_WIDTHS.filter((w) => w <= metadata.width);
      if (metadata.width < 1600) widths.push(metadata.width); // largest = intrinsic, never upscaled
      widths = [...new Set(widths)].sort((a, b) => a - b);
      manifest[stem] = { source: key, width: metadata.width, height: metadata.height, widths };

      const allPresent = widths.every((w) => APP_PUBLIC_DIRS.every((d) => BRAND_FORMATS.every((f) => fs.existsSync(path.join(d, `${stem}-${w}w.${f.ext}`)))));
      if (cache[key] && cache[key].hash === hash && allPresent) continue;

      console.log(`Optimizing (brand refresh): ${key} -> ${stem}`);
      const variants = [];
      for (const width of widths) {
        for (const fmt of BRAND_FORMATS) {
          const outName = `${stem}-${width}w.${fmt.ext}`;
          const primary = path.join(APP_PUBLIC_DIRS[0], outName);
          await image.clone().rotate().resize({ width, withoutEnlargement: true })[fmt.format](fmt.options).toFile(primary);
          for (const dir of APP_PUBLIC_DIRS.slice(1)) fs.copyFileSync(primary, path.join(dir, outName));
          variants.push({ name: outName, size: fs.statSync(primary).size, width, format: fmt.ext });
        }
      }
      cache[key] = { hash, originalSize: fileBuffer.length, variants };
    }
  }
  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n');
}

function printReport(cache) {
  console.log('\n=== Image Optimization Report ===');
  let totalOriginal = 0;
  let totalOptimizedBase = 0;
  let totalVariants = 0;
  
  for (const [file, data] of Object.entries(cache)) {
    totalOriginal += data.originalSize;
    if (data.variants && data.variants.length > 0) {
      // Compare original to the largest variant (usually the original width webp)
      const largestVariant = data.variants.reduce((max, v) => v.size > max.size ? v : max, data.variants[0]);
      totalOptimizedBase += largestVariant.size;
      
      const fileTotal = data.variants.reduce((sum, v) => sum + v.size, 0);
      totalVariants += fileTotal;
      
      const saved = ((1 - (largestVariant.size / data.originalSize)) * 100).toFixed(1);
      console.log(`- ${file}: ${(data.originalSize/1024).toFixed(1)}KB -> ${largestVariant.name} ${(largestVariant.size/1024).toFixed(1)}KB (${saved}% reduction)`);
    }
  }
  
  console.log(`\nTotal Original Source Size: ${(totalOriginal/1024/1024).toFixed(2)}MB`);
  console.log(`Est. Delivery Payload (1x Largest Variant): ${(totalOptimizedBase/1024/1024).toFixed(2)}MB`);
  console.log(`Total Variants Footprint: ${(totalVariants/1024/1024).toFixed(2)}MB`);
}

run().catch(console.error);
