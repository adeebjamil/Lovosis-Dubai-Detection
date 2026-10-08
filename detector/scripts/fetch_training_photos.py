"""Fetch open-source CC-licensed reference training photos from Wikimedia Commons into uploads/training/."""

from __future__ import annotations

import json
import time
import urllib.request
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UPLOADS_DIR = ROOT / "uploads" / "training"

COMMONS_FILES = [
    # Emirati Male (Kandura / Ghutra)
    {
        "category": "emirati_male",
        "title": "File:Khaled_Al_Khalidi_at_the_Arab_Media_Summit_in_Dubai_-_May_2026.jpg",
        "filename": "kandura_ghutra_1.jpg",
        "desc": "Emirati traditional Kandura & Ghutra (Khaled Al Khalidi)",
    },
    {
        "category": "emirati_male",
        "title": "File:Bagpipes_at_Dubai_Mall_(8939110333).jpg",
        "filename": "kandura_ghutra_2.jpg",
        "desc": "Emirati citizens in white Kandura at Dubai Mall",
    },
    {
        "category": "emirati_male",
        "title": "File:People_of_the_United_Arab_Emirates_(6).jpg",
        "filename": "kandura_ghutra_3.jpg",
        "desc": "Emirati men in national attire with Ghutra and Agal",
    },
    # Emirati Female (Abaya / Shayla)
    {
        "category": "emirati_female",
        "title": "File:Muslim_woman_wearing_black_Abaya_Niqāb1.jpg",
        "filename": "abaya_shayla_1.jpg",
        "desc": "Authentic black Abaya and Niqab / Shayla traditional attire",
    },
    {
        "category": "emirati_female",
        "title": "File:Woman_wearing_abaya_and_niqab.jpg",
        "filename": "abaya_shayla_2.jpg",
        "desc": "Gulf traditional black Abaya cloak and veil",
    },
    {
        "category": "emirati_female",
        "title": "File:A_Qatari_woman_in_a_hijab_and_abaya_shopping_for_perfumes_in_Souq_Waqif.jpg",
        "filename": "abaya_shayla_3.jpg",
        "desc": "Gulf woman in black Abaya walking in market",
    },
    # Non-Emirati (Regular / Casual western attire)
    {
        "category": "non_emirati",
        "title": "File:Tourism_in_Dubai_توریست_ها_در_کشور_امارات،_شهر_دبی_05.jpg",
        "filename": "casual_western_1.jpg",
        "desc": "Tourists and residents in modern casual shirts and trousers in Dubai",
    },
    {
        "category": "non_emirati",
        "title": "File:Tourism_in_Dubai_توریست_ها_در_کشور_امارات،_شهر_دبی_07.jpg",
        "filename": "casual_western_2.jpg",
        "desc": "Visitors in regular casual western clothing in Dubai",
    },
    {
        "category": "non_emirati",
        "title": "File:Waterfall_@Dubai_Mall.jpg",
        "filename": "casual_western_3.jpg",
        "desc": "Dubai Mall visitors in diverse international casual clothes",
    },
]

USER_AGENT = "LovosisFalconVisionResearch/2.0 (contact: info@lovosis.com; academic research)"


def get_commons_url(file_title: str) -> str | None:
    api = f"https://commons.wikimedia.org/w/api.php?action=query&titles={urllib.parse.quote(file_title)}&prop=imageinfo&iiprop=url&format=json"
    req = urllib.request.Request(api, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            info = page.get("imageinfo", [])
            if info and "url" in info[0]:
                return info[0]["url"]
    return None


def main():
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []

    # Clean up old synthetic pattern files if present
    synthetic_files = [
        UPLOADS_DIR / "emirati_male" / "kandura_reference_pattern.jpg",
        UPLOADS_DIR / "emirati_female" / "abaya_reference_pattern.jpg",
        UPLOADS_DIR / "non_emirati" / "casual_regular_pattern.jpg",
    ]
    for syn in synthetic_files:
        if syn.exists():
            try:
                syn.unlink()
                print(f"🗑 Removed synthetic placeholder: {syn.name}")
            except Exception as e:
                print(f"⚠ Could not remove {syn}: {e}")

    for item in COMMONS_FILES:
        cat_dir = UPLOADS_DIR / item["category"]
        cat_dir.mkdir(parents=True, exist_ok=True)
        dest = cat_dir / item["filename"]

        print(f"Resolving {item['title']}...")
        try:
            time.sleep(1.2)  # Polite throttle to prevent 429
            url = get_commons_url(item["title"])
            if not url:
                print(f"⚠ Could not resolve URL for {item['title']}")
                continue

            print(f"↓ Fetching {url} -> {dest.name}...")
            time.sleep(1.0)
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as r, dest.open("wb") as out:
                out.write(r.read())
            print(f"✔ Saved {dest.name} ({dest.stat().st_size // 1024} KB)")
            manifest.append({
                "category": item["category"],
                "filename": item["filename"],
                "description": item["desc"],
                "url": url,
                "path": str(dest.relative_to(ROOT)),
                "bytes": dest.stat().st_size,
            })
        except Exception as e:
            print(f"⚠ Error for {item['title']}: {e}")

    manifest_path = UPLOADS_DIR / "dataset_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"✔ Real dataset ready with {len(manifest)} authentic photos at {UPLOADS_DIR}")


if __name__ == "__main__":
    main()
