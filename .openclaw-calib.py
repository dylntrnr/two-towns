gy = 1.72
oy = 1.28
nf = 36
nm = 24
grain_need = 1.0
ore_need = 0.5
pop = 60

grain_prod = nf * gy
ore_prod = nm * oy
print("grain prod", round(grain_prod, 2), "need", pop * grain_need, "surplus", round(grain_prod - pop * grain_need, 2))
print("ore prod", round(ore_prod, 2), "need", pop * ore_need, "surplus", round(ore_prod - pop * ore_need, 2))
print("income-equal ratio pg/po =", round(oy / gy, 4))
po = 3.0
pg = po * oy / gy
print("po=3.0 pg", round(pg, 3), "farmer_income", round(pg * gy, 3), "miner_income", round(po * oy, 3))
