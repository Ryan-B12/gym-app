"""Builds src/data/exercises.json from Free Exercise DB (public domain, Unlicense)
plus a small set of extra staples written for this app.
Usage: python3 scripts/build-exercises.py <path-to-free-exercise-db/dist/exercises.json>
"""
import json, re, sys

SRC = sys.argv[1]
IMG = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"

def has(name, *words):
    n = name.lower()
    return any(w in n for w in words)

def equipment(x):
    e, n = x.get("equipment"), x["name"]
    if has(n, "bench dip"):
        return "bodyweight"
    if has(n, "pull-up", "pullup", "chin-up", "chin up", "dips", "dip ", "muscle up", "hanging"):
        return "pullup_bar"
    if e in (None, "body only"):
        return "bodyweight"
    if e == "other":
        if has(n, "rope jumping"): return "jump_rope"
        if has(n, "bicycling", "trail running", "skating"): return "bodyweight"
        if has(n, "hyperextension"): return "machine"
        if has(n, "farmer"): return "dumbbell"
        if has(n, "box jump", "box skip"): return "box"
        if has(n, "battling ropes"): return "battle_ropes"
        if has(n, "ab roller"): return "ab_wheel"
        return None  # unknown gear: leave out
    return {
        "dumbbell": "dumbbell", "barbell": "barbell", "e-z curl bar": "ez_bar",
        "kettlebells": "kettlebell", "bands": "bands", "cable": "cable",
        "machine": "machine", "medicine ball": "medicine_ball",
        "exercise ball": "stability_ball", "foam roll": "foam_roller",
    }.get(e)

def needs_bench(x, eq):
    if has(x["name"], "bench dip"): return True
    return eq in ("dumbbell", "barbell", "ez_bar", "kettlebell") and has(
        x["name"], "bench", "incline", "decline", "fly", "flye", "pullover", "lying", "preacher", "seated")

def pattern(x):
    cat, n = x["category"], x["name"]
    prim = x["primaryMuscles"][0] if x["primaryMuscles"] else ""
    force = x.get("force")
    if cat == "stretching": return "mobility"
    if cat == "cardio": return "cardio"
    if prim == "abdominals": return "core"
    if cat == "plyometrics": return "plyo"
    if prim == "quadriceps":
        if has(n, "lunge", "split", "step", "bulgarian"): return "lunge"
        if x.get("mechanic") == "isolation": return "legs_iso"
        return "squat"
    if prim in ("hamstrings", "glutes", "lower back"):
        if x.get("mechanic") == "isolation" and has(n, "curl"): return "legs_iso"
        return "hinge"
    if prim == "chest": return "push_h"
    if prim == "shoulders":
        if force == "push" and x.get("mechanic") == "compound": return "push_v"
        return "shoulder_iso"
    if prim == "triceps": return "triceps"
    if prim == "biceps": return "biceps"
    if prim == "lats":
        return "pull_h" if has(n, "row") else "pull_v"
    if prim in ("middle back", "traps"): return "pull_h"
    if prim == "calves": return "calves"
    if prim == "forearms": return "forearms"
    if prim in ("adductors", "abductors"): return "hip_iso"
    return None

AREAS = {
    "squat": ["knee", "lower_back"], "lunge": ["knee", "hip"], "hinge": ["lower_back", "hip"],
    "legs_iso": ["knee"], "push_h": ["shoulder", "elbow", "wrist", "chest"],
    "push_v": ["shoulder", "elbow", "wrist"], "shoulder_iso": ["shoulder"],
    "pull_h": ["shoulder", "elbow", "lower_back"], "pull_v": ["shoulder", "elbow"],
    "triceps": ["elbow"], "biceps": ["elbow", "wrist"], "forearms": ["wrist"],
    "core": ["lower_back"], "plyo": ["knee", "ankle"], "cardio": ["knee", "ankle"],
    "calves": ["ankle"], "hip_iso": ["hip"], "mobility": [],
}

def is_timed(x, pat):
    return pat in ("mobility", "cardio") or x.get("force") == "static"

out = []
for x in json.load(open(SRC)):
    if x["category"] == "strongman": continue
    if "neck" in x["primaryMuscles"]: continue
    eq = equipment(x)
    pat = pattern(x)
    if not eq or not pat: continue
    gear = [eq] + (["bench"] if needs_bench(x, eq) else [])
    if eq == "barbell" and pat in ("squat", "push_h", "lunge") and not has(x["name"], "floor", "glute", "hip thrust"):
        gear.append("rack")
    out.append({
        "id": x["id"],
        "name": x["name"],
        "pattern": pat,
        "gear": gear,
        "level": {"beginner": 1, "intermediate": 2, "expert": 3}[x["level"]],
        "category": x["category"],
        "primary": x["primaryMuscles"],
        "secondary": x["secondaryMuscles"],
        "areas": AREAS[pat],
        "timed": is_timed(x, pat),
        "compound": x.get("mechanic") == "compound",
        "instructions": x["instructions"],
        "images": [IMG + i for i in x["images"]],
        "source": "fedb",
    })

def extra(id, name, pat, gear, level, primary, steps, timed=False, compound=True, cat="strength"):
    out.append({"id": id, "name": name, "pattern": pat, "gear": gear, "level": level,
                "category": cat, "primary": primary, "secondary": [], "areas": AREAS[pat],
                "timed": timed, "compound": compound, "instructions": steps,
                "images": [], "source": "app"})

extra("app_burpee", "Burpee", "plyo", ["bodyweight"], 2, ["quadriceps", "chest"],
      ["Stand tall, feet hip-width apart.", "Squat down and place your hands on the floor.",
       "Step or jump your feet back to a plank.", "Step or jump your feet back to your hands.",
       "Stand up. Add a small jump at the top if it feels good."], cat="plyometrics")
extra("app_jumping_jack", "Jumping Jacks", "plyo", ["bodyweight"], 1, ["calves", "shoulders"],
      ["Stand with feet together and arms at your sides.", "Jump your feet out while raising your arms overhead.",
       "Jump back to the start. Keep a steady rhythm.", "Low-impact option: step one foot out at a time."], timed=True, cat="plyometrics")
extra("app_high_knees", "High Knees", "plyo", ["bodyweight"], 1, ["quadriceps", "hamstrings"],
      ["Stand tall.", "Drive one knee up toward hip height, then the other, at a jog.",
       "Pump your arms and stay on the balls of your feet.", "Low-impact option: march instead of jogging."], timed=True, cat="plyometrics")
extra("app_bw_squat", "Bodyweight Squat", "squat", ["bodyweight"], 1, ["quadriceps", "glutes"],
      ["Stand with feet shoulder-width apart, toes slightly out.", "Push your hips back and bend your knees to lower down.",
       "Keep your chest up and heels on the floor.", "Go as low as is comfortable, then stand back up."])
extra("app_squat_jump", "Squat Jump", "plyo", ["bodyweight"], 2, ["quadriceps", "glutes"],
      ["Lower into a squat.", "Jump straight up.", "Land softly with bent knees and go right into the next squat."], cat="plyometrics")
extra("app_reverse_lunge", "Reverse Lunge", "lunge", ["bodyweight"], 1, ["quadriceps", "glutes"],
      ["Stand tall.", "Step one foot back and lower until both knees are bent about 90 degrees.",
       "Push through the front heel to stand back up.", "Alternate legs."])
extra("app_glute_bridge", "Glute Bridge", "hinge", ["bodyweight"], 1, ["glutes", "hamstrings"],
      ["Lie on your back with knees bent and feet flat.", "Squeeze your glutes and lift your hips until your body is straight from knees to shoulders.",
       "Pause for a second, then lower slowly."])
extra("app_wall_sit", "Wall Sit", "squat", ["bodyweight"], 1, ["quadriceps"],
      ["Lean your back against a wall.", "Slide down until your knees are bent about 90 degrees.", "Hold. Breathe normally."], timed=True)
extra("app_side_plank", "Side Plank", "core", ["bodyweight"], 1, ["abdominals"],
      ["Lie on your side, elbow under your shoulder.", "Lift your hips so your body forms a straight line.",
       "Hold, then switch sides. Easier: keep bottom knee on the floor."], timed=True, compound=False)
extra("app_bird_dog", "Bird Dog", "core", ["bodyweight"], 1, ["abdominals", "lower back"],
      ["Start on hands and knees.", "Reach one arm forward and the opposite leg back until both are straight.",
       "Hold for a breath, return, and switch sides."], compound=False)
extra("app_superman", "Superman Hold", "hinge", ["bodyweight"], 1, ["lower back"],
      ["Lie face down, arms reaching forward.", "Lift your arms, chest and legs a few inches off the floor.", "Hold, then lower."], timed=True, compound=False)
extra("app_bicycle_crunch", "Bicycle Crunch", "core", ["bodyweight"], 1, ["abdominals"],
      ["Lie on your back, hands lightly behind your head.", "Bring one knee in while turning the opposite elbow toward it.",
       "Switch sides in a pedaling motion. Don't pull on your neck."], compound=False)
extra("app_plank_tap", "Plank Shoulder Taps", "core", ["bodyweight"], 2, ["abdominals", "shoulders"],
      ["Start in a high plank, feet a bit wider than hips.", "Lift one hand to tap the opposite shoulder.",
       "Keep your hips still. Alternate sides."], compound=False)
extra("app_skater", "Skater Hops", "plyo", ["bodyweight"], 2, ["glutes", "quadriceps"],
      ["Hop sideways from one foot to the other.", "Land softly and let the back leg swing behind you.",
       "Low-impact option: step instead of hopping."], timed=True, cat="plyometrics")
extra("app_bear_crawl", "Bear Crawl", "plyo", ["bodyweight"], 2, ["shoulders", "quadriceps"],
      ["Start on hands and toes with knees just off the floor.", "Crawl forward by moving opposite hand and foot together.",
       "Keep your back flat and hips low."], timed=True, cat="plyometrics")
extra("app_bw_stepup", "Step-Up", "lunge", ["bodyweight"], 1, ["quadriceps", "glutes"],
      ["Stand facing a sturdy step or bench.", "Step up with one foot and stand fully on it.",
       "Step back down with control. Alternate or finish one side first."])
extra("app_band_row", "Band Row", "pull_h", ["bands"], 1, ["middle back", "lats"],
      ["Anchor a band at chest height or loop it around your feet while seated.", "Pull the handles to your ribs, squeezing your shoulder blades.",
       "Return slowly."])
extra("app_band_pulldown", "Band Lat Pulldown", "pull_v", ["bands"], 1, ["lats"],
      ["Anchor a band high above you.", "Kneel or sit and pull the handles down to your shoulders, elbows toward your sides.",
       "Return slowly."])
extra("app_band_curl", "Band Biceps Curl", "biceps", ["bands"], 1, ["biceps"],
      ["Stand on the band, handles in hand, palms forward.", "Curl your hands up to your shoulders, elbows still.", "Lower slowly."], compound=False)
extra("app_band_pushdown", "Band Triceps Pushdown", "triceps", ["bands"], 1, ["triceps"],
      ["Anchor a band high.", "Elbows at your sides, push your hands down until your arms are straight.", "Return slowly."], compound=False)
extra("app_band_deadlift", "Band Deadlift", "hinge", ["bands"], 1, ["hamstrings", "glutes"],
      ["Stand on the band with feet hip-width, handles in hand.", "Push your hips back with a flat back and soft knees.",
       "Stand tall by squeezing your glutes."])
extra("app_band_chest_press", "Band Chest Press", "push_h", ["bands"], 1, ["chest"],
      ["Anchor a band behind you at chest height.", "Press the handles straight forward until your arms are straight.", "Return slowly."])
extra("app_band_squat", "Band Squat", "squat", ["bands"], 1, ["quadriceps", "glutes"],
      ["Stand on the band, handles at your shoulders.", "Squat down with chest up.", "Stand back up against the band."])
extra("app_db_thruster", "Dumbbell Thruster", "squat", ["dumbbell"], 2, ["quadriceps", "shoulders"],
      ["Hold dumbbells at your shoulders.", "Squat down.", "Stand up and press the dumbbells overhead in one motion.", "Lower to your shoulders."])
extra("app_kb_swing", "Kettlebell Swing", "hinge", ["kettlebell"], 2, ["glutes", "hamstrings"],
      ["Stand with the kettlebell a foot in front of you.", "Hinge at the hips, grab it and hike it back between your legs.",
       "Snap your hips forward to swing it to chest height. Arms just guide it.", "Let it swing back and repeat."])
extra("app_db_row", "One-Arm Dumbbell Row", "pull_h", ["dumbbell"], 1, ["middle back", "lats"],
      ["Put one hand and knee on a bench or sturdy surface.", "Pull the dumbbell to your hip, elbow close to your side.", "Lower slowly. Switch sides."])

out.sort(key=lambda e: e["name"].lower())
ids = [e["id"] for e in out]
assert len(ids) == len(set(ids)), "duplicate ids"
json.dump(out, open("src/data/exercises.json", "w"), separators=(",", ":"))
from collections import Counter
print(len(out), "exercises")
print(Counter(e["pattern"] for e in out))
print(Counter(g for e in out for g in e["gear"]))
