# 🤖 Whale Alert Bot — BTCUSDT Perp

Bot Telegram qui surveille 3 wallets whale et envoie des alertes d'achat BTCUSDT perp.

## Signals surveillés

| Signal | Condition | Historique |
|--------|-----------|-----------|
| 🚨 FORT | H8BgJ transfère >$100M USDC → Binance + BTC <$85k | +5% à +16% en 4 sem. |
| ⚠️ ACHAT | H8BgJ transfère >$50M USDC → Binance | +5% à +16% en 4 sem. |
| ⚠️ ETH | Binance HW20 reshuffle >$300M à BTC <$95k | +14.9% à +24.4% en 4 sem. |
| 👀 WATCH | 9WzDX reçoit des USDC (rechargement) | Signal préliminaire |
| ✅ PRIX | BTC passe sous $95k ou $85k | Zone historique |

## Installation

### 1) Installer les dépendances
```
cd C:\Users\manue\claudeverstradingview\whale-alert-bot
npm install
```

### 2) Créer le bot Telegram
1. Ouvre Telegram → cherche **@BotFather**
2. Envoie `/newbot`
3. Choisis un nom (ex: "Whale BTC Alert")
4. Copie le **token** fourni

### 3) Configurer config.js
Ouvre `config.js` et remplis :
```js
TELEGRAM_TOKEN: "123456:ABC-ton-token-ici",
TELEGRAM_CHAT_ID: "",  // laisser vide pour l'instant
```

### 4) Démarrer le bot
```
node bot.js
```

### 5) Obtenir ton Chat ID
Envoie `/start` à ton bot sur Telegram.  
Il affichera ton **Chat ID** — copie-le dans `config.js`.

### 6) Redémarrer
```
node bot.js
```

## Commandes Telegram

| Commande | Action |
|----------|--------|
| `/start` | Affiche le chat ID + aide |
| `/status` | Prix BTC + état wallets |
| `/wallets` | Détails des wallets surveillés |
| `/signal` | Analyse manuelle immédiate |
| `/stop` | Arrêter le bot |

## Lancer en arrière-plan (Windows)

```powershell
Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList "C:\Users\manue\claudeverstradingview\whale-alert-bot\bot.js"
```

## Wallets surveillés

- **H8BgJ** (Solana) : 687.9M USDC non déployé — signal principal
- **9WzDX** (Solana) : vidé, surveille rechargement
- **0xF977814** (ETH) : Binance Hot Wallet 20 — $41.92B
