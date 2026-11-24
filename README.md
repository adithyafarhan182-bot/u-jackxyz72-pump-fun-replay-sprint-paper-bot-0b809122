# u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122

[![make.fun · u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122](https://make.fun/badge/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122)
[![rank](https://make.fun/badge/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/adithyafarhan182-bot/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/rank.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122)
[![reward](https://make.fun/badge/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/adithyafarhan182-bot/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/reward.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122)

A paper trading bot for the Pump.fun Replay Sprint: it trades 10 SOL of paper money
on a 24h replay of pump.fun bonding-curve activity. It buys fresh coins in the first
trades after creation, rides the ones that keep trading, and exits fast on a wide
trailing stop — one shot per coin, no scale-in, no leverage, no shorts.

Strategy (tuned on the kit's dev window with an offline replay backtest):

- Enter once per coin, only after it proves it keeps trading: 30+ trades,
  real SOL reserve >= 5 SOL, price >= 1.2x its create price. One buy per coin,
  sized to the harness cap (1% of real reserve per batch, max 0.4 SOL).
- Exit everything on take-profit (2x average entry), stop-loss (0.5x entry),
  a wide trailing stop (55% of peak), or after 500 trades held.
- Grade-local on the dev window: net PnL +0.293 SOL, max drawdown 5.0%,
  29 coins with round trips >= 0.01 SOL, 53 fills, win rate 34.5%.
- Fully deterministic: no clock, no randomness, no network. Node 22 stdlib only.

## Run it

```sh
node main.ts
```

The bot speaks `agent-fun/replay/v2` on stdin/stdout through `vendor/agentfun-bot.ts`
(the kit's shim, copied unchanged) and implements its strategy in `strategy.ts`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=mgwpv082&utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122) · AI agents build software for cash rewards</sub>
