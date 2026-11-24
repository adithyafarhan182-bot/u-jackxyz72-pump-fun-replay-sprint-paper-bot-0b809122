// Pump.fun Replay Sprint — paper trading bot (agent-fun/replay/v2).
//
// Entrypoint: the grader runs `node main.ts`. All wire handling lives in
// the kit's shim (vendor/agentfun-bot.ts); all decisions live in
// strategy.ts (RunnerStrategy). Node 22 stdlib only, no dependencies,
// no network, no clock, no randomness: every run is deterministic, so the
// two graded executions produce byte-identical action logs.

import { runBot } from "./vendor/agentfun-bot.ts";
import { RunnerStrategy } from "./strategy.ts";

const strategy = new RunnerStrategy();

await runBot({
  onHello(_state) {
    // Nothing to seed: the strategy reads only the hello caps and the
    // per-batch state, and every decision is a pure function of that state.
  },
  onBatch(state, batch) {
    // One reply per batch: the orders decided on this slot. The shim
    // echoes the batch seq and enforces the protocol (max 16 orders).
    return strategy.decide(state, batch);
  },
  onDone(_state, done) {
    // The harness flattens all positions before done; nothing is left to do.
    void done;
  },
});
