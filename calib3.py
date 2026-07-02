# During drought, for the market to pull farmers IN, farming income must exceed
# mining income at the new grain price.
# farmer_income = pGrain * gy * drought_mult
# miner_income  = pOre  * oy
gy = 1.72
oy = 1.28
drought = 0.45
pOre = 2.93  # rests here

# For farming to be attractive (income parity) we need:
# pGrain * gy * drought = pOre * oy  ->  pGrain = pOre*oy / (gy*drought)
pGrain_parity = pOre * oy / (gy * drought)
print("grain price for income parity during drought:", round(pGrain_parity, 2))
print("  = ", round(pGrain_parity / 2.16, 2), "x the resting grain price (2.16)")

# With SWITCH_THRESHOLD 1.3 hysteresis, farming must beat mining by 1.3x to pull:
pGrain_switch = 1.3 * pOre * oy / (gy * drought)
print("grain price to trigger switch INTO farming (1.3x hysteresis):", round(pGrain_switch, 2))

# So the price must be able to climb to ~this. PRICE_BOUNDS max is 50, fine.
# Question: does the scarcity rule let it climb there?
# scarcity during drought = (need - produced)/need. With 20 farmers at drought:
for nf in [36, 20]:
    produced = nf * gy * drought
    need = 60
    scarcity = (need - produced) / need
    print(f"  nf={nf}: produced={produced:.1f} scarcity={scarcity:.3f}")
