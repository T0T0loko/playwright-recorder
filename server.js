// server.js
import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

// Endpoint para capturar página
app.post('/record', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Falta url' });

  // Ruta base donde Render guarda los navegadores
  const cacheBase = '/opt/render/.cache/ms-playwright';

  // Posibles rutas de Chromium
  const candidates = [
    path.join(cacheBase, 'chromium_headless_shell-1194', 'chrome-linux', 'headless_shell'),
    path.join(cacheBase, 'chromium-1194', 'chrome-linux', 'chrome'),
    path.join(cacheBase, 'chromium-1194', 'chrome-linux', 'headless_shell')
  ];

  // Buscar ejecutable existente
  const exePath = candidates.find(p => fs.existsSync(p));

  if (!exePath) {
    console.error('No se encontró ejecutable Chromium en:', candidates);
    return res.status(500).json({ error: 'Chromium no encontrado' });
  }

  console.log('Usando Chromium en:', exePath);

  try {
    const browser = await chromium.launch({
      headless: true,
      executablePath: exePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    const screenshotPath = '/tmp/capture.png';
    await page.screenshot({ path: screenshotPath });

    await browser.close();

    res.sendFile(screenshotPath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error ejecutando Playwright' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor Playwright listo en puerto ${PORT}`));
