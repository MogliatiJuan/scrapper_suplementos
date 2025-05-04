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

const BASE_URL = process.env.BASE_PAGE_URL;
const AUTH_URL = process.env.AUTH_PAGE_URL;
const VALID_BRANDS = [
  "Star",
  "Ena",
  "Gentech",
  "Gold",
  "Mervick",
  "Max force",
  "Granger",
];

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: +process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const REPORT_DIR = path.join(__dirname, "reports");
fs.mkdirSync(REPORT_DIR, { recursive: true });
app.use("/reports", express.static(REPORT_DIR));
const LAST_FILE = path.join(__dirname, "lastPrices.json");

function categorizeType(name) {
  const n = name.toLowerCase();
  if (n.includes("protein bar") || n.includes("barra"))   return "Barra de proteína";
  if (n.includes("whey")       || n.includes("proteína")) return "Proteína";
  if (n.includes("creatina"))                              return "Creatina";
  if (n.includes("bcaa")        || n.includes("amino"))    return "Aminoácidos / BCAA";
  if (n.includes("pre ")        || n.includes("pre-work"))return "Pre-workout";
  if (n.includes("gel"))                                  return "Gel energético";
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

function loadLast() {
  try {
    return JSON.parse(fs.readFileSync(LAST_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveLast(data) {
  fs.writeFileSync(LAST_FILE, JSON.stringify(data, null, 2));
}

async function generateAndSavePdf(html) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
  await browser.close();
  fs.writeFileSync(path.join(REPORT_DIR, "latest.pdf"), pdfBuffer);
}

async function generateAndSaveExcel(results) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Reporte");

  sheet.columns = [
    { header: "Marca",            key: "brand",         width: 20 },
    { header: "Producto",         key: "name",          width: 50 },
    { header: "Precio Público",   key: "publicPrice",   width: 15 },
    { header: "Precio Revendedor",key: "resellerPrice", width: 15 },
    { header: "Presentación",     key: "presentacion",  width: 15 },
    { header: "Sabor",            key: "sabor",         width: 15 },
    { header: "Stock",            key: "inStock",       width: 10 },
    { header: "Error",            key: "error",         width: 30 },
  ];

  results.forEach(p => {
    sheet.addRow({
      brand:         p.brand,
      name:          p.name,
      publicPrice:   p.publicPrice,
      resellerPrice: p.resellerPrice || "-",
      presentacion:  p.presentacion || "-",
      sabor:         p.sabor        || "-",
      inStock:       p.inStock === null ? "-" : (p.inStock ? "En stock" : "Sin stock"),
      error:         p.error        || ""
    });
  });

  const filePath = path.join(__dirname, "reports", "latest.xlsx");
  await workbook.xlsx.writeFile(filePath);
}

function diffPrices(oldArr, newArr) {
  const oldMap = Object.fromEntries(oldArr.map(p => [p.href,p]));
  const changes = [];
  for (const n of newArr) {
    const o = oldMap[n.href];
    if (!o) continue;
    if (o.publicPrice !== n.publicPrice || o.resellerPrice !== n.resellerPrice) {
      changes.push({
        href: n.href,
        name: n.name,
        oldPublic: o.publicPrice,
        newPublic: n.publicPrice,
        oldReseller: o.resellerPrice,
        newReseller: n.resellerPrice
      });
    }
  }
  return changes;
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
    <p style="margin-top:20px;">
      <a href="${process.env.BASE_URL}/reports/latest.pdf"
         style="display:inline-block;padding:10px 20px;
                background:#007bff;color:#fff;text-decoration:none;border-radius:4px;margin-right:10px">
        Descargar resumen (PDF)
      </a>
      <a href="${process.env.BASE_URL}/reports/latest.xlsx"
         style="display:inline-block;padding:10px 20px;
                background:#28a745;color:#fff;text-decoration:none;border-radius:4px">
        Descargar Excel
      </a>
    </p>
  `;
  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: process.env.TO_EMAIL,
    subject: `📈 Cambios de precio (${changes.length})`,
    html
  });
}

async function scrapeAll() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);

  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  const totalPages = await page.evaluate(() => {
    const sel = document.querySelector("ul.pagination select.form-control");
    return sel ? sel.options.length : 1;
  });
  console.log(`➡️ Total páginas: ${totalPages}`);

  const products = [];
  for (let i = 1; i <= totalPages; i++) {
    const listUrl = `${BASE_URL}?page=${i}`;
    console.log(`▶️ Público página ${i}/${totalPages}`);
    await page.goto(listUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".product-list__item", { timeout: 60000 });
    const cards = await page.$$eval(
      ".product-list__item",
      (nodes, brands) => nodes.map(card => {
        const link = card.querySelector("h3 a");
        const brandEl = card.querySelector("small.brand");
        const priceEl = card.querySelector(".price");
        if (!link||!brandEl||!priceEl) return null;
        const brand=brandEl.innerText.trim();
        if (!brands.some(b=>brand.toLowerCase().includes(b.toLowerCase()))) return null;
        return {
          name: link.innerText.trim(),
          href: link.href,
          brand,
          listPrice: priceEl.innerText.trim()
        };
      }).filter(Boolean),
      VALID_BRANDS
    );
    products.push(...cards);
  }
  console.log(`✅ Público scrapeado: ${products.length}`);

  console.log("🔐 Iniciando sesión...");
  await page.goto(AUTH_URL, { waitUntil: "domcontentloaded" });
  await page.type("input[name=_username]", process.env.VYJ_USER);
  await page.type("input[name=_password]", process.env.VYJ_PASS);
  await Promise.all([
    page.click("button[type=submit]"),
    page.waitForNavigation({ waitUntil: "networkidle0" })
  ]);

  console.log("✅ Sesión iniciada");

  const results = [];
  for (const item of products) {
    console.log(`   🔗 Revendedor: ${item.name}`);
    const rec = {
      name: item.name,
      brand: item.brand,
      publicPrice: item.listPrice,
      resellerPrice: null,
      presentacion: null,
      sabor: null,
      inStock: null,
      href: item.href,
      error: null
    };
    try {
      await page.goto(item.href, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector(".product-price .price", { timeout: 10000 });
      const info = await page.evaluate(()=>{
        const t = sel=>document.querySelector(sel)?.innerText.trim()||null;
        return {
          presentacion: t('tr[data-technical-info="PRESENTACION"] td span'),
          sabor:        t('tr[data-technical-info="SABOR"] td span'),
          resellerPrice:t(".product-price .price"),
          inStock:      (()=>{ 
            const b=document.querySelector(".primary-actions button")?.innerText.toLowerCase();
            return b? !b.includes("sin stock") : null;
          })()
        };
      });
      Object.assign(rec, info);
    } catch (e) {
      rec.error = e.message;
      console.warn(`      ⚠️ Error detalle: ${e.message}`);
    }
    results.push(rec);
  }
  await browser.close();
  console.log(`✅ Total scrapeado: ${results.length}`);
  return results;
}

app.get("/api/update-prices-pdf", async (req, res) => {
  const newData = await scrapeAll();
  const oldData = loadLast();
  const changes = diffPrices(oldData, newData);
  const groupedData = groupByBrandAndType(newData);

  if (changes.length > 0 || oldData.length === 0) {
    const templatePath = path.join(__dirname, "template.ejs");
    const html = await ejs.renderFile(templatePath, { grouped: groupedData  });
    await generateAndSavePdf(html);
    generateAndSaveExcel(newData);

    await sendChangeEmail(changes);

    saveLast(newData);

    res.send("✅ Cambios detectados y correo enviado.");
  } else {
    res.send("— No hay cambios de precio, no se envía correo.");
  }
});

app.get("/api/update-prices", async (req, res) => {
  try {
    const newData = await scrapeAll();
    await generateAndSaveExcel(newData);
    const filePath = path.join(REPORT_DIR, "latest.xlsx");
    res.download(filePath, "precios.xlsx", (err) => {
      if (err) {
        console.error("Error enviando el Excel:", err);
        res.status(500).send("Error al enviar el Excel");
      }
    });
  } catch (e) {
    console.error("Error en /api/update-prices:", e);
    res.status(500).send("Error interno al generar el Excel");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
