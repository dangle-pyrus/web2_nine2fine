import { chromium } from 'playwright';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceDirectory = 'reference/uniqlo';
const source = (await readdir(sourceDirectory)).find((name) => name.endsWith('.html'));
if (!source) throw new Error('Saved HTML not found');
const output = '.open-figma-mcp/exports/uniqlo-import';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, javaScriptEnabled: false });
  await page.route(/^https?:/, (route) => route.abort());
  await page.goto(pathToFileURL(resolve(sourceDirectory, source)).href, { waitUntil: 'load' });
  const structure = await page.evaluate(() => {
    const box = (element) => { const r = element.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; };
    return {
      title: document.title,
      height: document.documentElement.scrollHeight,
      headings: [...document.querySelectorAll('h1,h2,h3,h4')].map((el) => ({ tag: el.tagName, text: el.textContent.trim(), class: el.className, ...box(el) })),
      images: [...document.querySelectorAll('img')].map((el) => ({ src: el.currentSrc || el.src, alt: el.alt, class: el.className, naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight, ...box(el) })),
      links: [...document.querySelectorAll('a')].map((el) => ({ text: el.textContent.trim(), href: el.getAttribute('href'), ...box(el) })).filter((el) => el.width && el.height),
      blocks: [...document.querySelectorAll('main,section,article')].map((el) => ({ tag: el.tagName, id: el.id, class: el.className, text: el.textContent.trim().slice(0, 250), ...box(el) })),
    };
  });
  await writeFile(`${output}/structure-${width}.json`, JSON.stringify(structure, null, 2));
  await writeFile(`${output}/text-${width}.txt`, await page.locator('body').innerText());
  await page.screenshot({ path: `${output}/saved-${width}.png`, fullPage: true });
  console.log(JSON.stringify({ width, height: structure.height, headings: structure.headings.filter((h) => h.width), images: structure.images.length, visibleImages: structure.images.filter((i) => i.width && i.height).length, blocks: structure.blocks }, null, 2));
  await page.close();
}
await browser.close();
