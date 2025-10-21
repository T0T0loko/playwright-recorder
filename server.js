import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

// Endpoint de prueba
app.post('/record', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Falta url' });

  // Definir carpeta donde Playwright guardó los navegadores
  const cacheBase = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/render/.cache/ms-playwright';

  // Rutas candidatas al ejecutable de Chromium
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

  const browser = await chromium.launch({
    headless: true,
    executablePath: exePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(url);
  await page.screenshot({ path: '/tmp/capture.png' });

  await browser.close();

  res.sendFile('/tmp/capture.png');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor Playwright listo en puerto ${PORT}`));

