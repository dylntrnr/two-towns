# Fixed point with new gains: p* = START*(1 + (alpha/beta)*scarcity)
# We want: at calibration (scarcity ~ -0.03) p* stays near START.
# During drought (scarcity ~ 0.54 at 36 farmers) p* must reach >= 6.3 to pull labor.
start = 2.16
for alpha, beta in [(0.5,0.5),(0.8,0.2),(0.9,0.1),(1.0,0.08),(1.2,0.06)]:
    cal = start * (1 + (alpha/beta)*(-0.032))
    dr36 = start * (1 + (alpha/beta)*0.536)
    dr20 = start * (1 + (alpha/beta)*0.742)
    print(f"a={alpha} b={beta} ratio={alpha/beta:.1f}: calib p*={cal:.2f}  drought36 p*={dr36:.2f}  drought20 p*={dr20:.2f}")
# want calib near 2.16 and drought p* comfortably above 6.3
