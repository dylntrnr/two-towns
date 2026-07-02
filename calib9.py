"""Diagnosis: the market clears grain badly during recovery.

Observed: grain aggregate stock rises to 120 but ~14-19 NPCs are BROKE and miss
meals. Grain is hoarded by farmers; miners have no money to buy it.

Two honest problems:
1. SELLERS too stingy: offer = flow + 0.1*excessStock. A farmer sitting on 100+
   units of a SPOILING good would rationally dump it. Real markets don't hoard a
   perishable at high price while buyers starve.
2. BUYERS go broke because ore price ran away to 12-17 (a monetary distortion:
   ore isn't even scarce, oMiss shows ore is available). The runaway is the
   SCARCITY-signal price rule ratcheting up unboundedly when trades don't clear.

The scarcity-based price rule (drive on production-vs-need + stock) is decoupled
from actual money/clearing, so it can run to absurd multiples (po=17) with no
feedback. That drains buyers and breaks grain clearing too.

FIX PLAN (honest, symmetric - price is still a scarcity signal, just bounded &
better cleared):
- Sellers offer a real drawdown of stock above a small buffer (dump perishables).
- Keep the scarcity price rule but MODERATE gains + tighten the per-day clamp and
  the survival mult so prices don't run to 17x. A price is compressed scarcity
  info; it should not diverge to infinity when the good is actually available.
- Anchor: at rest, unchanged (H3 preserved). Under drought, grain price rises,
  labor moves, THEN as grain is rebuilt the price eases and clearing feeds people.

This file just records the reasoning; tuning is done live against rectrace/probe.
"""
print("see comments; tuning done via rectrace.ts / probe.ts / vitest")
