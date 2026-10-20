import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = '.open-figma-mcp/exports/uniqlo-reference';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB' });
const resources = [];
page.on('response', (response) => {
  const type = response.request().resourceType();
  if (['image', 'stylesheet', 'font', 'document'].includes(type)) {
    resources.push({ url: response.url(), status: response.status(), type });
  }
});
try {
  const response = await page.goto('https://www.uniqlo.com/uk/en/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const report = {
    requestedUrl: 'https://www.uniqlo.com/uk/en/',
    finalUrl: page.url(),
    status: response.status(),
    capturedAt: new Date().toISOString(),
    complete: false,
  };
  if (!response.ok()) {
    await writeFile(`${output}/access-denied.html`, await response.text());
    await page.screenshot({ path: `${output}/access-denied.png` });
    await writeFile(`${output}/crawl-report.json`, JSON.stringify({ ...report, reason: 'Source returned an HTTP access error. No landing page was captured.' }, null, 2));
    throw new Error(`UNIQLO returned HTTP ${response.status()}; no landing page captured.`);
  }
  await writeFile(`${output}/source.html`, await response.text());
  await page.waitForTimeout(7000);
  await writeFile(`${output}/rendered.html`, await page.content());
  await writeFile(`${output}/text.txt`, await page.locator('body').innerText());
  await writeFile(`${output}/resources.json`, JSON.stringify(resources, null, 2));
  await page.screenshot({ path: `${output}/initial-desktop.png` });
  await writeFile(`${output}/crawl-report.json`, JSON.stringify({ ...report, reason: 'Initial desktop capture only; full responsive crawl still required.' }, null, 2));
  console.log(JSON.stringify({ status: response.status(), url: page.url(), title: await page.title(), text: (await page.locator('body').innerText()).slice(0, 8500), buttons: await page.getByRole('button').allTextContents() }, null, 2));
} finally {
  await browser.close();
}
