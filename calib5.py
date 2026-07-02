gy = 1.72
oy = 1.28
pop = 60
grain_need = 60
# Max grain if ALL 60 farm at full productivity, under drought mult d:
# 60 * gy * d must be able to exceed need (60) for recovery to be POSSIBLE.
for d in [0.45, 0.55, 0.6, 0.65, 0.7]:
    max_all_farm = pop * gy * d
    # realistic: not everyone farms (need some ore); at 44 farmers:
    at44 = 44 * gy * d
    print(f"drought={d}: 60 farmers -> {max_all_farm:.1f} grain (need 60), 44 farmers -> {at44:.1f}")
# We want: at ~40-46 farmers and reasonable happiness, grain output can meet ~60.
# so 44*gy*d >= 60 -> d >= 60/(44*1.72) = 0.79? too weak. Try 40 farmers full:
print("d for 44 farmers to exactly meet need:", round(60/(44*gy),3))
print("d for 50 farmers to exactly meet need:", round(60/(50*gy),3))
print("d for 54 farmers to exactly meet need:", round(60/(54*gy),3))
