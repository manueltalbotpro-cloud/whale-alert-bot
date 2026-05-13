// ============================================================
//  CONFIG — remplis tes tokens ici
// ============================================================

module.exports = {

  // 1) Crée un bot via @BotFather sur Telegram → /newbot → copie le token ici
  TELEGRAM_TOKEN: "8901457690:AAG-rgZHCdnHUhyA-ZrxjlVphIhZqQHGRy0",

  // 2) Ton chat ID Telegram (envoie /start au bot, il te l'affichera)
  TELEGRAM_CHAT_ID: "8479083477",

  // ============================================================
  //  WALLETS SURVEILLÉS (ne pas modifier)
  // ============================================================

  // Wallet 1 — H8BgJ : baleine Solana avec 687.9M USDC en attente
  SOLANA_WHALE_1: {
    label: "🐋 Baleine Solana #1 (H8BgJ)",
    wallet: "H8BgJgae6qhMtf7BM2JtddywSQt11WdxHHxkGLNX5hss",
    usdcAccount: "DT78gNBH7enTRrAFcag4PAuQbSeemstmtj888w8pkvdf",
  },

  // Wallet 2 — 9WzDX : baleine Solana (vidée, surveiller rechargement)
  SOLANA_WHALE_2: {
    label: "🐋 Baleine Solana #2 (9WzDX)",
    wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  },

  // Wallet 3 — Binance Hot Wallet 20 (ETH)
  ETH_BINANCE_HW20: "0xF977814e90dA44bFA03b6295A0616a897441aceC",

  // Binance Solana Hot Wallet (destination des transferts whale)
  BINANCE_SOLANA_HOT: "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",

  // ============================================================
  //  SEUILS D'ALERTE (en USD)
  // ============================================================
  THRESHOLDS: {
    SOLANA_TRANSFER_STRONG:  100_000_000,   // > $100M → signal fort
    SOLANA_TRANSFER_MEDIUM:   50_000_000,   // > $50M  → signal modéré
    SOLANA_RECHARGE_MIN:      10_000_000,   // > $10M  rechargement wallet 2
    ETH_INTERNAL_RESHUFFLE:  300_000_000,   // > $300M reshuffle Binance interne
    BTC_LOW_ZONE:             95_000,       // BTC < $95k → zone d'achat historique
    BTC_STRONG_ZONE:          85_000,       // BTC < $85k → zone signal fort
  },

  // ============================================================
  //  RPC / API
  // ============================================================
  SOLANA_RPC:    "https://api.mainnet-beta.solana.com",
  ETH_RPC:       "https://ethereum.publicnode.com",
  BINANCE_API:   "https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT",
  USDC_MINT:     "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT_ETH:      "0xdAC17F958D2ee523a2206206994597C13D831ec7",

  // ============================================================
  //  INTERVALLES DE POLLING (en ms)
  // ============================================================
  POLL_SOLANA_MS:  2 * 60 * 1000,   //  2 minutes
  POLL_ETH_MS:    10 * 60 * 1000,   // 10 minutes
  POLL_PRICE_MS:   1 * 60 * 1000,   //  1 minute
};
