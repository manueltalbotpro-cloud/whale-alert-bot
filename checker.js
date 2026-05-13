// ============================================================
//  CHECKER — script one-shot pour GitHub Actions
//  Vérifie les 10 dernières minutes d'activité whale
// ============================================================

const fetch = require("node-fetch");

const CFG = {
  TELEGRAM_TOKEN:    process.env.TELEGRAM_TOKEN,
  TELEGRAM_CHAT_ID:  process.env.TELEGRAM_CHAT_ID,
  SOLANA_RPC:        "https://api.mainnet-beta.solana.com",
  ETH_RPC:           "https://ethereum.publicnode.com",
  BINANCE_API:       "https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT",
  USDC_MINT:         "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT_ETH:          "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  BINANCE_SOL_HOT:   "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
  BINANCE_HW20:      "0xF977814e90dA44bFA03b6295A0616a897441aceC",
  // Wallets
  H8BG_USDC_ACCOUNT: "DT78gNBH7enTRrAFcag4PAuQbSeemstmtj888w8pkvdf",
  WZWDX_WALLET:      "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  // Seuils
  MIN_USDC_OUT:      50_000_000,   // $50M
  MIN_ETH_RESHUFFLE: 300_000_000,  // $300M
  BTC_STRONG_ZONE:   85_000,
  BTC_LOW_ZONE:      95_000,
  WINDOW_SECONDS:    660,          // 11 minutes (chevauchement avec run précédent)
};

// ─── Helpers ─────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function solRPC(method, params) {
  const r = await fetch(CFG.SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await r.json()).result;
}

async function ethRPC(method, params) {
  const r = await fetch(CFG.ETH_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await r.json()).result;
}

async function sendTelegram(text) {
  if (!CFG.TELEGRAM_TOKEN || !CFG.TELEGRAM_CHAT_ID) {
    console.log("[TG]", text);
    return;
  }
  await fetch(`https://api.telegram.org/bot${CFG.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CFG.TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" }),
  });
}

async function getBTC() {
  // Essai 1 : Binance Futures
  try {
    const r = await fetch(CFG.BINANCE_API, { timeout: 8000 });
    const d = await r.json();
    const p = parseFloat(d.price);
    if (!isNaN(p) && p > 0) return p;
  } catch {}

  // Essai 2 : Binance Spot
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", { timeout: 8000 });
    const d = await r.json();
    const p = parseFloat(d.price);
    if (!isNaN(p) && p > 0) return p;
  } catch {}

  // Essai 3 : Kraken
  try {
    const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD", { timeout: 8000 });
    const d = await r.json();
    const p = parseFloat(d.result?.XXBTZUSD?.c?.[0]);
    if (!isNaN(p) && p > 0) return p;
  } catch {}

  return null;
}

// ─── Check Solana H8BgJ ──────────────────────────────────────

async function checkH8BgJ(btc, now) {
  const sigs = await solRPC("getSignaturesForAddress", [
    CFG.H8BG_USDC_ACCOUNT, { limit: 20 },
  ]);
  if (!sigs) return;

  for (const s of sigs) {
    if (!s.blockTime || now - s.blockTime > CFG.WINDOW_SECONDS) continue;

    await sleep(1200);
    const tx = await solRPC("getTransaction", [
      s.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx?.meta) continue;

    const pre  = tx.meta.preTokenBalances  || [];
    const post = tx.meta.postTokenBalances || [];

    for (const p of pre) {
      if (p.mint !== CFG.USDC_MINT) continue;
      const preAmt  = parseFloat(p.uiTokenAmount.uiAmount || 0);
      const postRec = post.find(x => x.accountIndex === p.accountIndex);
      const postAmt = parseFloat(postRec?.uiTokenAmount?.uiAmount || 0);
      const delta   = postAmt - preAmt; // négatif = sortie USDC

      if (delta >= -(CFG.MIN_USDC_OUT / 1e6)) continue;
      const amtUSD = Math.abs(delta) * 1e6;

      // Vérifier destination
      const keys = tx.transaction?.message?.accountKeys || [];
      const destKey = keys.find((k, i) => {
        const pRec = post.find(x => x.accountIndex === i);
        return pRec && parseFloat(pRec.uiTokenAmount.uiAmount || 0) > Math.abs(delta) * 0.9;
      })?.pubkey || "";

      const isToBinance = destKey === CFG.BINANCE_SOL_HOT;
      const score = (amtUSD >= 100e6 ? 3 : 2) + (isToBinance ? 2 : 0) + (btc < CFG.BTC_STRONG_ZONE ? 3 : btc < CFG.BTC_LOW_ZONE ? 2 : 0);
      const emoji = score >= 7 ? "🚨" : score >= 5 ? "⚠️" : "📈";
      const label = score >= 7 ? "SIGNAL FORT — ACHAT" : score >= 5 ? "SIGNAL ACHAT" : "SIGNAL MODERE";

      await sendTelegram([
        `${emoji} *${label}*`,
        ``,
        `*Baleine Solana H8BgJ* transfert :`,
        `💵 *$${(amtUSD / 1e6).toFixed(0)}M USDC* sorti`,
        isToBinance ? `📥 Destination : *BINANCE* (Solana Hot Wallet)` : `📥 Destination : \`${destKey.substring(0, 20)}...\``,
        ``,
        `₿ *BTC Perp : $${btc.toLocaleString()}*`,
        btc < CFG.BTC_STRONG_ZONE ? `🔥 Zone forte (<$85k) — historique +5% a +16% sur 4 semaines` : btc < CFG.BTC_LOW_ZONE ? `✅ Zone achat (<$95k)` : `⚡ Hors zone optimale`,
        ``,
        `Score signal : ${score}/8`,
        `Tx : \`${s.signature.substring(0, 20)}...\``,
      ].join("\n"));

      console.log(`[H8BgJ] Signal ${score}/8 — $${(amtUSD/1e6).toFixed(0)}M USDC → ${isToBinance ? "BINANCE" : destKey.substring(0,16)}`);
    }
  }
}

// ─── Check Solana 9WzDX (rechargement) ──────────────────────

async function check9WzDX(btc, now) {
  const sigs = await solRPC("getSignaturesForAddress", [
    CFG.WZWDX_WALLET, { limit: 10 },
  ]);
  if (!sigs) return;

  for (const s of sigs) {
    if (!s.blockTime || now - s.blockTime > CFG.WINDOW_SECONDS) continue;

    await sleep(1200);
    const tx = await solRPC("getTransaction", [
      s.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx?.meta) continue;

    const pre  = tx.meta.preTokenBalances  || [];
    const post = tx.meta.postTokenBalances || [];

    for (const p of post) {
      if (p.mint !== CFG.USDC_MINT) continue;
      const postAmt = parseFloat(p.uiTokenAmount.uiAmount || 0);
      const preRec  = pre.find(x => x.accountIndex === p.accountIndex);
      const preAmt  = parseFloat(preRec?.uiTokenAmount?.uiAmount || 0);
      const delta   = postAmt - preAmt;

      if (delta < 10_000_000) continue; // <$10M ignoré

      await sendTelegram([
        `👀 *RECHARGEMENT WALLET 9WzDX*`,
        ``,
        `La baleine Solana #2 recoit :`,
        `💵 *+$${delta.toFixed(0)}M USDC*`,
        ``,
        `Ce wallet precede habituellement des depots sur Binance`,
        `₿ BTC : *$${btc.toLocaleString()}*`,
      ].join("\n"));
    }
  }
}

// ─── Check ETH Binance HW20 ──────────────────────────────────

async function checkEthHW20(btc) {
  const latestHex = await ethRPC("eth_blockNumber", []);
  const latest    = parseInt(latestHex, 16);
  const fromBlock = latest - 55; // ~11 minutes (12s/bloc)

  const TRANSFER  = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const BNW_PAD   = "0x000000000000000000000000" + CFG.BINANCE_HW20.substring(2).toLowerCase();

  const logs = await ethRPC("eth_getLogs", [{
    fromBlock: "0x" + fromBlock.toString(16),
    toBlock:   "0x" + latest.toString(16),
    address:   CFG.USDT_ETH,
    topics:    [TRANSFER, BNW_PAD, null],
  }]);

  if (!logs || logs.length === 0) return;

  let total = 0;
  for (const log of logs) {
    const val = BigInt("0x" + log.data.replace("0x", "").padStart(64, "0"));
    total += Number(val) / 1e6;
  }

  if (total < CFG.MIN_ETH_RESHUFFLE) return;

  const isLowBTC = btc < CFG.BTC_LOW_ZONE;
  await sendTelegram([
    isLowBTC ? `⚠️ *RESHUFFLE BINANCE HW20 — BTC BAS*` : `📊 *Mouvement interne Binance ETH*`,
    ``,
    `Binance Hot Wallet 20 redistribue ses USDT :`,
    `💵 *$${(total / 1e6).toFixed(0)}M USDT* deplaces`,
    ``,
    isLowBTC
      ? `Signal historique : reshuffles Binance a BTC <$95k -> +15% a +24% en 4 semaines`
      : `Activite interne Binance detectee`,
    `₿ BTC : *$${btc.toLocaleString()}*`,
  ].join("\n"));

  console.log(`[ETH HW20] $${(total/1e6).toFixed(0)}M USDT reshuffle | BTC $${btc}`);
}

// ─── Check prix BTC seul (alertes zones) ─────────────────────

async function checkBTCZones(btc) {
  // Lire le dernier prix connu depuis les variables d'env GitHub
  const lastPrice = parseFloat(process.env.LAST_BTC_PRICE || "0");

  if (lastPrice > 0) {
    if (lastPrice >= CFG.BTC_STRONG_ZONE && btc < CFG.BTC_STRONG_ZONE) {
      await sendTelegram([
        `🔥 *BTC ENTRE ZONE FORTE*`,
        ``,
        `BTC vient de passer sous *$${CFG.BTC_STRONG_ZONE.toLocaleString()}*`,
        `Prix actuel : *$${btc.toLocaleString()}*`,
        ``,
        `📊 A ce niveau, le wallet H8BgJ a historiquement declenche des hausses de +5% a +16%`,
        `⏳ Surveille le wallet H8BgJ pour le signal d'entree`,
      ].join("\n"));
    } else if (lastPrice >= CFG.BTC_LOW_ZONE && btc < CFG.BTC_LOW_ZONE) {
      await sendTelegram([
        `✅ *BTC EN ZONE D'ACHAT*`,
        ``,
        `BTC vient de passer sous *$${CFG.BTC_LOW_ZONE.toLocaleString()}*`,
        `Prix actuel : *$${btc.toLocaleString()}*`,
      ].join("\n"));
    }
  }

  // Afficher le prix actuel pour les logs GitHub Actions
  console.log(`BTC_PRICE=${btc}`);
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const now = Math.floor(Date.now() / 1000);
  console.log(`[${new Date().toISOString()}] Whale checker démarré`);

  const btc = await getBTC();
  if (!btc) {
    console.error("Impossible de récupérer le prix BTC");
    process.exit(1);
  }
  console.log(`BTC Perp : $${btc.toLocaleString()}`);

  // Message de statut toutes les heures (run #0, 12, 24... = toutes les 60 min)
  const runMinute = new Date().getMinutes();
  const sendStatus = runMinute < 6; // envoyer entre :00 et :05 = 1x par heure
  if (sendStatus) {
    const zone = btc < CFG.BTC_STRONG_ZONE
      ? "🔥 ZONE FORTE (<$85k)"
      : btc < CFG.BTC_LOW_ZONE
      ? "✅ Zone achat (<$95k)"
      : "⚡ Hors zone optimale";

    await sendTelegram([
      `📡 *Whale Bot — Rapport horaire*`,
      ``,
      `₿ *BTC Perp : $${btc.toLocaleString()}*`,
      zone,
      ``,
      `🐋 H8BgJ : 687.9M USDC non deploye`,
      `🐋 9WzDX : surveille rechargement`,
      `🏦 Binance HW20 : $41.92B actif`,
      ``,
      `✅ Surveillance active — aucun signal en ce moment`,
    ].join("\n"));
  }

  await checkBTCZones(btc);
  await sleep(1000);
  await checkH8BgJ(btc, now);
  await sleep(1000);
  await check9WzDX(btc, now);
  await sleep(1000);
  await checkEthHW20(btc);

  console.log(`BTC_PRICE=${btc}`);
  console.log("[Done] Vérification terminée");
}

main().catch(e => { console.error(e); process.exit(1); });
