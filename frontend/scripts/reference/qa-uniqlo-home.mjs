import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const dir = process.argv[2] ?? '.open-figma-mcp/exports/uniqlo-import';
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const report = [];
try {
  for (const width of [375, 390, 430, 768, 1024, 1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4200/');
    await page.locator('h1').waitFor();
    for (const section of await page.locator('n2f-home-campaign, .reference-categories, n2f-home-product-rail').all()) {
      await section.scrollIntoViewIfNeeded();
      await section.locator('img').evaluateAll(async imgs => await Promise.all(imgs.map(img => img.decode().catch(() => {}))));
    }
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      broken: [...document.querySelectorAll('n2f-home-page img')].filter(img => !img.complete || !img.naturalWidth).map(img => img.src),
    }));
    if ([390,1440].includes(width)) {
      await page.evaluate(() => scrollTo(0,0));
      await page.screenshot({ path: `${dir}/home-${width}.png`, fullPage: true });
      await page.screenshot({ path: `${dir}/hero-${width}.png` });
      await page.locator('.reference-categories').screenshot({ path: `${dir}/categories-${width}.png` });
      await page.locator('n2f-home-product-rail').first().screenshot({ path: `${dir}/products-${width}.png` });
    }
    report.push({ width, ...state, errors });
    await page.close();
  }
  await fs.writeFile(`${dir}/qa-report.json`, JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
