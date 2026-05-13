// ============================================================
//  DISCOVER-WHALES — Analyse historique des dépôts Binance
//
//  Stratégie : au lieu de chercher tous les holders USDC
//  (nécessite RPC premium), on analyse QUI a envoyé de
//  gros montants à Binance pendant les creux BTC. Ces
//  entités sont nos whales candidates à monitorer.
//
//  Usage : node discover-whales.js
//          node discover-whales.js --window=1000  (plus d'historique)
//          node discover-whales.js --min=10       ($10M minimum au lieu de $5M)
// ============================================================

const fetch = require("node-fetch");

// Compte USDC principal de Binance Solana Hot Wallet ($555M)
const BINANCE_USDC_ACCOUNT = "7KJjY7rArbydeLBF7gQ5LdqXRKRYyPArT99NEctsHsgU";
const BINANCE_SOL_HOT      = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";
const USDC_MINT            = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ALREADY_MONITORED    = new Set([
  "H8BgJgae6qhMtf7BM2JtddywSQt11WdxHHxkGLNX5hss",
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
]);

// Paramètres via args
const args        = Object.fromEntries(process.argv.slice(2).map(a => a.replace("--","").split("=")));
const SCAN_TXS    = parseInt(args.window || "500");
const MIN_DEP_M   = parseFloat(args.min   || "5");     // en millions USD
const MIN_DEP     = MIN_DEP_M * 1_000_000;             // en uiAmount USDC
const MIN_BAL     = parseFloat(args.bal   || "30") * 1_000_000; // $30M balance min
const SLEEP_OK    = 1200;  // pause normale entre appels (ms)
const SLEEP_429   = 8000;  // pause après rate limit

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function solRPCRaw(method, params) {
  const r = await fetch("https://api.mainnet-beta.solana.com", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    timeout: 20000,
  });
  return await r.json();
}

async function solRPC(method, params) {
  const json = await solRPCRaw(method, params);
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result;
}

// Avec retry automatique sur 429
async function getTransactionSafe(sig) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const json = await solRPCRaw("getTransaction", [
      sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
    if (json.error?.code === 429) {
      await sleep(SLEEP_429 * (attempt + 1));
      continue;
    }
    return json.result || null;
  }
  return null;
}

async function getUSDCBalance(ownerAddress) {
  try {
    const res = await solRPC("getTokenAccountsByOwner", [
      ownerAddress, { mint: USDC_MINT }, { encoding: "jsonParsed" },
    ]);
    if (!res?.value?.length) return 0;
    let total = 0;
    for (const acc of res.value) {
      total += parseFloat(acc.account.data.parsed.info.tokenAmount.uiAmount || 0);
    }
    return total;
  } catch { return -1; }
}

async function main() {
  console.log("=======================================================");
  console.log("  WHALE DISCOVERY — Solana USDC Feeder Analysis");
  console.log("=======================================================");
  console.log(`Cible  : Binance USDC ($555M) — ${BINANCE_USDC_ACCOUNT.substring(0,16)}...`);
  console.log(`Scan   : ${SCAN_TXS} dernières transactions`);
  console.log(`Seuils : dépôt >$${MIN_DEP_M}M | balance min >$${MIN_BAL/1e6}M`);
  console.log(`Temps  : ~${Math.round(SCAN_TXS * SLEEP_OK / 60000)} min estimé (variable selon rate limits)`);
  console.log("-------------------------------------------------------\n");

  // ── Étape 1 : Signatures ────────────────────────────────────
  console.log("Étape 1/3 — Récupération des signatures...");
  const sigs = await solRPC("getSignaturesForAddress", [
    BINANCE_USDC_ACCOUNT, { limit: SCAN_TXS },
  ]);
  if (!sigs?.length) { console.log("Aucune signature. Arrêt."); return; }
  const oldest = new Date(sigs[sigs.length-1].blockTime * 1000).toISOString().slice(0, 16);
  const newest = new Date(sigs[0].blockTime * 1000).toISOString().slice(0, 16);
  console.log(`  ${sigs.length} signatures | ${oldest} → ${newest}`);
  console.log(`  (augmente --window=2000 pour plus d'historique)\n`);

  // ── Étape 2 : Analyse des transactions ─────────────────────
  console.log("Étape 2/3 — Analyse des transactions...");
  const depositors = new Map();
  let parsed = 0, errors = 0, skipped = 0, nulls = 0;

  for (let i = 0; i < sigs.length; i++) {
    const s = sigs[i];

    if (i % 20 === 0 || parsed > 0) {
      process.stdout.write(
        `  [${i}/${sigs.length}] ✓${parsed} dépôts | ⚠️${errors} err | ∅${nulls} null | ${skipped} petits\r`
      );
    }

    const tx = await getTransactionSafe(s.signature);
    await sleep(SLEEP_OK);

    if (!tx) { nulls++; continue; }
    if (!tx.meta) { errors++; continue; }

    const pre  = tx.meta.preTokenBalances  || [];
    const post = tx.meta.postTokenBalances || [];
    const keys = tx.transaction?.message?.accountKeys || [];

    // Y a-t-il un USDC entrant sur le compte Binance ?
    let binanceReceived = 0;
    let binanceAccIndex = -1;

    for (const p of post) {
      if (p.mint !== USDC_MINT) continue;
      const key = keys[p.accountIndex];
      if (!key || key.pubkey !== BINANCE_USDC_ACCOUNT) continue;
      const preBal  = pre.find(x => x.accountIndex === p.accountIndex);
      const preAmt  = parseFloat(preBal?.uiTokenAmount?.uiAmount  || 0);
      const postAmt = parseFloat(p.uiTokenAmount?.uiAmount         || 0);
      binanceReceived = postAmt - preAmt; // positif = réception
      binanceAccIndex = p.accountIndex;
      break;
    }

    if (binanceReceived < MIN_DEP) { skipped++; continue; }

    // Trouver la source (le compte qui a perdu le USDC)
    for (const preSrc of pre) {
      if (preSrc.mint !== USDC_MINT) continue;
      if (preSrc.accountIndex === binanceAccIndex) continue;
      const postSrc  = post.find(x => x.accountIndex === preSrc.accountIndex);
      const preAmtS  = parseFloat(preSrc.uiTokenAmount?.uiAmount     || 0);
      const postAmtS = parseFloat(postSrc?.uiTokenAmount?.uiAmount    || 0);
      const deltaSrc = postAmtS - preAmtS; // négatif = source
      if (deltaSrc > -(binanceReceived * 0.8)) continue;

      const srcOwner = preSrc.owner || "";
      if (!srcOwner || srcOwner === BINANCE_SOL_HOT) continue;

      const existing = depositors.get(srcOwner) || {
        owner: srcOwner, totalSent: 0, txCount: 0, lastDate: "", maxSingle: 0,
      };
      const amt = Math.abs(deltaSrc);
      existing.totalSent += amt;
      existing.txCount++;
      existing.lastDate = new Date(s.blockTime * 1000).toISOString().slice(0, 10);
      if (amt > existing.maxSingle) existing.maxSingle = amt;
      depositors.set(srcOwner, existing);
      parsed++;
      break;
    }
  }

  process.stdout.write(`                                                                                  \r`);
  console.log(`\n  Terminé :`);
  console.log(`    Dépôts >$${MIN_DEP_M}M trouvés : ${parsed}`);
  console.log(`    Trop petits (ignorés) : ${skipped}`);
  console.log(`    Erreurs RPC : ${errors} | Null (rate limit) : ${nulls}`);
  console.log(`    Déposants uniques : ${depositors.size}\n`);

  if (depositors.size === 0) {
    console.log("Aucun grand dépôt dans cette fenêtre temporelle.");
    console.log("Solutions :");
    console.log("  → Augmente la fenêtre : node discover-whales.js --window=2000");
    console.log("  → Baisse le seuil    : node discover-whales.js --min=1");
    return;
  }

  // ── Étape 3 : Balances actuelles ────────────────────────────
  console.log("Étape 3/3 — Vérification des balances USDC actuelles...");
  const sorted = [...depositors.values()].sort((a, b) => b.totalSent - a.totalSent).slice(0, 40);
  const whales = [];
  const allResults = [];

  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    process.stdout.write(`  [${i+1}/${sorted.length}] ${d.owner.substring(0,20)}...\r`);
    await sleep(800);
    const balance = await getUSDCBalance(d.owner);
    allResults.push({ ...d, balance });
    if (!ALREADY_MONITORED.has(d.owner) && balance >= MIN_BAL) {
      whales.push({ ...d, balance });
    }
  }

  // ── Affichage ────────────────────────────────────────────────
  console.log(`\n\n${"=".repeat(65)}`);
  console.log("  TOUS LES DÉPOSANTS (triés par volume)");
  console.log("=".repeat(65));
  console.log("Adresse wallet owner                              Envoyé→BNC  Bal actuelle  Txs  Max dépôt  Dernier");
  console.log("-".repeat(100));

  for (const r of allResults) {
    const flag   = ALREADY_MONITORED.has(r.owner) ? " [★ monitored]" : r.balance >= MIN_BAL ? " [🐋 NOUVEAU]" : "";
    const balStr = r.balance < 0 ? "   err" : `$${(r.balance/1e6).toFixed(1)}M`;
    console.log(
      `${r.owner}  $${(r.totalSent/1e6).toFixed(0).padStart(6)}M  ${balStr.padStart(12)}` +
      `  ${String(r.txCount).padStart(3)}  $${(r.maxSingle/1e6).toFixed(0).padStart(5)}M  ${r.lastDate}${flag}`
    );
  }

  console.log(`\n${"=".repeat(65)}`);
  if (whales.length === 0) {
    console.log(`  Aucune nouvelle whale >$${MIN_BAL/1e6}M dans cette fenêtre.`);
    console.log(`\n  Conseils :`);
    console.log(`    node discover-whales.js --window=2000   (plus d'historique ~4h)`);
    console.log(`    node discover-whales.js --window=1000 --min=2  (seuil $2M)`);
    console.log(`    node discover-whales.js --bal=5   (balance min $5M au lieu de $30M)`);
  } else {
    console.log(`  ${whales.length} NOUVELLE(S) WHALE(S) TROUVÉE(S) — À AJOUTER DANS checker.js`);
    console.log("=".repeat(65) + "\n");
    for (const w of whales.sort((a, b) => b.balance - a.balance)) {
      console.log(`🐋 WALLET : ${w.owner}`);
      console.log(`   Balance actuelle : $${(w.balance/1e6).toFixed(0)}M USDC`);
      console.log(`   Total envoyé à Binance : $${(w.totalSent/1e6).toFixed(0)}M (${w.txCount} tx, max $${(w.maxSingle/1e6).toFixed(0)}M)`);
      console.log(`   Dernier dépôt : ${w.lastDate}`);
      console.log(`\n   → Pour trouver son compte USDC et l'ajouter au bot, lance :`);
      console.log(`     node -e "require('./discover-whales').getUSDCAccounts('${w.owner}')"`);
      console.log();
    }
  }
  console.log("=".repeat(65));
}

main().catch(e => { console.error("\nErreur fatale:", e.message); process.exit(1); });
