# Find drought d and floor F so:
#  - planned (36 farmers, stale) CANNOT feed town -> chronic shortage
#  - market (reallocates to ~50 farmers) CAN feed town -> recovers
# grain output = nf * gy * d * (F + (1-F)*hap)
gy = 1.72
need = 60
# assume recovered-market happiness ~0.9, planned stuck-hungry happiness ~0.5
for d in [0.6, 0.65, 0.7]:
    for F in [0.4, 0.5, 0.6]:
        # planned: 36 farmers, hungry (hap ~0.5)
        pln = 36 * gy * d * (F + (1-F)*0.5)
        # market: 50 farmers, healthier (hap ~0.85 once fed)
        mkt = 50 * gy * d * (F + (1-F)*0.85)
        # market at full 54 farmers healthy
        mkt54 = 54 * gy * d * (F + (1-F)*0.9)
        print(f"d={d} F={F}: planned36={pln:.0f} market50={mkt:.0f} market54={mkt54:.0f}  (need {need})")
    print()
