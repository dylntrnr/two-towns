gy = 1.9
oy = 1.42
nf = 36
nm = 24
pop = 60
gp = 3.0 * oy / gy
print("income-equal grain price (po=3.0):", round(gp, 3))
print("farmer income", round(gp*gy,3), "miner income", round(3.0*oy,3))
print("grain surplus at 36 farmers full health:", round(nf*gy - pop*1.0, 2))
print("ore surplus at 24 miners full health:", round(nm*oy - pop*0.5, 2))
# drought 0.65: max grain all-60-farm
print("drought0.65 60 farmers grain:", round(60*gy*0.65,1), "vs need 60")
print("drought0.65 54 farmers grain:", round(54*gy*0.65,1))
print("drought0.65 44 farmers grain:", round(44*gy*0.65,1))
