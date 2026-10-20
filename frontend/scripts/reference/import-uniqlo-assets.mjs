import { readFile, mkdir, writeFile, copyFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';

const extracted = JSON.parse(await readFile('reference/uniqlo/landing-extracted.json', 'utf8'));
const directory = 'public/assets/uniqlo-reference';
await mkdir(directory, { recursive: true });
const media = {};
const failures = [];
const allowed = new Set(['im.uniqlo.com', 'image.uniqlo.com']);

async function download(url, destination, expectedType) {
  if (!allowed.has(new URL(url).hostname)) throw new Error('Unexpected asset host');
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith(expectedType)) {
    throw new Error(`HTTP ${response.status()} or unexpected content type`);
  }
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

const entries = Object.entries(extracted.assets);
// Only observed image/video URLs are imported. Saved JavaScript, trackers and cookies are excluded.
for (let i = 0; i < entries.length; i += 3) {
  await Promise.all(entries.slice(i, i + 3).map(async ([id, asset]) => {
    try {
      const extension = extname(asset.local || new URL(asset.url).pathname) || '.jpg';
      const filename = `${id}${extension}`;
      const destination = `${directory}/${filename}`;
      let exists = false;
      try { exists = (await stat(destination)).size > 0; } catch { /* New asset. */ }
      if (!exists) {
        if (asset.local) await copyFile(asset.local, destination);
        else await download(asset.url, destination, 'image/');
      }
      media[id] = { src: `/assets/uniqlo-reference/${filename}`, alt: asset.alt, temporary: true, source: 'reference', sourceUrl: asset.url || extracted.content.source };
      if (asset.videoUrl) {
        const videoFile = `${directory}/${id}.mp4`;
        try {
          let videoExists = false;
          try { videoExists = (await stat(videoFile)).size > 0; } catch { /* New video. */ }
          if (!videoExists) await download(asset.videoUrl, videoFile, 'video/');
          media[id].videoSrc = `/assets/uniqlo-reference/${id}.mp4`;
        } catch (error) { failures.push({ id, kind: 'video', error: error.message }); }
      }
    } catch (error) { failures.push({ id, kind: 'image', error: error.message }); }
  }));
}
await writeFile('reference/uniqlo/imported-media.json', JSON.stringify(media, null, 2));
await writeFile('reference/uniqlo/import-report.json', JSON.stringify({ importedImages: Object.keys(media).length, importedVideos: Object.values(media).filter((m) => m.videoSrc).length, failures }, null, 2));
console.log(JSON.stringify({ importedImages: Object.keys(media).length, importedVideos: Object.values(media).filter((m) => m.videoSrc).length, failures }, null, 2));
if (failures.some((failure) => failure.kind === 'image')) process.exitCode = 1;
