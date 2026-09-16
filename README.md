# Playground

**Drive. Degen. Learn.** Playground is a small floating 3D island where you learn how memecoin markets behave by playing in one.

A playground is where kids learn about risk safely: you climb, you fall, you get back up. Memecoins are the scariest climbing frame on the internet, so Playground gives you a place to fall that costs nothing. Everything runs on **play tickets**. No real tokens or money change hands.

## Wallets

You can connect a real wallet, and the connection is **read-only**: Playground reads your public address and balance, and never asks for a signature or a transaction.

- **Solana and other Wallet Standard wallets:** Phantom, Solflare, Backpack, OKX, Coinbase, Trust, Glow, and any other wallet that registers through the Wallet Standard.
- **EVM wallets through EIP-6963:** MetaMask, Rabby, Coinbase Wallet, Brave, OKX, Zerion, Rainbow, and so on, plus a fallback for older wallets that only inject `window.ethereum`.
- **Mobile:** one-tap links open Playground inside Phantom, Solflare, MetaMask, Coinbase Wallet or Trust Wallet, where the wallet's own browser handles the connection.

Set `VITE_SOLANA_RPC` to use your own Solana RPC for balances. Otherwise a public endpoint is used.

## What's on the island

- **Toy-block title.** Drive through the PLAYGROUND letters and knock them over.
- **Trading Pit.** Paper-trade simulated memecoins with live candle charts, LP-lock and dev-holding stats, pumps, dumps and rugs.
- **Launchpad.** Mint your own token and watch it try to fill its bonding curve (the rocket launches too).
- **Rug Alley.** A totally safe rug. Step on it.
- **Rug Academy.** A four-question checklist for spotting rugs.
- **Whale Pond.** Honk politely at the whale.
- **Circuit.** Drive through the gates in order for a lap time.
- **30 ticket coins, 22 achievements,** a minimap, a live ticker, synthesized sound, and touch controls for mobile.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Drive |
| Shift | Boost |
| Space | Jump |
| B / Ctrl | Brake |
| Enter | Interact |
| H | Honk |
| R | Respawn |
| M | Mute |
| Esc | Menu |

## Stack

Three.js + Vite. Every model is built from simple shapes in code, and every sound is synthesized with Web Audio. There are no downloaded assets.

```bash
npm install
npm run dev
```

> Playground is a game and educational toy. It is not financial advice.
