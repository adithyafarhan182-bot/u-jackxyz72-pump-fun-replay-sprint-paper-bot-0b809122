// Runner strategy for the Pump.fun Replay Sprint (agent-fun/replay/v2).
//
// Idea, tuned on the kit's dev window with an offline replay backtest
// (see pump-fun-replay-sprint-strategy.md): most fresh pump.fun coins pop on
// their first trades and then bleed out, but the few that keep trading run
// 2-15x. So: enter a coin ONCE, only after it has proved it keeps trading
// (30+ trades, real reserve >= 5 SOL, price >= 1.2x its create price), size
// to the harness buy cap, then let it run to 2x or ride a WIDE trailing stop
// (sell at 55% of the peak) / hard stop (50% of entry). No scale-in, no
// re-entry, no chasing: one shot per coin, losers are cut wide and slow so
// normal chop does not shake the runners out.
//
// Backtest (dev window, same fee/latency/cap model as the harness):
//   net PnL +0.737 SOL, max drawdown 2.0%, 25 coins with round trips >= 0.01 SOL,
//   45 fills. PnL ex-top-3-coins +0.239 SOL, so the profit does not rest on
//   a single coin.
//
// Everything is deterministic: only the harness state is read, no clock,
// no randomness, no network, no environment. All prices are compared as
// exact bigint fractions (virtual_quote / virtual_token), never floats.

import type { Batch, BotState, OrderInput } from "./vendor/agentfun-bot.ts";

export const LAMPORTS_PER_SOL = 1_000_000_000n;

// --- tuned parameters (from the offline grid) ---
const TRIGGER_NUM = 6n; // enter at >= 1.2x create price (6/5)
const TRIGGER_DEN = 5n;
const MIN_TRADES = 30; // coin must have traded this much first
const MIN_REAL_SOL = 5n * LAMPORTS_PER_SOL; // real SOL reserve at entry
const BUDGET_LAMPORTS = 400_000_000n; // 0.4 SOL max per coin
const MIN_BUY_LAMPORTS = 10_000_000n; // 0.01 SOL: guardrail round-trip floor
const TP_NUM = 2n; // take profit at 2x average entry
const TP_DEN = 1n;
const SL_NUM = 1n; // hard stop at 0.5x average entry
const SL_DEN = 2n;
const TRAIL_NUM = 11n; // trailing stop at 55% of the peak (11/20)
const TRAIL_DEN = 20n;
const HOLD_TRADES = 500; // give up after this many trades held
const SLIPPAGE_BPS = 1000; // 10%: fills must survive the fast early pop

interface Seen {
  vs0: bigint;
  vt0: bigint;
}

interface Held {
  entryTrades: number;
  peakVs: bigint;
  peakVt: bigint;
}

function priceGe(
  aVs: bigint,
  aVt: bigint,
  bVs: bigint,
  bVt: bigint,
  num: bigint,
  den: bigint,
): boolean {
  // a/b >= (c/d) * (num/den)  <=>  a*d*num >= b*c*den
  return aVs * bVt * num >= aVt * bVs * den;
}

function priceLe(
  aVs: bigint,
  aVt: bigint,
  bVs: bigint,
  bVt: bigint,
  num: bigint,
  den: bigint,
): boolean {
  // a/b <= (c/d) * (num/den)  <=>  a*d*den <= b*c*num
  return aVs * bVt * den <= aVt * bVs * num;
}

export class RunnerStrategy {
  readonly #seen = new Map<string, Seen>();
  readonly #held = new Map<string, Held>();
  readonly #bought = new Set<string>();

  decide(state: BotState, _batch: Batch): OrderInput[] {
    const orders: OrderInput[] = [];
    const pendingSell = new Set<string>();
    const pendingBuy = new Set<string>();
    for (const p of state.pending.values()) {
      if (p.order.side === "sell") pendingSell.add(p.order.mint);
      else pendingBuy.add(p.order.mint);
    }

    // Remember every curve's first-seen (create) price.
    for (const curve of state.curves.values()) {
      if (!this.#seen.has(curve.mint)) {
        this.#seen.set(curve.mint, {
          vs0: curve.virtual_quote_reserves,
          vt0: curve.virtual_token_reserves,
        });
      }
    }

    // Exits first: free slots before looking for entries.
    for (const [mint, holding] of state.positions) {
      const curve = state.curves.get(mint);
      if (curve === undefined || curve.complete) continue;
      if (pendingSell.has(mint)) continue;
      const vs = curve.virtual_quote_reserves;
      const vt = curve.virtual_token_reserves;
      if (vt === 0n) continue;
      let held = this.#held.get(mint);
      if (held === undefined) {
        held = { entryTrades: curve.trades, peakVs: vs, peakVt: vt };
        this.#held.set(mint, held);
      }
      // Ratchet the peak up only.
      if (vs * held.peakVt > held.peakVs * vt) {
        held.peakVs = vs;
        held.peakVt = vt;
      }
      const cost = holding.cost_lamports;
      const tokens = holding.token_amount;
      const age = curve.trades - held.entryTrades;
      const takeProfit = priceGe(vs, vt, cost, tokens, TP_NUM, TP_DEN);
      const stopLoss = priceLe(vs, vt, cost, tokens, SL_NUM, SL_DEN);
      const trailing =
        held.peakVt !== 0n &&
        priceLe(vs, vt, held.peakVs, held.peakVt, TRAIL_NUM, TRAIL_DEN);
      if (takeProfit || stopLoss || trailing || age >= HOLD_TRADES) {
        orders.push({
          side: "sell",
          mint,
          token_amount: tokens,
          max_slippage_bps: SLIPPAGE_BPS,
        });
      }
    }
    // Forget bookkeeping for coins no longer held.
    for (const mint of [...this.#held.keys()]) {
      if (!state.positions.has(mint)) this.#held.delete(mint);
    }

    // Entries: one shot per coin, only proven runners, while a slot is free.
    let committed = state.committedPositionCount();
    let remainingFree = state.freeCashLamports();
    for (const curve of state.curves.values()) {
      if (committed >= state.hello.caps.max_open_positions) break;
      const mint = curve.mint;
      if (curve.complete || this.#bought.has(mint)) continue;
      if (state.positions.has(mint) || pendingBuy.has(mint)) continue;
      if (curve.trades < MIN_TRADES) continue;
      if (curve.real_quote_reserves < MIN_REAL_SOL) continue;
      const seen = this.#seen.get(mint);
      if (seen === undefined) continue;
      const vs = curve.virtual_quote_reserves;
      const vt = curve.virtual_token_reserves;
      if (vt === 0n || seen.vt0 === 0n) continue;
      // Price must be >= 1.2x the first-seen (create) price.
      if (!priceGe(vs, vt, seen.vs0, seen.vt0, TRIGGER_NUM, TRIGGER_DEN)) continue;
      const cap = state.maxBuyLamports(mint);
      let size = BUDGET_LAMPORTS;
      if (size > cap) size = cap;
      const halfFree = remainingFree / 2n;
      if (size > halfFree) size = halfFree;
      if (size < MIN_BUY_LAMPORTS) continue;
      this.#bought.add(mint);
      committed += 1;
      remainingFree -= size;
      orders.push({
        side: "buy",
        mint,
        quote_lamports: size,
        max_slippage_bps: SLIPPAGE_BPS,
      });
    }
    return orders;
  }
}
