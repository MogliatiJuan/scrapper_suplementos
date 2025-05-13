#!/usr/bin/env node
require("dotenv").config();

const express = require("express");
const puppeteer = require("puppeteer");
const ejs = require("ejs");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const nodemailer = require("nodemailer");
const ExcelJS = require("exceljs");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 4000;
const BASE_URL = process.env.BASE_URL;
const AUTH_URL = process.env.AUTH_URL;
const VALID_BRANDS = ["Star", "Ena", "Gentech", "Gold", "Mervick", "Max force", "Granger"];

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: +process.env.SMTP_PORT,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

const REPORT_DIR = path.join(__dirname, "reports");
fs.mkdirSync(REPORT_DIR, { recursive: true });
app.use("/reports", express.static(REPORT_DIR));

const LAST_FILE = path.join(__dirname, "lastPrices.json");
function loadLast() {
  try { return JSON.parse(fs.readFileSync(LAST_FILE, "utf8")); }
  catch { return []; }
}
function saveLast(data) {
  fs.writeFileSync(LAST_FILE, JSON.stringify(data, null, 2));
}

function categorizeType(name) {
  const n = name.toLowerCase();
  if (n.includes("protein bar") || n.includes("barra")) return "Barra de proteína";
  if (n.includes("whey") || n.includes("proteína")) return "Proteína";
  if (n.includes("creatina")) return "Creatina";
  if (n.includes("bcaa") || n.includes("amino")) return "Aminoácidos / BCAA";
  if (n.includes("pre ") || n.includes("pre-work")) return "Pre-workout";
  if (n.includes("gel")) return "Gel energético";
  return "Otros";
}
function groupByBrandAndType(products) {
  return products.reduce((acc, p) => {
    const type = categorizeType(p.name);
    acc[p.brand] = acc[p.brand] || {};
    acc[p.brand][type] = acc[p.brand][type] || [];
    acc[p.brand][type].push(p);
    return acc;
  }, {});
}

function diffPrices(oldArr, newArr) {
  if (oldArr.length === 0) {
    return newArr.map(n => ({
      href: n.href, name: n.name,
      oldPublic: "-", newPublic: n.publicPrice,
      oldReseller: "-", newReseller: n.resellerPrice
    }));
  }
  const oldMap = Object.fromEntries(oldArr.map(p => [p.href, p]));
  const changes = [];
  for (const n of newArr) {
    const o = oldMap[n.href];
    if (!o) continue;
    if (o.publicPrice !== n.publicPrice || o.resellerPrice !== n.resellerPrice) {
      changes.push({
        href: n.href, name: n.name,
        oldPublic: o.publicPrice, newPublic: n.publicPrice,
        oldReseller: o.resellerPrice, newReseller: n.resellerPrice
      });
    }
  }
  return changes;
}

async function generateAndSavePdf(html) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-gpu"
    ]
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const buf = await page.pdf({ format: "A4", printBackground: true });
  await browser.close();
  fs.writeFileSync(path.join(REPORT_DIR, "latest.pdf"), buf);
}

async function generateAndSaveExcel(results) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Reporte");
  ws.columns = [
    { header: "Marca", key: "brand", width: 20 },
    { header: "Producto", key: "name", width: 50 },
    {
      header: "Precio Público",
      key: "publicPrice",
      width: 15,
      style: { numFmt: "#.##0,00" }
    },
    {
      header: "Precio Revendedor",
      key: "resellerPrice",
      width: 15,
      style: { numFmt: "#.##0,00" }
    },
    { header: "Presentación", key: "presentacion", width: 15 },
    { header: "Sabor", key: "sabor", width: 15 },
    { header: "Stock", key: "inStock", width: 10 },
    { header: "Error", key: "error", width: 30 }
  ];

  results.forEach(p => {
    const rawPub = (p.publicPrice || "").replace(/[^\d.,]/g, "");
    const rawRev = (p.resellerPrice || "").replace(/[^\d.,]/g, "");
    const numPub = parseFloat(rawPub.replace(/\./g, "").replace(/,/g, ".")) || 0;
    const numRev = parseFloat(rawRev.replace(/\./g, "").replace(/,/g, ".")) || 0;

    ws.addRow({
      brand: p.brand,
      name: p.name,
      publicPrice: numPub,
      resellerPrice: numRev,
      presentacion: p.presentacion || "-",
      sabor: p.sabor || "-",
      inStock: p.inStock === null ? "-" : (p.inStock ? "En stock" : "Sin stock"),
      error: p.error || ""
    });
  });

  await wb.xlsx.writeFile(path.join(REPORT_DIR, "latest.xlsx"));
}

async function sendChangeEmail(changes) {
  const rows = changes.map(c => `
    <tr>
      <td><a href="${c.href}">${c.name}</a></td>
      <td>${c.oldPublic} → ${c.newPublic}</td>
      <td>${c.oldReseller || "-"} → ${c.newReseller || "-"}</td>
    </tr>
  `).join("");
  const html = `
    <p>Se han detectado cambios en ${changes.length} productos:</p>
    <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse">
      <thead><tr><th>Producto</th><th>Precio Público</th><th>Precio Revendedor</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Adjunto encontrarás el PDF y el Excel con el detalle completo.</p>
  `;
  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: process.env.TO_EMAIL,
    subject: `📈 Cambios de precio (${changes.length})`,
    html,
    attachments: [
      { filename: "reporte-precios.pdf", path: path.join(REPORT_DIR, "latest.pdf"), contentType: "application/pdf" },
      { filename: "reporte-precios.xlsx", path: path.join(REPORT_DIR, "latest.xlsx"), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    ]
  });
}

async function scrapeAll() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-extensions", "--disable-gpu"]
  });
  const page = await browser.newPage();

  await page.goto(BASE_URL, { waitUntil: "networkidle0", timeout: 60000 });
  const totalPages = await page.evaluate(() => {
    const sel = document.querySelector("ul.pagination select.form-control");
    return sel ? sel.options.length : 1;
  });


  const products = [];
  for (let i = 1; i <= totalPages; i++) {
    await page.goto(`${BASE_URL}?page=${i}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".product-list__item");
    const cards = await page.$$eval(".product-list__item", (nodes, brands) =>
      nodes.map(card => {
        const linkEl = card.querySelector("h3 a");
        const brandEl = card.querySelector("small.brand");
        const priceEl = card.querySelector(".price");
        if (!linkEl || !brandEl || !priceEl) return null;
        const brand = brandEl.innerText.trim();
        if (!brands.some(b => brand.toLowerCase().includes(b.toLowerCase())))
          return null;
        return {
          href: linkEl.href,
          name: linkEl.innerText.trim(),
          brand,
          publicPrice: priceEl.innerText.trim()
        };
      }).filter(Boolean),
      VALID_BRANDS
    );
    products.push(...cards);
  }

  const validProducts = products.filter(p => {
    const raw = (p.publicPrice || "").replace(/[^\d.,]/g, "")
    if (!raw) return false

    const [intPart, decPart = ""] = raw.split(",")
    const numInt = parseInt(intPart.replace(/\./g, ""), 10) || 0
    const numDec = parseInt(decPart.padEnd(2, "0").slice(0, 2), 10) || 0

    return !(numInt === 0 && numDec === 0)
  })

  await page.goto(AUTH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.type("input[name=_username]", process.env.VYJ_USER);
  await page.type("input[name=_password]", process.env.VYJ_PASS);
  await Promise.all([
    page.click("button[type=submit]"),
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 60000 })
  ]);

  for (const p of validProducts) {
    await page.goto(p.href, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".product-price .price", { timeout: 60000 });
    const spans = await page.$$eval(
      ".product-price .price",
      els => els.map(el => el.innerText.trim())
    );

    p.resellerPrice = spans[1] ?? spans[0] ?? null;
  }

  await browser.close();
  return validProducts;
}


async function runDailyJob() {
  const newData = await scrapeAll();
  const oldData = loadLast();
  const changes = diffPrices(oldData, newData);

  if (changes.length > 0 || oldData.length === 0) {
    const grouped = groupByBrandAndType(newData);
    const html = await ejs.renderFile(path.join(__dirname, "template.ejs"), { grouped });
    await generateAndSavePdf(html);
    await generateAndSaveExcel(newData);
    await sendChangeEmail(changes);
    saveLast(newData);
    console.log("✅ Job completado");
  } else {
    console.log("— Sin cambios, no se envía mail");
  }
}

app.get("/api/update-prices-pdf", async (req, res) => {
  try {
    await runDailyJob();
    res.send("✅ Listo!");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error");
  }
});

app.get("/api/update-prices", async (req, res) => {
  try {
    const data = await scrapeAll();
    await generateAndSaveExcel(data);
    res.download(path.join(REPORT_DIR, "latest.xlsx"), "precios.xlsx");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error");
  }
});

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === "scrape") {
    runDailyJob()
      .catch(err => { console.error(err); process.exit(1); })
      .then(() => process.exit(0));
  } else {
    app.listen(PORT, () => console.log(`🚀 Server en http://localhost:${PORT}`));
  }
}
