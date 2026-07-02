# Model: price_{t+1} = price_t * (1 + K * drive)
# drive = alpha*(need - produced)/need + beta*(START - price)/START
# At calibration produced slightly > need, so scarcity term slightly negative.
# restPull pulls toward START. Find fixed point.
gy = 1.72
oy = 1.28
nf = 36
nm = 24
pop = 60
grain_need = 1.0
ore_need = 0.5

grain_prod = nf * gy
ore_prod = nm * oy
gneed = pop * grain_need
oneed = pop * ore_need

for label, prod, need, start in [("grain", grain_prod, gneed, 2.233), ("ore", ore_prod, oneed, 3.0)]:
    scarcity = (need - prod) / need
    print(label, "prod", round(prod,2), "need", need, "scarcity", round(scarcity,4))
    # fixed point: drive=0 -> alpha*scarcity + beta*(START-p)/START = 0
    # p* = START*(1 + (alpha/beta)*scarcity)
    for ab in [1, 2, 3]:
        pstar = start * (1 + ab * scarcity)
        print("   alpha/beta=", ab, "-> p*=", round(pstar,3))

# Drought: grain prod *0.45
print("drought grain prod", round(grain_prod*0.45,2), "scarcity", round((gneed-grain_prod*0.45)/gneed,3))
