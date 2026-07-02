""" Joint calibration for two-towns recovery.

Physics (per SPEC, symmetric both towns):
  personalYield = base * yieldMult * (FLOOR + (1-FLOOR)*happiness)
  happiness = 1 - 0.7*hunger - 0.3*(1-comfort)
  grain need = 1/npc/day, ore need = 0.5/npc/day, POP=60
  spoil grain 0.02/day.

Calibration equilibrium: 36 farmers, 24 miners.
  grain: 36 * gy = grain/day ; need 60
  ore:   24 * oy = ore/day   ; need 30

We want:
  (a) At full happiness (calm), 36 farmers cover 60 grain + spoilage, small surplus.
  (b) Income parity at 36/24 split: pg*gy == po*oy  -> pg = po*oy/gy.
  (c) Drought: grain yield *DROUGHT. Even all-60 farming should be near or below
      need so the drought BITES, but post-drought a reallocated market (~45-50 f)
      can REBUILD a buffer (grain surplus > need) so unmetSurvival -> ~0.
"""

POP = 60
GRAIN_NEED = 1.0
ORE_NEED = 0.5
FLOOR = 0.55
SPOIL = 0.02

def full_emp_grain(gy, drought=1.0, happy=1.0):
    hf = FLOOR + (1-FLOOR)*happy
    return 60 * gy * drought * hf  # all 60 farming

def calm_grain(gy, farmers=36, happy=1.0):
    hf = FLOOR + (1-FLOOR)*happy
    return farmers * gy * hf

def recovery_grain(gy, farmers, happy):
    # post-drought (yield mult back to 1), grain output
    hf = FLOOR + (1-FLOOR)*happy
    return farmers * gy * hf

for gy in [1.72, 1.85, 1.95, 2.0, 2.1]:
    for oy in [1.28, 1.30]:
        pg = 3.0 * oy / gy  # income parity, po=3.0
        calm = calm_grain(gy, 36, 1.0)
        for drought in [0.6, 0.62, 0.65]:
            all60 = full_emp_grain(gy, drought, 1.0)  # optimistic happy=1
            # realistic drought happiness ~ 0.7 (hungry)
            all60_h = full_emp_grain(gy, drought, 0.7)
            # recovery: 46 farmers, happy climbing to ~0.9
            rec46 = recovery_grain(gy, 46, 0.9)
            print(f"gy={gy} oy={oy} pg={pg:.3f} | calm36={calm:.1f} (need60+spoil~61.2) | "
                  f"drought{drought}: all60_happy={all60:.1f} all60_hungry={all60_h:.1f} | "
                  f"rec46_h0.9={rec46:.1f}")
    print()
