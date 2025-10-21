import express from "express";
import { chromium } from "playwright";
import fs from "fs";

const app = express();
app.use(express.json());

app.post("/record", async (req, res) => {
  const { url } = req.body;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ recordVideo: { dir: "./" } });
  const page = await context.newPage();

  await page.goto(url);
  await page.waitForTimeout(5000); // espera 5s
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(3000);
  
  await browser.close();

  const videoPath = fs.readdirSync("./").find(f => f.endsWith(".webm"));
  res.download(videoPath);
});

app.listen(10000, () => console.log("Servidor Playwright listo en puerto 10000"));
