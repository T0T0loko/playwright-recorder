// server.js
import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import util from 'util';

const app = express();
app.use(express.json());

function listDir(p) {
  try { return fs.readdirSync(p); } catch (e) { return null; }
}

function findExecutablesRecursively(baseDir) {
  const results = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const name = entry.name.toLowerCase();
        if (name.includes('headless_shell') || name.includes('chrome') || name.includes('chromium')) {
          results.push(full);
        }
      }
    }
  }
  walk(baseDir);
  return results;
}

app.post('/record', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Falta url' });

  // 1) ruta dentro del repo (donde forcé la instalación)
  const projectLocalBrowsers = path.join(process.cwd(), '.ms-playwright');
  // 2) ruta de cache del sistema (fallback)
  const cacheBase = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/render/.cache/ms-playwright';

  console.log('=== DEBUG: comprobando cache de playwright en (project):', projectLocalBrowsers);
  console.log('=== DEBUG: comprobando cache de playwright en (system):', cacheBase);

  const topLocal = listDir(projectLocalBrowsers);
  const topSystem = listDir(cacheBase);
  console.log('Contenido top-level (local):', util.inspect(topLocal, { depth: 2 }));
  console.log('Contenido top-level (system):', util.inspect(topSystem, { depth: 2 }));

  // candidatos: primero en carpeta del repo, luego en cache del sistema
  const candidates = [
    path.join(projectLocalBrowsers, 'chromium-1194', 'chrome-linux', 'headless_shell'),
    path.join(projectLocalBrowsers, 'chromium_headless_shell-1194', 'chrome-linux', 'headless_shell'),
    path.join(projectLocalBrowsers, 'chromium-1194', 'chrome-linux', 'chrome'),
    path.join(cacheBase, 'chromium_headless_shell-1194', 'chrome-linux', 'headless_shell'),
    path.join(cacheBase, 'chromium-1194', 'chrome-linux', 'chrome'),
    path.join(cacheBase, 'chromium-1194', 'chrome-linux', 'headless_shell')
  ];

  // búsqueda recursiva como fallback si los candidatos directos no existen
  const foundRecursive = findExecutablesRecursively(projectLocalBrowsers).concat(findExecutablesRecursively(cacheBase));
  console.log('Resultados de búsqueda recursiva (match chrome/headless/chromium):', foundRecursive);

  // construir lista final de candidatos reales
  const exeCandidates = [];
  for (const c of candidates.concat(foundRecursive)) {
    try { if (fs.existsSync(c) && fs.statSync(c).isFile()) exeCandidates.push(c); } catch (e) {}
  }

  if (exeCandidates.length === 0) {
    const message = {
      error: 'No se encontró ejecutable Chromium en cache ni en .ms-playwright',
      projectLocal: topLocal,
      systemCache: topSystem,
      recursiveFound: foundRecursive
    };
    console.error('ERROR:', message);
    return res.status(500).json(message);
  }

  const exePath = exeCandidates[0];
  console.log('Usando ejecutable detectado:', exePath);

  try {
    const launchOptions = {
      headless: true,
      executablePath: exePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };

    const browser = await chromium.launch(launchOptions);
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    const screenshotPath = '/tmp/capture.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });

    await browser.close();

    // enviar la captura
    return res.sendFile(screenshotPath);
  } catch (err) {
    console.error('Error ejecutando Playwright con exePath:', exePath, err);
    return res.status(500).json({ error: 'Error ejecutando Playwright', details: String(err.message || err) });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor Playwright listo en puerto ${PORT}`));
