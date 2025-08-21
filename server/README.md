# 📡 Servidor – Scrapper de Suplementos

Este directorio contiene el **núcleo del scraper** y la API.

---

## 📂 Archivos principales

- `server.js` → Core del scraper y API Express.  
- `telegram.js` → Notificaciones de cambios y errores a Telegram.  
- `template.ejs` → Plantilla HTML para generar el reporte en PDF.  

---

## ▶️ Ejecución

Para correr el servidor localmente:

```bash
npm install
node server.js scrape
