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
  
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  printReport(cache);
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
