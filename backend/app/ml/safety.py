"""Food-safety escalation flag - copied verbatim from the NLP handover src/api.py.
RULE-BASED keyword + category heuristic. NOT a food-safety determination."""
from typing import Optional

SAFETY_KEYWORDS = {
    "metal", "glass", "plastic", "needle", "blood", "sick", "ill", "nausea",
    "vomit", "allergen", "allergic", "mold", "mould", "contamination",
    "contaminated", "insect", "pest", "rodent", "foreign", "sharp",
    "microbial", "spoil", "spoiled", "spoilage", "unsafe", "hospital",
    "poisoning", "salmonella", "listeria", "ecoli", "e. coli",
}
SAFETY_CATEGORIES = {
    "Contamination / microbiological",
    "Infestation / pest",
    "Labelling / allergen issue",
    "Physical defect / foreign matter",
}


def safety_flag(text: str, top_category: Optional[str]) -> dict:
    t = (text or "").lower()
    hits = sorted(k for k in SAFETY_KEYWORDS if k in t)
    cat_hit = top_category in SAFETY_CATEGORIES if top_category else False
    escalate = bool(hits) or cat_hit
    return {
        "escalate_for_food_safety_review": escalate,
        "reason_keywords": hits,
        "reason_category_in_safety_bucket": cat_hit,
        "note": (
            "Heuristic escalation flag based on keywords and category. "
            "This is NOT a food-safety determination; human review is required."
        ),
    }
