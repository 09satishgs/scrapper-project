import fs from 'node:fs/promises';
import path from 'node:path';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch HTML from URL or read from local cache if already present.
 * @param {string} url - Target URL
 * @param {string} localFilePath - Local relative or absolute path to save/read HTML
 * @param {number} delayMs - Delay before live request to avoid rate-limiting
 * @returns {Promise<{html: string, raw_source: string}>}
 */
export async function fetchOrCache(url, localFilePath, delayMs = 300) {
  const resolvedPath = path.resolve(localFilePath);
  
  // Check if file already exists locally
  try {
    const existing = await fs.readFile(resolvedPath, 'utf-8');
    if (existing && existing.length > 500) {
      // Normalize raw_source relative to project root
      const relativeSource = path.relative(process.cwd(), resolvedPath).replace(/\\/g, '/');
      return { html: existing, raw_source: relativeSource };
    }
  } catch (err) {
    // File doesn't exist, proceed to fetch
  }

  // Ensure parent directory exists
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

  if (delayMs > 0) {
    await sleep(delayMs);
  }

  let attempts = 0;
  const maxAttempts = 3;
  while (attempts < maxAttempts) {
    try {
      attempts++;
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText} for ${url}`);
      }

      const html = await res.text();
      await fs.writeFile(resolvedPath, html, 'utf-8');
      const relativeSource = path.relative(process.cwd(), resolvedPath).replace(/\\/g, '/');
      return { html, raw_source: relativeSource };
    } catch (err) {
      console.warn(`[Downloader] Attempt ${attempts} failed for ${url}: ${err.message}`);
      if (attempts >= maxAttempts) {
        throw err;
      }
      await sleep(1000 * attempts);
    }
  }
}
