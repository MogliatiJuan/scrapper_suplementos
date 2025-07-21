import fetch from 'node-fetch';

function formatChange(c) {
  const pubChanged = c.oldPublic !== c.newPublic;
  const revChanged = c.oldReseller !== c.newReseller;

  if (!pubChanged && !revChanged) return null;

  return `• *${c.name}*\n` +
    `  Público: ${
      pubChanged
        ? `${c.oldPublic} → *${c.newPublic}*`
        : `${c.newPublic}`
    }\n` +
    `  Rev.: ${
      revChanged
        ? `${c.oldReseller || "-"} → *${c.newReseller || "-"}*`
        : `${c.newReseller || "-"}`
    }`;
}

async function notifyTelegram(changes) {
  if (!process.env.TELEGRAM_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;

  const filtered = changes
    .map(formatChange)
    .filter(Boolean);

  if (filtered.length === 0) return;

  const limit = 10;
  const msg =
    `📢 Cambios detectados en ${filtered.length} productos:\n\n` +
    filtered.slice(0, limit).join("\n\n") +
    (filtered.length > limit ? `\n\nY ${filtered.length - limit} más...` : "");

  await sendTelegramMessage(msg, true);
}

async function notifyTelegramError(errorMessage) {
  if (!process.env.TELEGRAM_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;

  const msg = `🚨 *Error detectado en el scraper:*

\`${errorMessage}\``;
  await sendTelegramMessage(msg, true);
}

async function sendTelegramMessage(text, isError = false) {
  const chatIds = process.env.TELEGRAM_CHAT_ID?.split(",").map(id => id.trim());

  if (!process.env.TELEGRAM_TOKEN || !chatIds?.length) return;

  for (const chat_id of chatIds) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text,
          parse_mode: "Markdown"
        })
      });

      const data = await res.json();
      if (!data.ok) {
        console.error(`❌ Telegram error para chat_id ${chat_id}:`, data);
      } else {
        console.log(`📲 Notificación enviada a ${chat_id}`);
      }
    } catch (err) {
      console.error(`❌ Error enviando a ${chat_id}:`, err.message);
    }
  }
}

export { notifyTelegram, notifyTelegramError };