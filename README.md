# 🥤 Scrapper de Suplementos

Este proyecto es un **scraper automatizado en Node.js** que obtiene precios de suplementos desde una página web, los compara con un snapshot previo y genera reportes diarios en **PDF** y **Excel**.  
Además, envía notificaciones por **Telegram** y **correo electrónico** cuando detecta cambios en los precios.

---

## ✨ Características

- ✅ Scraping de productos con precios de **público** y **revendedor**.  
- ✅ Comparación con precios anteriores y detección de cambios.  
- ✅ Generación automática de **PDF** y **Excel** con el detalle completo.  
- ✅ Notificaciones por **Telegram** de cambios detectados o errores.  
- ✅ Envío de emails con reportes adjuntos.  
- ✅ Endpoint para ejecutar scraping bajo demanda.  
- ✅ **GitHub Action** que corre el scraper automáticamente todos los días.

---

## 🛠 Tecnologías usadas

- **Node.js** + **Express** – servidor y endpoints.  
- **Puppeteer** – scraping y generación de PDF.  
- **ExcelJS** – creación de reportes en Excel.  
- **EJS** – template HTML para el reporte.  
- **Nodemailer** – envío de emails con reportes.  
- **Telegram Bot API** – notificaciones automáticas.  
- **GitHub Actions** – automatización diaria.  

---

## 📦 Instalación

Clona el repositorio y entra en la carpeta del proyecto:

```bash 
git clone https://github.com/usuario/scrapper-suplementos.git
cd scrapper-suplementos/server
```

Instala las dependencias:

```bash 
npm install
```

---

## ⚙️ Configuración

Crea un archivo `.env` en la raíz del proyecto en la carpeta *server* con las siguientes variables:

# Server
- PORT=4000
- NODE_ENV=development

# Scraping
- BASE_URL=https://ejemplo.com/productos
- AUTH_URL=https://ejemplo.com/login
- VYJ_USER=tu_usuario
- VYJ_PASS=tu_password

# Notificaciones Telegram
- TELEGRAM_TOKEN=xxxxxxxxxxxxxxxxxxxx
- TELEGRAM_CHAT_ID=123456789   # Puedes poner múltiples IDs separados por coma

# Email SMTP
- SMTP_HOST=smtp.tuservidor.com
- SMTP_PORT=587
- SMTP_USER=usuario@dominio.com
- SMTP_PASS=tu_password
- FROM_EMAIL=usuario@dominio.com
- TO_EMAIL=destinatario@dominio.com

---

## 🔌 Endpoints

El servidor expone algunos endpoints útiles:

- GET /api/update-prices-pdf  
  Ejecuta el scraping completo, genera PDF y Excel, envía notificaciones y emails.

- GET /api/update-prices  
  Ejecuta scraping y devuelve el último Excel generado para descarga.

Ejemplo:

curl http://localhost:4000/api/update-prices

---

## 🤖 Automatización con GitHub Actions

El proyecto incluye un workflow en `.github/workflows/daily-info.yml` que ejecuta el scraper automáticamente todos los días.

El flujo:

1. Instala dependencias.  
2. Corre el scraper con `node server.js scrape`.  
3. Envía notificaciones y emails si detecta cambios.  

Puedes personalizar la frecuencia editando el cron job en `daily-info.yml`.

---

## 📂 Estructura del proyecto

```
📦bfm_suplementos
 ┣ 📂.git
 ┣ 📂.github
 ┃ ┗ 📂workflows
 ┃ ┃ ┗ 📜daily-info.yml
 ┣ 📂client
 ┃ ┣ 📂public
 ┃ ┃ ┗ 📜vite.svg
 ┃ ┣ 📂src
 ┃ ┃ ┣ 📂assets
 ┃ ┃ ┃ ┗ 📜react.svg
 ┃ ┃ ┣ 📜App.css
 ┃ ┃ ┣ 📜App.jsx
 ┃ ┃ ┣ 📜index.css
 ┃ ┃ ┗ 📜main.jsx
 ┃ ┣ 📜.eslintrc.cjs
 ┃ ┣ 📜.gitignore
 ┃ ┣ 📜index.html
 ┃ ┣ 📜package-lock.json
 ┃ ┣ 📜package.json
 ┃ ┣ 📜README.md
 ┃ ┗ 📜vite.config.js
 ┣ 📂reports
 ┣ 📂server
 ┃ ┣ 📂reports
 ┃ ┣ 📜.env
 ┃ ┣ 📜.gitignore
 ┃ ┣ 📜lastPrices.json
 ┃ ┣ 📜package-lock.json
 ┃ ┣ 📜package.json
 ┃ ┣ 📜README.md
 ┃ ┣ 📜server.js
 ┃ ┣ 📜telegram.js
 ┃ ┗ 📜template.ejs
 ┣ 📜LICENSE
 ┗ 📜README.md
```
---

## 📜 Licencia

Este proyecto se distribuye bajo la licencia **MIT**.  
¡Eres libre de usarlo y adaptarlo según tus necesidades!
