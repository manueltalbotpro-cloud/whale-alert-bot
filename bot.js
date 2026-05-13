// ============================================================
//  BOT TELEGRAM — Alertes Whale Wallets × BTCUSDT Perp
//  Basé sur l'analyse : H8BgJ + 9WzDX (Solana) + HW20 (ETH)
// ============================================================

const TelegramBot = require("node-telegram-bot-api");
const config      = require("./config");
const monitor     = require("./monitor");

// ─── Init ───────────────────────────────────────────────────

if (config.TELEGRAM_TOKEN === "TON_TOKEN_ICI") {
  console.error("❌ Configure ton TELEGRAM_TOKEN dans config.js !");
  console.error("   1) Ouvre Telegram → cherche @BotFather");
  console.error("   2) Envoie /newbot → suis les instructions");
  console.error("   3) Copie le token dans config.js");
  process.exit(1);
}

const bot = new TelegramBot(config.TELEGRAM_TOKEN, { polling: true });
let btcPrice = null;
let isRunning = false;

// ─── Commandes Telegram ─────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, [
    `🤖 Bot Whale Alert BTCUSDT Perp`,
    ``,
    `Ton Chat ID : ${chatId}`,
    `(copie ce ID dans config.js)`,
    ``,
    `Commandes :`,
    `/status - Prix BTC + état wallets`,
    `/wallets - Wallets surveillés`,
    `/signal - Analyse manuelle`,
    `/stop - Arrêter le bot`,
    ``,
    `🔍 Surveillance active des wallets...`,
  ].join("\n"));
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const price  = await monitor.getBTCPrice();
  const zone   = price < config.THRESHOLDS.BTC_STRONG_ZONE
    ? "🔥 ZONE FORT (< $85k)"
    : price < config.THRESHOLDS.BTC_LOW_ZONE
    ? "✅ ZONE ACHAT (< $95k)"
    : "⚡ Hors zone optimale";

  await bot.sendMessage(chatId, [
    `📊 *Status — ${new Date().toISOString().substring(0, 16)} UTC*`,
    ``,
    `₿ *BTC Perp : $${price ? price.toLocaleString() : "N/A"}* — ${zone}`,
    ``,
    `🐋 *Wallet H8BgJ (Solana)* — USDC : ~688M`,
    `   → Capital non déployé, en attente`,
    `🐋 *Wallet 9WzDX (Solana)* — USDC : ~0`,
    `   → Surveille rechargement`,
    `🏦 *Binance HW20 (ETH)* — $41.92B`,
    `   → Surveille reshuffles internes`,
    ``,
    `⏱ Polling Solana : 2min | ETH : 10min`,
  ].join("\n"), { parse_mode: "Markdown" });
});

bot.onText(/\/wallets/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, [
    `🔎 *Wallets surveillés*`,
    ``,
    `*Wallet 1 — H8BgJ (Solana)*`,
    `\`H8BgJgae6qhMtf7BM2JtddywSQt11WdxHHxkGLNX5hss\``,
    `Capital : 687.9M USDC non déployé`,
    `Signal : transferts → Binance Solana Hot Wallet`,
    `Historique : +5% à +16% BTC en 4 semaines après dépôt`,
    ``,
    `*Wallet 2 — 9WzDX (Solana)*`,
    `\`9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\``,
    `Capital : ~0 USDC (vidé)`,
    `Signal : rechargement = précurseur de dépôt Binance`,
    ``,
    `*Wallet 3 — Binance HW20 (Ethereum)*`,
    `\`0xF977814e90dA44bFA03b6295A0616a897441aceC\``,
    `Capital : $41.92B (23 chaînes)`,
    `Signal : reshuffles USDT >$300M à BTC <$95k`,
    `Historique : +14.9% à +24.4% BTC en 4 semaines`,
    ``,
    `*Destination Binance Solana :*`,
    `\`5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9\``,
  ].join("\n"), { parse_mode: "Markdown" });
});

bot.onText(/\/signal/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, "🔍 Analyse en cours...");
  const price = await monitor.getBTCPrice();
  btcPrice = price;
  const [a1, a2, aE] = await Promise.all([
    monitor.checkSolanaWallet1(price),
    monitor.checkSolanaWallet2(price),
    monitor.checkEthWallet(price),
  ]);
  const all = [...a1, ...a2, ...aE];
  if (all.length === 0) {
    await bot.sendMessage(chatId, "✅ Aucun nouveau signal détecté.", { parse_mode: "Markdown" });
  } else {
    for (const a of all) {
      await bot.sendMessage(chatId, a.text, { parse_mode: "Markdown" });
    }
  }
});

bot.onText(/\/stop/, async (msg) => {
  await bot.sendMessage(msg.chat.id, "🛑 Bot arrêté. Relance avec `node bot.js`", { parse_mode: "Markdown" });
  process.exit(0);
});

// ─── Boucles de polling ─────────────────────────────────────

async function sendAlert(alert) {
  if (!config.TELEGRAM_CHAT_ID || config.TELEGRAM_CHAT_ID === "TON_CHAT_ID_ICI") {
    console.log("[ALERT]", alert.text);
    return;
  }
  try {
    await bot.sendMessage(config.TELEGRAM_CHAT_ID, alert.text, { parse_mode: "Markdown" });
  } catch (e) {
    console.error("[sendAlert]", e.message);
  }
}

async function pollPrice() {
  const price = await monitor.getBTCPrice();
  if (price) {
    const prev = btcPrice;
    btcPrice = price;
    // Alerter si BTC franchit une zone clé
    if (prev && prev >= config.THRESHOLDS.BTC_STRONG_ZONE && price < config.THRESHOLDS.BTC_STRONG_ZONE) {
      await sendAlert({
        text: [
          `🔥 *ALERTE PRIX — BTC ENTRE ZONE FORTE*`,
          ``,
          `₿ BTC vient de passer sous *$${config.THRESHOLDS.BTC_STRONG_ZONE.toLocaleString()}*`,
          `Prix actuel : *$${price.toLocaleString()}*`,
          ``,
          `📊 Historique : quand H8BgJ dépose ses USDC à ce niveau → BTC remonte de +5% à +16%`,
          `⏳ Surveille le wallet H8BgJ pour le signal de déclenchement`,
        ].join("\n"),
      });
    }
    if (prev && prev >= config.THRESHOLDS.BTC_LOW_ZONE && price < config.THRESHOLDS.BTC_LOW_ZONE) {
      await sendAlert({
        text: [
          `✅ *ALERTE PRIX — BTC EN ZONE D'ACHAT*`,
          ``,
          `₿ BTC vient de passer sous *$${config.THRESHOLDS.BTC_LOW_ZONE.toLocaleString()}*`,
          `Prix actuel : *$${price.toLocaleString()}*`,
          ``,
          `📊 Zone favorable selon l'historique des wallets whale`,
        ].join("\n"),
      });
    }
  }
}

async function pollSolana() {
  if (!btcPrice) btcPrice = await monitor.getBTCPrice();
  const [a1, a2] = await Promise.all([
    monitor.checkSolanaWallet1(btcPrice),
    monitor.checkSolanaWallet2(btcPrice),
  ]);
  for (const a of [...a1, ...a2]) {
    console.log(`[SIGNAL] Score ${a.score} — ${a.strength}`);
    await sendAlert(a);
  }
}

async function pollEth() {
  if (!btcPrice) btcPrice = await monitor.getBTCPrice();
  const alerts = await monitor.checkEthWallet(btcPrice);
  for (const a of alerts) {
    console.log(`[ETH SIGNAL] Score ${a.score} — ${a.strength}`);
    await sendAlert(a);
  }
}

// ─── Initialisation des signatures déjà connues ─────────────

async function initSeenSignatures() {
  console.log("[Init] Chargement des signatures existantes...");
  try {
    const r1 = await fetch(config.SOLANA_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
        params: [config.SOLANA_WHALE_1.usdcAccount, { limit: 20 }],
      }),
    });
    const d1 = await r1.json();
    const sigs1 = (d1.result || []).map(s => s.signature);

    await new Promise(r => setTimeout(r, 1500));

    const r2 = await fetch(config.SOLANA_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
        params: [config.SOLANA_WHALE_2.wallet, { limit: 10 }],
      }),
    });
    const d2 = await r2.json();
    const sigs2 = (d2.result || []).map(s => s.signature);

    monitor.seenInit(sigs1, sigs2);
    console.log(`[Init] ${sigs1.length} sigs wallet 1, ${sigs2.length} sigs wallet 2 mémorisées.`);
  } catch (e) {
    console.error("[Init]", e.message);
  }
}

// ─── Démarrage ───────────────────────────────────────────────

async function start() {
  console.log("🤖 Whale Alert Bot démarré");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  await initSeenSignatures();
  btcPrice = await monitor.getBTCPrice();
  console.log(`₿ BTC Perp : $${btcPrice?.toLocaleString() || "N/A"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 Surveillance active...");
  console.log("   Solana polling  : toutes les 2 min");
  console.log("   ETH polling     : toutes les 10 min");
  console.log("   Prix BTC        : toutes les 1 min");

  if (config.TELEGRAM_CHAT_ID && config.TELEGRAM_CHAT_ID !== "TON_CHAT_ID_ICI") {
    await sendAlert({
      text: [
        `🤖 *Bot Whale Alert démarré*`,
        ``,
        `₿ BTC Perp actuel : *$${btcPrice?.toLocaleString() || "N/A"}*`,
        btcPrice < config.THRESHOLDS.BTC_STRONG_ZONE
          ? `🔥 *ZONE FORTE — signal imminence élevée*`
          : btcPrice < config.THRESHOLDS.BTC_LOW_ZONE
          ? `✅ *Zone d'achat active*`
          : `⚡ Attente zone optimale (< $${config.THRESHOLDS.BTC_LOW_ZONE.toLocaleString()})`,
        ``,
        `📡 Surveillance des 3 wallets active`,
      ].join("\n"),
    });
  }

  // Lancer les boucles
  setInterval(pollPrice,  config.POLL_PRICE_MS);
  setInterval(pollSolana, config.POLL_SOLANA_MS);
  setInterval(pollEth,    config.POLL_ETH_MS);
}

start().catch(e => {
  console.error("Erreur fatale :", e);
  process.exit(1);
});
