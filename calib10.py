"""Protest subsistence check.

A protesting farmer produces (post-drought, yieldMult=1) and eats own grain first.
personalYield = base * yieldMult * (FLOOR + (1-FLOOR)*happy) * PROTEST_OUTPUT
happy for a protester ~ 0 (they're starving), so happyFactor = FLOOR = 0.55.

grain per day = 1.72 * 1.0 * 0.55 * PROTEST_OUTPUT
They eat own grain (need=1). To subsist enough to climb out of protest they need
to close the hunger gap: hunger recovers only when grain need FULLY met (>=1).
Partial feeding still ADDS hunger (deficitFrac). So a protester making <1 grain
NEVER recovers -> permanent underclass -> pins grainMiss.

For a protester to at least stop starving (make >= need=1 of their own grain):
"""
FLOOR = 0.55
base = 1.72
for po in [0.25, 0.4, 0.55, 0.7, 1.0]:
    g = base * 1.0 * FLOOR * po
    print(f"PROTEST_OUTPUT={po}: protester grain/day (happy=0) = {g:.2f}  (need 1.0 to not starve)")

# But raising PROTEST_OUTPUT helps BOTH towns symmetrically (H1) - fine, it's not
# biased. The real asymmetry: market lets an INDIVIDUAL go broke+starve while the
# town has surplus grain (money concentration). Planned rations EQUALLY so nobody
# is individually zeroed. That asymmetry is a MARKET money-circulation artifact,
# not the Misesian lesson. The honest fix is to prevent the money-lockout death
# spiral, not to bias the outcome.
print()
print("Key: protester must self-produce >=1 grain to avoid permanent starvation.")
print("Need PROTEST_OUTPUT >= ", round(1.0/(base*FLOOR), 3))
