"""Check design artifacts; not a replacement for the future TypeScript validator."""
from copy import deepcopy
import json
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / "schema/game.schema.json").read_text(encoding="utf-8"))
GAME_PATH = ROOT / "examples/harbor/game.json"
GAME = json.loads(GAME_PATH.read_text(encoding="utf-8"))


def semantic_errors(game):
    errors = []
    collections = ("assets", "stats", "flags", "cards", "decks", "chapters", "endings")
    indexes = {}
    for name in collections:
        entries = game[name]
        indexes[name] = {entry["id"]: entry for entry in entries}
        if len(indexes[name]) != len(entries):
            errors.append(f"{name}: duplicate IDs")
    refs = {
        "statId": "stats", "flagId": "flags", "cardId": "cards",
        "followUpCardId": "cards", "deckId": "decks", "toChapterId": "chapters",
        "startChapterId": "chapters", "fallbackEndingId": "endings",
        "imageAssetId": "assets", "iconAssetId": "assets",
        "backgroundAssetId": "assets", "fontAssetId": "assets",
    }

    def walk(value, path="$", field=None):
        if isinstance(value, dict):
            for key, child in value.items():
                walk(child, f"{path}.{key}", key)
        elif isinstance(value, list):
            for i, child in enumerate(value):
                walk(child, f"{path}[{i}]")
        elif field in refs:
            target = indexes[refs[field]].get(value)
            if target is None:
                errors.append(f"{path}: unknown reference {value}")
            elif refs[field] == "assets":
                expected = "font" if field == "fontAssetId" else "image"
                if target["kind"] != expected:
                    errors.append(f"{path}: expected {expected}")

    walk(game)
    for stat in game["stats"]:
        if not stat["min"] < stat["max"] or not stat["min"] <= stat["initial"] <= stat["max"]:
            errors.append(f"stats.{stat['id']}: invalid range/initial")
    paths = [asset["path"] for asset in game["assets"]]
    if len(paths) != len(set(paths)):
        errors.append("assets: duplicate paths")
    for asset in game["assets"]:
        path = GAME_PATH.parent / asset["path"]
        if not path.is_file():
            errors.append(f"assets.{asset['id']}: missing file")
        allowed = {".woff2"} if asset["kind"] == "font" else {".png", ".jpg", ".jpeg", ".webp"}
        if path.suffix not in allowed:
            errors.append(f"assets.{asset['id']}: kind/extension mismatch")
    for deck in game["decks"]:
        ids = [entry["cardId"] for entry in deck["cards"]]
        if len(ids) != len(set(ids)):
            errors.append(f"decks.{deck['id']}: duplicate cards")
        if deck["mode"] == "ordered" and any(entry["weight"] != 1 for entry in deck["cards"]):
            errors.append(f"decks.{deck['id']}: ordered weights must equal 1")
    for chapter in game["chapters"]:
        ids = [entry["deckId"] for entry in chapter["decks"]]
        if len(ids) != len(set(ids)):
            errors.append(f"chapters.{chapter['id']}: duplicate decks")
    priorities = [ending["priority"] for ending in game["endings"]]
    if len(priorities) != len(set(priorities)):
        errors.append("endings: duplicate priorities")
    for ending in game["endings"]:
        if (ending["id"] == game["fallbackEndingId"]) == ("when" in ending):
            errors.append(f"endings.{ending['id']}: invalid trigger/fallback relationship")
    return errors


def main():
    Draft202012Validator.check_schema(SCHEMA)
    validator = Draft202012Validator(SCHEMA)
    validator.validate(GAME)
    errors = semantic_errors(GAME)
    if errors:
        raise SystemExit("\n".join(errors))

    def rejects(label, mutate, semantic=False):
        broken = deepcopy(GAME)
        mutate(broken)
        failures = semantic_errors(broken) if semantic else list(validator.iter_errors(broken))
        if not failures:
            raise AssertionError(f"Invalid fixture accepted: {label}")
        print(f"PASS rejects {label}")

    rejects("unknown property", lambda g: g.update(secret="never allowed"))
    rejects("path traversal", lambda g: g["assets"][0].update(path="assets/../../secret.png"))
    rejects("incomplete effect", lambda g: g["cards"][0]["left"].update(effects=[{"kind": "statDelta"}]))
    rejects("missing bundled font", lambda g: g["theme"].update(font="bundled"))
    rejects("empty predicate group", lambda g: g["cards"][0].update(when={"mode": "all", "rules": []}))
    rejects("unknown chapter", lambda g: g.update(startChapterId="missing"), True)
    rejects("unknown follow-up", lambda g: g["cards"][0]["left"].update(followUpCardId="missing"), True)
    rejects("invalid stat range", lambda g: g["stats"][0].update(initial=999), True)
    rejects("duplicate card IDs", lambda g: g["cards"].append(deepcopy(g["cards"][0])), True)
    rejects("duplicate ending priority", lambda g: g["endings"][0].update(priority=0), True)
    rejects("missing image", lambda g: g["assets"][0].update(path="assets/missing.png"), True)
    rejects("weighted ordered entry", lambda g: g["decks"][0]["cards"][0].update(weight=2), True)
    rejects("triggered fallback", lambda g: g["endings"][-1].update(when={"mode": "all", "rules": [{"kind": "turn", "scope": "run", "op": "gte", "value": 0}]}), True)
    print("PASS schema, example, semantic checks and 13 invalid fixtures")


if __name__ == "__main__":
    main()
