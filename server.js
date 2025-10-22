// server.js (versión con logging y búsqueda recursiva del ejecutable)
import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import util from 'util';

const app = express();
app.use(express.json());

function listDir(p) {
  try {
    return fs.readdirSync(p);
  } catch (e) {
    return null;
  }
}

function findExecutablesRecursively(baseDir) {
  const results = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const name = entry.name.toLowerCase();
        // nombres típicos que Playwright usa
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

  const cacheBase = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/render/.cache/ms-playwright';

  // Loguear contenido del cache para depuración
  console.log('=== DEBUG: comprobando cache de playwright en:', cacheBase);
  const top = listDir(cacheBase);
  console.log('Contenido top-level de cacheBase:', util.inspect(top, { depth: 2 }));

  // Buscar candidatos recursivamente
  const found = findExecutablesRecursively(cacheBase);
  console.log('Resultados de búsqueda recursiva de ejecutables (match chrome/headless/chromium):', found);

  // Filtrar por existencias
  const exeCandidates = (found || []).filter(p => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile();
    } catch (e) {
      return false;
    }
  });

  if (exeCandidates.length === 0) {
    const message = {
      error: 'No se encontró ejecutable Chromium en cache',
      cacheBase,
      topLevel: top,
      recursiveFound: found
    };
    console.error('ERROR:', message);
    // Devolver info mínima al cliente para que no quede en blanco (prod: quitar detalles)
    return res.status(500).json(message);
  }

  // Elegir primer candidato razonable
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
