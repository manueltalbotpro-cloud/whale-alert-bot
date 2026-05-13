// ============================================================
//  MONITOR — logique de surveillance des wallets
// ============================================================

const fetch  = require("node-fetch");
const config = require("./config");

// Mémoire de session — signatures déjà vues pour éviter les doublons
const seen = {
  solana1: new Set(),
  solana2: new Set(),
  ethBlock: 0,
};

// ─── Prix BTC ───────────────────────────────────────────────

async function getBTCPrice() {
  try {
    const r = await fetch(config.BINANCE_API);
    const d = await r.json();
    return parseFloat(d.price);
  } catch {
    return null;
  }
}

// ─── Score du signal ────────────────────────────────────────

function buildSignal(amountUSD, destination, btcPrice, source) {
  const isToBinance = destination &&
    destination.toLowerCase() === config.BINANCE_SOLANA_HOT.toLowerCase();

  let score = 0;
  let emoji = "📊";
  let strength = "WATCH";

  // Taille du transfert
  if (amountUSD >= config.THRESHOLDS.SOLANA_TRANSFER_STRONG) score += 3;
  else if (amountUSD >= config.THRESHOLDS.SOLANA_TRANSFER_MEDIUM) score += 2;
  else score += 1;

  // Destination : vers Binance = signal amplificateur
  if (isToBinance) score += 2;

  // Prix BTC
  if (btcPrice && btcPrice < config.THRESHOLDS.BTC_STRONG_ZONE) score += 3;
  else if (btcPrice && btcPrice < config.THRESHOLDS.BTC_LOW_ZONE) score += 2;

  if (score >= 7) { emoji = "🚨"; strength = "SIGNAL FORT — ACHAT"; }
  else if (score >= 5) { emoji = "⚠️";  strength = "SIGNAL ACHAT"; }
  else if (score >= 3) { emoji = "📈"; strength = "SIGNAL MODÉRÉ"; }

  return { emoji, strength, score, isToBinance };
}

// ─── Solana — récupérer les transferts USDC récents ─────────

async function solanaRPC(method, params) {
  const r = await fetch(config.SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    timeout: 20000,
  });
  const d = await r.json();
  return d.result;
}

async function checkSolanaWallet1(btcPrice) {
  const alerts = [];
  try {
    // Récupérer les dernières signatures du compte USDC
    const sigs = await solanaRPC("getSignaturesForAddress", [
      config.SOLANA_WHALE_1.usdcAccount,
      { limit: 10 },
    ]);
    if (!sigs || sigs.length === 0) return alerts;

    for (const s of sigs) {
      if (seen.solana1.has(s.signature)) continue;
      seen.solana1.add(s.signature);

      // Ne pas analyser les toutes premières de la session (déjà connues)
      if (seen.solana1.size <= 10) continue;

      // Récupérer les détails de la transaction
      await sleep(1500);
      const tx = await solanaRPC("getTransaction", [
        s.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
      if (!tx || !tx.meta) continue;

      const pre  = tx.meta.preTokenBalances  || [];
      const post = tx.meta.postTokenBalances || [];

      for (const p of pre) {
        if (p.mint !== config.USDC_MINT) continue;
        const preAmt  = parseFloat(p.uiTokenAmount.uiAmount || 0);
        const postRec = post.find(x => x.accountIndex === p.accountIndex);
        const postAmt = parseFloat(postRec?.uiTokenAmount?.uiAmount || 0);
        const delta   = postAmt - preAmt;

        // Négatif = sortie de USDC
        if (delta < -config.THRESHOLDS.SOLANA_TRANSFER_MEDIUM / 1e6) {
          const amountUSD = Math.abs(delta) * 1e6;

          // Trouver la destination
          const keys = tx.transaction?.message?.accountKeys || [];
          const destKey = keys[p.accountIndex + 1]?.pubkey || "";

          const { emoji, strength, score, isToBinance } = buildSignal(
            amountUSD, destKey, btcPrice, "Wallet 1"
          );

          const date = s.blockTime
            ? new Date(s.blockTime * 1000).toISOString().replace("T", " ").substring(0, 16) + " UTC"
            : "Date inconnue";

          alerts.push({
            emoji, strength, score,
            text: [
              `${emoji} *${strength}*`,
              ``,
              `🐋 *Baleine Solana #1 (H8BgJ)* vient de transférer`,
              `💵 *$${(amountUSD / 1e6).toFixed(1)}M USDC*`,
              isToBinance
                ? `📥 Destination : *BINANCE* (Solana Hot Wallet)`
                : `📥 Destination : \`${destKey.substring(0, 16)}...\``,
              ``,
              `₿ *BTC actuel : $${btcPrice ? btcPrice.toLocaleString() : "N/A"}*`,
              btcPrice < config.THRESHOLDS.BTC_STRONG_ZONE
                ? `🔥 BTC dans la *zone d'achat forte* (<$${config.THRESHOLDS.BTC_STRONG_ZONE.toLocaleString()})`
                : btcPrice < config.THRESHOLDS.BTC_LOW_ZONE
                ? `✅ BTC dans la *zone d'achat* (<$${config.THRESHOLDS.BTC_LOW_ZONE.toLocaleString()})`
                : `⚡ BTC hors zone optimale`,
              ``,
              `📊 *Historique* : ce signal a précédé des hausses de +5% à +16% sur 4 semaines`,
              `🕐 ${date}`,
            ].join("\n"),
          });
        }
      }
    }
  } catch (e) {
    console.error("[Solana Wallet 1]", e.message);
  }
  return alerts;
}

async function checkSolanaWallet2(btcPrice) {
  const alerts = [];
  try {
    const sigs = await solanaRPC("getSignaturesForAddress", [
      config.SOLANA_WHALE_2.wallet,
      { limit: 5 },
    ]);
    if (!sigs || sigs.length === 0) return alerts;

    for (const s of sigs) {
      if (seen.solana2.has(s.signature)) continue;
      seen.solana2.add(s.signature);
      if (seen.solana2.size <= 5) continue;

      await sleep(1500);
      const tx = await solanaRPC("getTransaction", [
        s.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
      if (!tx || !tx.meta) continue;

      const post = tx.meta.postTokenBalances || [];
      const pre  = tx.meta.preTokenBalances  || [];

      for (const p of post) {
        if (p.mint !== config.USDC_MINT) continue;
        const postAmt = parseFloat(p.uiTokenAmount.uiAmount || 0);
        const preRec  = pre.find(x => x.accountIndex === p.accountIndex);
        const preAmt  = parseFloat(preRec?.uiTokenAmount?.uiAmount || 0);
        const delta   = postAmt - preAmt;

        if (delta > config.THRESHOLDS.SOLANA_RECHARGE_MIN / 1e6) {
          const amountUSD = delta * 1e6;
          const date = s.blockTime
            ? new Date(s.blockTime * 1000).toISOString().replace("T", " ").substring(0, 16) + " UTC"
            : "";

          alerts.push({
            emoji: "👀",
            strength: "RECHARGEMENT WALLET 2",
            score: 2,
            text: [
              `👀 *RECHARGEMENT WALLET 2*`,
              ``,
              `🐋 *Baleine Solana #2 (9WzDX)* reçoit des USDC`,
              `💵 *+$${(amountUSD / 1e6).toFixed(1)}M USDC* entrants`,
              ``,
              `⏳ Ce wallet précède habituellement des dépôts sur Binance`,
              `₿ BTC actuel : *$${btcPrice ? btcPrice.toLocaleString() : "N/A"}*`,
              `🕐 ${date}`,
            ].join("\n"),
          });
        }
      }
    }
  } catch (e) {
    console.error("[Solana Wallet 2]", e.message);
  }
  return alerts;
}

// ─── Ethereum — surveiller reshuffles internes Binance ──────

function hexToUSD(hexData, decimals = 6) {
  const val = BigInt("0x" + hexData.replace("0x", "").padStart(64, "0"));
  return Number(val) / Math.pow(10, decimals);
}

async function ethRPC(method, params) {
  const r = await fetch(config.ETH_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    timeout: 20000,
  });
  const d = await r.json();
  return d.result;
}

async function checkEthWallet(btcPrice) {
  const alerts = [];
  try {
    const latestHex = await ethRPC("eth_blockNumber", []);
    const latest    = parseInt(latestHex, 16);

    if (seen.ethBlock === 0) {
      seen.ethBlock = latest - 500; // démarrer 500 blocs avant (~1h40)
    }

    if (latest <= seen.ethBlock) return alerts;

    const TRANSFER  = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const BNW_PAD   = "0x000000000000000000000000" + config.ETH_BINANCE_HW20.substring(2).toLowerCase();

    const logs = await ethRPC("eth_getLogs", [{
      fromBlock: "0x" + seen.ethBlock.toString(16),
      toBlock:   "0x" + latest.toString(16),
      address:   config.USDT_ETH,
      topics:    [TRANSFER, BNW_PAD, null],
    }]);

    seen.ethBlock = latest;

    if (!logs || logs.length === 0) return alerts;

    // Regrouper par bloc (une même transaction peut avoir plusieurs logs)
    const byBlock = {};
    for (const log of logs) {
      const blockNum = parseInt(log.blockNumber, 16);
      const amtUSD   = hexToUSD(log.data, 6);
      if (amtUSD < config.THRESHOLDS.ETH_INTERNAL_RESHUFFLE) continue;
      if (!byBlock[blockNum]) byBlock[blockNum] = { total: 0, count: 0 };
      byBlock[blockNum].total += amtUSD;
      byBlock[blockNum].count++;
    }

    for (const [blk, data] of Object.entries(byBlock)) {
      const amtM = (data.total / 1e6).toFixed(0);
      const isLowBTC = btcPrice && btcPrice < config.THRESHOLDS.BTC_LOW_ZONE;

      alerts.push({
        emoji: isLowBTC ? "⚠️" : "📊",
        strength: isLowBTC ? "RESHUFFLE BINANCE — BTC BAS" : "RESHUFFLE BINANCE ETH",
        score: isLowBTC ? 4 : 2,
        text: [
          isLowBTC ? `⚠️ *RESHUFFLE BINANCE — BTC BAS*` : `📊 *Mouvement interne Binance ETH*`,
          ``,
          `🏦 *Binance Hot Wallet 20* redistribue ses USDT`,
          `💵 *$${amtM}M USDT* déplacés (${data.count} transfert(s))`,
          ``,
          isLowBTC
            ? `🔥 Signal historique : reshuffles Binance à BTC <$${config.THRESHOLDS.BTC_LOW_ZONE.toLocaleString()} → +15% à +24% en 4 sem.`
            : `📌 Reshuffles internes — confirme l'activité Binance`,
          `₿ BTC actuel : *$${btcPrice ? btcPrice.toLocaleString() : "N/A"}*`,
          `🔗 Bloc ETH : ${blk}`,
        ].join("\n"),
      });
    }
  } catch (e) {
    console.error("[ETH HW20]", e.message);
  }
  return alerts;
}

// ─── Utilitaire ─────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  getBTCPrice,
  checkSolanaWallet1,
  checkSolanaWallet2,
  checkEthWallet,
  seenInit: (latestSigs1, latestSigs2) => {
    latestSigs1.forEach(s => seen.solana1.add(s));
    latestSigs2.forEach(s => seen.solana2.add(s));
  },
};
