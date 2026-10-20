import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const file = 'reference/uniqlo/imported-media.json';
const media = JSON.parse(await fs.readFile(file, 'utf8'));
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.resolve('public', Object.values(media)[0].src.slice(1))).href);
  for (const [id, asset] of Object.entries(media)) {
    const dimensions = await page.evaluate(async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight };
    }, pathToFileURL(path.resolve('public', asset.src.slice(1))).href);
    Object.assign(asset, dimensions);
    if (!asset.width) throw new Error('Invalid image: ' + id);
  }
  await fs.writeFile(file, JSON.stringify(media, null, 2));
  console.log('Browser decoded all ' + Object.keys(media).length + ' images.');
} finally { await browser.close(); }
