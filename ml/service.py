from __future__ import annotations

import os
import re
import json
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from joblib import load
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
load_dotenv(PROJECT_ROOT / ".env")
MODEL_PATH = ROOT / "models" / "intent_classifier.joblib"
app = FastAPI(title="InsureMate Python NLP/ML Service", version="1.0.0")
intent_model = None
GEMINI_FALLBACK_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
]


class AnalyzeRequest(BaseModel):
    category: str = "health"
    message: str
    currentStructured: dict[str, Any] | None = None
    basicDetails: dict[str, Any] | None = None


class SemanticRequest(BaseModel):
    structured: dict[str, Any]
    policies: list[dict[str, Any]]


def get_intent_model():
    global intent_model
    if intent_model is None and MODEL_PATH.exists():
        intent_model = load(MODEL_PATH)
    return intent_model


def process_user_input(raw_text: str) -> dict[str, Any]:
    cleaned = re.sub(r"\s+", " ", raw_text).strip()
    normalized = cleaned
    expansions = [
        (r"\bPEDs?\b", "PED", "pre-existing disease"),
        (r"\bzero[\s-]?dep\b", "zero dep", "zero depreciation"),
        (r"\bbumper[\s-]?to[\s-]?bumper\b", "bumper to bumper", "zero depreciation"),
        (r"\bRSA\b", "RSA", "roadside assistance"),
        (r"\bNCB\b", "NCB", "no claim bonus"),
        (r"\bOPD\b", "OPD", "outpatient department cover"),
        (r"\bIDV\b", "IDV", "insured declared value"),
        (r"\bTP\b", "TP", "third-party liability"),
        (r"\bOD\b", "OD", "own damage"),
        (r"\bRTI\b", "RTI", "return to invoice"),
        (r"\bTROP\b", "TROP", "term return of premium"),
        (r"\bCI\b", "CI", "critical illness"),
        (r"\bCSR\b", "CSR", "claim settlement ratio"),
        (r"\bno room rent cap\b", "no room rent cap", "no room rent restriction"),
        (r"\bco-?pay\b", "co-pay", "co-payment"),
        (r"\bshorter PED waiting\b", "shorter PED waiting", "shorter pre-existing disease waiting period"),
    ]
    expanded = []
    for pattern, abbr, replacement in expansions:
        if re.search(pattern, normalized, flags=re.I):
            expanded.append({"abbr": abbr, "expanded": replacement})
            normalized = re.sub(pattern, replacement, normalized, flags=re.I)
    amounts = []
    for value in re.findall(r"(\d+(?:\.\d+)?)\s*(?:l|lac|lacs|lakh|lakhs)\b", cleaned, flags=re.I):
        amounts.append(round(float(value) * 100000))
    for value in re.findall(r"(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)\b", cleaned, flags=re.I):
        amounts.append(round(float(value) * 10000000))
    years = [int(v) for v in re.findall(r"(\d+)\s*(?:yr|yrs|year|years)\b", cleaned, flags=re.I)]
    return {"rawText": cleaned, "normalizedText": normalized,
            "abbreviationsExpanded": expanded,
            "detectedNumbers": {"lakhsOrCrores": amounts, "years": years}}


def classify_intent(text: str, has_requirements: bool, has_conflicts: bool) -> str:
    # High-precision rules handle explicit conversational actions; the trained
    # TF-IDF + LogisticRegression model handles less obvious phrasing.
    lower = text.lower()
    if re.search(r"\b(recommend|show plans|show policies|find plans|generate|get recommendations|go ahead|proceed)\b", lower) and len(lower) < 100:
        return "request_recommendations"
    if has_conflicts and re.search(r"\b(keep|drop|remove|switch|prefer|instead|budget|increase|accept|ok with|compromise)\b", lower):
        return "resolve_conflict"
    if has_requirements and re.search(r"\b(actually|change|update|remove|make it|instead|also|don't need|no longer|increase|decrease)\b", lower):
        return "modify_constraint"
    if lower.endswith("?") and re.search(r"\b(what|why|how|explain|mean|difference)\b", lower):
        return "ask_clarification"
    model = get_intent_model()
    if model is not None:
        return str(model.predict([text])[0])
    return "provide_requirements"


SYSTEM_PROMPT = '''You are the entity-extraction module for InsureMate, an insurance recommendation system.
Extract only information stated or clearly clarified by the user. Do not invent facts, prices, policy terms, or numbers.
Return one valid JSON object with fields: insurance_type (health|car|life|travel), coverage, budget, tenure_years, age, familyMembers, city, carInsuranceType (comprehensive|third_party|own_damage), destination, travelDurationDays, requirements (array of canonicalKey,name,preference,priority,sourceText), removed_keys, clarification_answer.
Canonical keys:
Health: ped_waiting_period, room_rent_limit, maternity_benefits, copayment, cashless_hospitals, opd_cover, restore_benefit, daycare_procedures, no_claim_bonus.
Car: zero_depreciation, roadside_assistance, engine_protection, deductible, consumables_cover, return_to_invoice, cashless_garages, car_cover_type.
Life: large_life_cover, long_tenure, affordable_premium, critical_illness_rider, accidental_death_rider, waiver_of_premium, return_of_premium, claim_settlement_ratio.
Travel: medical_emergency, baggage_protection, trip_cancellation, flight_delay, pre_existing_emergency, adventure_sports, schengen_compliant, passport_loss, cashless_abroad.
Priority: mandatory for must/need/require/essential/don't want/firm requirements; preferred for prefer/would like/ideally/looking for; optional for nice-to-have/bonus/maybe.
Normalize shorter waiting period to shorter; no room rent cap to no_limit; zero/minimal co-pay to minimal_or_zero; low deductible to low; maternity/zero depreciation to included; affordable premiums to affordable; large life cover to high; long period to long.
If user removes a requirement, include its key in removed_keys. For general insurance questions answer briefly in clarification_answer. Use null for unknown numeric values. Preserve current insurance type unless changed. Return JSON only.'''


def get_gemini_keys() -> list[str]:
    return [
        key for key in (
            os.getenv("GEMINI_API_KEY", "").strip(),
            os.getenv("GEMINI_API_KEY_2", "").strip(),
            os.getenv("GEMINI_API_KEY_3", "").strip(),
            os.getenv("GEMINI_API_KEY_4", "").strip(),
        )
        if key and not key.startswith("YOUR_")
    ]


def get_gemini_models() -> list[str]:
    configured_model = os.getenv("GEMINI_MODEL", "").strip()
    return list(dict.fromkeys(
        ([configured_model] if configured_model else []) + GEMINI_FALLBACK_MODELS
    ))


async def generate_with_gemini(user_content: str) -> tuple[str, str]:
    keys = get_gemini_keys()
    if not keys:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured in the project-root .env file.",
        )

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_content}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 1800,
            "responseMimeType": "application/json",
        },
    }
    last_status = None
    last_failure = None
    async with httpx.AsyncClient(timeout=45) as client:
        for model in get_gemini_models():
            for key in keys:
                try:
                    response = await client.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                        params={"key": key},
                        json=payload,
                    )
                except httpx.HTTPError:
                    last_failure = "Network error while contacting Gemini."
                    continue
                if response.status_code >= 400:
                    last_status = response.status_code
                    last_failure = f"Gemini returned HTTP {response.status_code}."
                    continue
                try:
                    response_body = response.json()
                except ValueError:
                    last_failure = "Gemini returned an invalid response."
                    continue
                candidates = response_body.get("candidates") if isinstance(response_body, dict) else None
                candidate = candidates[0] if isinstance(candidates, list) and candidates else {}
                candidate_content = candidate.get("content") if isinstance(candidate, dict) else None
                parts = candidate_content.get("parts", []) if isinstance(candidate_content, dict) else []
                content = "".join(
                    part.get("text", "")
                    for part in parts
                    if isinstance(part, dict) and isinstance(part.get("text"), str)
                ) if isinstance(parts, list) else ""
                if content:
                    return content, model
                last_failure = "Gemini returned an empty response."

    if last_status == 429:
        raise HTTPException(
            status_code=429,
            detail="Gemini rate limit or quota exceeded for all configured model/key combinations.",
        )
    detail = "Gemini generation failed for all configured model/key combinations."
    if last_failure:
        detail += f" {last_failure}"
    raise HTTPException(status_code=502, detail=detail)


async def extract_entities(normalized: str, raw: str, current: dict, intent: str) -> tuple[dict, str]:
    content, model = await generate_with_gemini(
        f"Current context JSON:\n{json.dumps(current, ensure_ascii=False)}"
        f"\n\nUser intent: {intent}\nRaw user message: {raw}"
        f"\nNormalized user message: {normalized}"
    )
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Gemini returned invalid JSON.") from exc
    categories = ["health", "car", "life", "travel"]
    category = parsed.get("insurance_type") if parsed.get("insurance_type") in categories else current.get("insurance_type", "health")
    basic = {}
    mapping = {"age": "age", "familyMembers": "familyMembers", "city": "city",
               "carInsuranceType": "carInsuranceType", "destination": "destination",
               "travelDurationDays": "travelDurationDays"}
    for source, target in mapping.items():
        if parsed.get(source) is not None:
            basic[target] = parsed[source]
    requirements = []
    for item in parsed.get("requirements", []) or []:
        if all(item.get(k) for k in ("canonicalKey", "name", "preference", "sourceText")):
            priority = item.get("priority")
            if priority not in ("mandatory", "preferred", "optional"):
                priority = "preferred"
            requirements.append({"canonicalKey": str(item["canonicalKey"]).lower().strip(),
                                 "name": item["name"], "preference": item["preference"],
                                 "priority": priority, "sourceText": item["sourceText"]})
    return ({"insurance_type": category,
             "coverage": parsed.get("coverage") if isinstance(parsed.get("coverage"), (int, float)) else None,
             "budget": parsed.get("budget") if isinstance(parsed.get("budget"), (int, float)) else None,
             "tenure_years": parsed.get("tenure_years") if isinstance(parsed.get("tenure_years"), (int, float)) else None,
             "basic_details_updates": basic, "requirements": requirements,
             "removed_keys": [str(k).lower().strip() for k in parsed.get("removed_keys", [])],
             "clarification_answer": parsed.get("clarification_answer")}, model)


LABELS = {
    "ped_waiting_period": "PED waiting period", "room_rent_limit": "Room rent limit",
    "maternity_benefits": "Maternity benefits", "copayment": "Co-payment",
    "cashless_hospitals": "Cashless hospitals", "opd_cover": "OPD consultations",
    "restore_benefit": "Sum insured restoration", "zero_depreciation": "Zero depreciation cover",
    "roadside_assistance": "Roadside assistance", "engine_protection": "Engine protection",
    "deductible": "Deductible limit", "consumables_cover": "Consumables cover",
    "return_to_invoice": "Return to invoice", "cashless_garages": "Cashless garages",
    "large_life_cover": "Large life cover", "long_tenure": "Long policy tenure",
    "affordable_premium": "Affordable premiums", "critical_illness_rider": "Critical illness rider",
    "accidental_death_rider": "Accidental death rider", "waiver_of_premium": "Waiver of premium",
    "return_of_premium": "Return of premium", "claim_settlement_ratio": "High claim settlement ratio",
    "medical_emergency": "International medical emergency", "baggage_protection": "Baggage protection",
    "trip_cancellation": "Trip cancellation cover", "flight_delay": "Flight delay cover",
    "pre_existing_emergency": "Pre-existing emergency cover", "adventure_sports": "Adventure sports cover",
    "schengen_compliant": "Schengen visa compliance", "passport_loss": "Passport loss protection",
    "cashless_abroad": "Cashless hospitalization abroad"}


def normalize_key(key: str) -> str:
    k = re.sub(r"[\s-]+", "_", key.lower().strip())
    rules = [("ped", "ped_waiting_period"), ("pre_existing_disease", "ped_waiting_period"),
             ("room_rent", "room_rent_limit"), ("maternity", "maternity_benefits"),
             ("copay", "copayment"), ("co_pay", "copayment"), ("cashless_hospital", "cashless_hospitals"),
             ("zero_dep", "zero_depreciation"), ("roadside", "roadside_assistance"),
             ("engine", "engine_protection"), ("deductible", "deductible"), ("excess", "deductible"),
             ("baggage", "baggage_protection"), ("medical_emergency", "medical_emergency"),
             ("medical_cover", "medical_emergency"), ("schengen", "schengen_compliant"),
             ("critical_illness", "critical_illness_rider"), ("return_of_premium", "return_of_premium"),
             ("large_life", "large_life_cover"), ("high_cover", "large_life_cover"),
             ("long_tenure", "long_tenure"), ("long_period", "long_tenure"),
             ("affordable", "affordable_premium"), ("low_premium", "affordable_premium")]
    for part, value in rules:
        if part in k or (part == "roadside" and k == "rsa") or (part == "return_of_premium" and k == "trop"):
            return value
    return k


def classify_requirements(raw_requirements: list[dict], full_text: str) -> list[dict]:
    output = []
    lower = full_text.lower()
    for idx, req in enumerate(raw_requirements):
        key = normalize_key(req["canonicalKey"])
        priority = req.get("priority", "preferred")
        snippet = (req.get("sourceText") or req.get("name") or "").lower()
        if re.search(r"\b(must|mandatory|essential|required|cannot accept|need coverage|i need|don't want|do not want|no compromise)\b", snippet):
            priority = "mandatory"
        elif re.search(r"\b(optional|nice to have|if possible|bonus|maybe)\b", snippet):
            priority = "optional"
        elif re.search(r"\b(prefer|ideally|would like|looking for)\b", snippet) and priority != "mandatory":
            priority = "preferred"
        if key == "deductible" and "don't want a high deductible" in lower:
            priority = "mandatory"
        output.append({"id": f"req-{key}-{idx}-{int(time.time() * 1000)}",
                       "canonicalKey": key, "name": LABELS.get(key, req["name"]),
                       "preference": req["preference"], "priority": priority,
                       "sourceText": req.get("sourceText")})
    return output


def empty_state(category: str, details: dict | None = None) -> dict:
    details = details or {}
    coverage = details.get("coverageAmount") or details.get("vehicleValue") or details.get("desiredLifeCover")
    return {"insurance_type": category, "coverage": coverage, "budget": details.get("annualBudget"),
            "tenure_years": details.get("policyTenureYears"), "basic_details": details,
            "requirements": [], "conflicts": [], "missing_info": []}


def merge_context(current: dict, extracted: dict, normalized: list[dict]) -> dict:
    details = {**(current.get("basic_details") or {}), **(extracted.get("basic_details_updates") or {})}
    coverage = extracted.get("coverage") if extracted.get("coverage") is not None else current.get("coverage")
    if coverage is None:
        coverage = details.get("coverageAmount") or details.get("vehicleValue") or details.get("desiredLifeCover")
    budget = extracted.get("budget") if extracted.get("budget") is not None else current.get("budget")
    if budget is None:
        budget = details.get("annualBudget")
    tenure = extracted.get("tenure_years") if extracted.get("tenure_years") is not None else current.get("tenure_years")
    if tenure is None:
        tenure = details.get("policyTenureYears")
    removed = set(extracted.get("removed_keys") or [])
    req_map = {r["canonicalKey"]: r for r in current.get("requirements", []) if r["canonicalKey"] not in removed}
    for req in normalized:
        if req["canonicalKey"] not in removed:
            req_map[req["canonicalKey"]] = req
    category = extracted.get("insurance_type", current.get("insurance_type", "health"))
    if coverage and category == "health": details["coverageAmount"] = coverage
    if coverage and category == "life": details["desiredLifeCover"] = coverage
    if budget: details["annualBudget"] = budget
    if tenure: details["policyTenureYears"] = tenure
    return {"insurance_type": category, "coverage": coverage, "budget": budget,
            "tenure_years": tenure, "basic_details": details,
            "requirements": list(req_map.values()), "conflicts": [], "missing_info": []}


def followups(state: dict) -> dict:
    conflicts, missing, questions = [], [], []
    reqs = state.get("requirements", [])
    keys = {r["canonicalKey"] for r in reqs}
    reqmap = {r["canonicalKey"]: r for r in reqs}
    details = state.get("basic_details") or {}
    category, budget = state.get("insurance_type"), state.get("budget")
    def conflict(cid, title, desc, involved, severity, qid, question, reason, replies=None, target=None):
        conflicts.append({"id": cid, "title": title, "description": desc, "involvedKeys": involved, "severity": severity})
        q = {"id": qid, "question": question, "reason": reason}
        if replies is not None: q["suggestedReplies"] = replies
        if target: q["targetField"] = target
        questions.append(q)
    if category == "car" and details.get("carInsuranceType") == "third_party" and keys.intersection({"zero_depreciation", "engine_protection", "consumables_cover"}):
        conflict("conflict-tp-zerodep", "Third-Party cover conflicts with own-damage add-ons", "You selected Third-Party liability insurance, but requested own-damage add-ons (Zero Depreciation / Engine Protection). Third-party plans only cover damage to others.", ["car_cover_type", "zero_depreciation", "engine_protection"], "blocking", "fu-tp-comprehensive", "Would you like to switch from Third-Party to Comprehensive cover so Zero Depreciation and Engine Protection can be included?", "Resolves cover type vs. add-on contradiction", ["Switch to Comprehensive cover", "Keep Third-Party and drop zero depreciation"], "carInsuranceType")
    if category == "health" and budget is not None and budget < 14000 and {"maternity_benefits", "room_rent_limit"}.issubset(keys):
        conflict("conflict-health-budget-maternity", "Budget may restrict maternity + zero room cap options", f"An annual budget of ₹{budget:,.0f} is tight for plans offering both maternity coverage and unrestricted private room rent.", ["maternity_benefits", "room_rent_limit"], "warning", "fu-budget-maternity", "Maternity + no room rent cap plans typically start around ₹22,000/year. Would you prefer to raise your budget, or make maternity optional?", "Aligns budget with benefit expectations", ["I can stretch my budget up to ₹24,000", "Make maternity optional"])
    if category == "life" and {"return_of_premium", "affordable_premium"}.issubset(keys):
        conflict("conflict-life-trop-affordable", "Return of Premium increases annual cost significantly", "Return-of-Premium (TROP) plans cost roughly 1.7x–2x more than pure-term plans for the same life cover.", ["return_of_premium", "affordable_premium"], "warning", "fu-trop-vs-pure", "Do you prioritize lower annual premiums (Pure Term) or getting base premiums refunded at maturity (Return of Premium)?", "Clarifies cost vs. maturity return trade-off", ["Prefer pure term for affordable premiums", "Keep return of premium despite higher cost"])
    if category == "health":
        if not state.get("coverage"): missing.append("Required health coverage amount")
        if not details.get("age"): missing.append("Applicant age")
        if "ped_waiting_period" in keys and not re.search(r"\d", str(reqmap["ped_waiting_period"].get("preference", ""))):
            questions.append({"id":"fu-ped-years", "question":"For Pre-Existing Disease (PED) coverage, is a 2-year waiting period acceptable, or do you strictly require 1 year or less?", "reason":"Helps separate 1-year chronic care plans from 2-year comprehensive plans", "suggestedReplies":["2 years or less is fine", "Strictly 1 year waiting period or less"]})
        if "maternity_benefits" in keys and (details.get("familyMembers") or 1) == 1:
            questions.append({"id":"fu-maternity-family", "question":"You mentioned maternity benefits — are you planning a family floater covering a spouse as well?", "reason":"Confirms individual vs. couple/family floater eligibility", "suggestedReplies":["Yes, cover myself and spouse (2 members)", "Individual cover only"]})
    if category == "car":
        if not details.get("vehicleValue") and not state.get("coverage"): missing.append("Approximate vehicle value (IDV)")
        if not details.get("manufacturingYear"):
            missing.append("Vehicle manufacturing year (affects Zero-Dep eligibility)")
            questions.append({"id":"fu-car-year", "question":"Which manufacturing year is your vehicle? Cars older than 7 years have limited Zero Depreciation availability.", "reason":"Checks Zero-Dep age eligibility", "suggestedReplies":["2023 or newer", "2020–2022", "Older than 2018"]})
    if category == "life":
        if not state.get("coverage") and not details.get("desiredLifeCover"): missing.append("Desired life cover amount")
        if not state.get("tenure_years"): missing.append("Policy tenure")
    if category == "travel":
        if not details.get("destination"):
            missing.append("Travel destination region")
            questions.append({"id":"fu-travel-dest", "question":"Which country or region are you travelling to? (Schengen, USA/Canada, and Asia have distinct medical mandates.)", "reason":"Verifies regional eligibility and visa compliance", "suggestedReplies":["Europe / Schengen", "USA / Canada", "Asia-Pacific"]})
        if not details.get("travelDurationDays"): missing.append("Trip duration in days")
    return {"conflicts": conflicts, "missing_info": missing, "followUpQuestions": questions[:2]}


@app.get("/health")
def health():
    return {"status": "ok", "service": "python-nlp", "intent_model_loaded": MODEL_PATH.exists()}


@app.post("/analyze")
async def analyze(request: AnalyzeRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    working = request.currentStructured or empty_state(request.category, request.basicDetails)
    if request.basicDetails:
        details = {**working.get("basic_details", {}), **request.basicDetails}
        working = {**working, "basic_details": details,
                   "coverage": request.basicDetails.get("coverageAmount") or request.basicDetails.get("vehicleValue") or request.basicDetails.get("desiredLifeCover") or working.get("coverage"),
                   "budget": request.basicDetails.get("annualBudget") or working.get("budget"),
                   "tenure_years": request.basicDetails.get("policyTenureYears") or working.get("tenure_years")}
    processed = process_user_input(request.message)
    intent = classify_intent(processed["normalizedText"], bool(working.get("requirements")), bool(working.get("conflicts")))
    extracted, gemini_model = await extract_entities(processed["normalizedText"], processed["rawText"], working, intent)
    normalized = classify_requirements(extracted.get("requirements", []), processed["normalizedText"])
    merged = merge_context(working, extracted, normalized)
    result = followups(merged)
    final_state = {**merged, "conflicts": result["conflicts"], "missing_info": result["missing_info"]}
    parts = []
    if extracted.get("clarification_answer"):
        parts.append(extracted["clarification_answer"])
    if normalized:
        requirement_summary = ", ".join("{}: {}".format(r["name"], r["priority"]) for r in normalized)
        parts.append("I extracted {} requirement{} ({}).".format(len(normalized), "s" if len(normalized) != 1 else "", requirement_summary))
    elif not extracted.get("clarification_answer"):
        parts.append("I updated your session details.")
    if result["conflicts"]:
        parts.append("Heads up: " + result["conflicts"][0]["description"])
    elif result["followUpQuestions"]:
        parts.append(result["followUpQuestions"][0]["question"])
    else:
        parts.append('Your structured requirement profile is ready. Review the summary below and click "Generate Recommendations" when ready.')
    assistant_reply = " ".join(parts)
    print(
        f"[InsureMate] Gemini model={gemini_model} intent={intent}\n"
        f"Assistant reply: {assistant_reply}",
        flush=True,
    )
    return {"intent": intent, "normalizedText": processed["normalizedText"],
            "abbreviationsExpanded": processed["abbreviationsExpanded"],
            "structured": final_state, "followUpQuestions": result["followUpQuestions"],
            "assistantReply": assistant_reply,
            "geminiModel": gemini_model,
            "readyForRecommendations": not any(c["severity"] == "blocking" for c in result["conflicts"])}


def policy_document(policy: dict) -> str:
    features = policy.get("features") or {}
    clauses = " | ".join(
        f"{c.get('sectionRef','')} {c.get('title','')}: {c.get('summary','')}"
        for c in policy.get("clauses", [])
    )
    return "\n".join([
        f"Plan: {policy.get('name','')}",
        f"Category: {policy.get('category','')}",
        f"Overview: {policy.get('overview','')}",
        f"Coverage range: {policy.get('minCoverage','')} to {policy.get('maxCoverage','')}",
        f"Annual premium: {policy.get('estimatedAnnualPremium','')} {policy.get('premiumNote','')}",
        f"Waiting period: {policy.get('importantWaitingPeriod','')}",
        f"Limits: {policy.get('roomRentOrLimitSummary','')}",
        f"Co-payment or Deductible: {policy.get('copaymentOrDeductibleSummary','')}",
        "Benefits: " + "; ".join(policy.get("benefits", [])),
        "Exclusions: " + "; ".join(policy.get("exclusions", [])),
        "Feature values: " + json.dumps(features, ensure_ascii=False),
        f"Official source: {policy.get('officialUrl') or ''}",
        f"Clauses: {clauses}",
    ])


def requirement_query(structured: dict) -> str:
    req_desc = "; ".join(
        f"{r.get('priority')} requirement: {r.get('name')} ({r.get('preference')})"
        for r in structured.get("requirements", [])
    )
    details = ", ".join(
        f"{k}: {v}" for k, v in (structured.get("basic_details") or {}).items()
        if v not in (None, "")
    )
    return " ".join([
        f"Insurance category: {structured.get('insurance_type')}.",
        f"Target coverage: {structured.get('coverage') or 'not specified'}.",
        f"Annual budget: {structured.get('budget') or 'not specified'}.",
        f"Policy tenure: {structured.get('tenure_years') or 'not specified'}.",
        details,
        f"Requirements: {req_desc or 'general comprehensive protection'}.",
    ])


def load_knowledge_pages(category: str) -> list[dict[str, Any]]:
    """Load cleaned scraped pages first, falling back to raw pages."""
    paths = [
        ROOT / "scraped_data" / "cleaned" / "insurance_dataset.jsonl",
        ROOT / "scraped_data" / "raw" / "insurance_pages.jsonl",
    ]
    pages: list[dict[str, Any]] = []
    seen: set[str] = set()
    for path in paths:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            url = str(row.get("source_url", ""))
            text = str(row.get("text", "")).strip()
            page_category = str(row.get("category", "general")).lower()
            if not text or url in seen:
                continue
            if page_category not in ("general", "", category.lower()):
                continue
            seen.add(url)
            pages.append({
                "title": str(row.get("title", "Insurance information")),
                "source_url": url,
                "provider_domain": str(row.get("provider_domain") or urlparse(url).netloc),
                "category": page_category,
                "text": text,
            })
        # Prefer the cleaned dataset when present; raw is only fallback.
        if pages:
            break
    return pages


def load_policy_source_map() -> dict[str, list[str]]:
    path = ROOT / "policy_sources.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {str(k): [str(u) for u in v] for k, v in data.items() if isinstance(v, list)}
    except (json.JSONDecodeError, OSError):
        return {}


def chunk_text(text: str, max_chars: int = 1100) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"(?<=[.!?])\s+|\n+", text) if len(p.strip()) >= 45]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(current) + len(paragraph) + 1 > max_chars and current:
            chunks.append(current)
            current = paragraph
        else:
            current = f"{current} {paragraph}".strip()
    if current:
        chunks.append(current)
    return chunks


@app.post("/semantic-scores")
def semantic_scores(request: SemanticRequest):
    policies = request.policies
    if not policies:
        return {"scores": {}, "engineUsed": "python-sklearn-hybrid-tfidf", "knowledgeMatches": [], "scrapedPagesAvailable": 0}

    category = str(request.structured.get("insurance_type", "general")).lower()
    query = requirement_query(request.structured)
    pages = load_knowledge_pages(category)
    source_map = load_policy_source_map()
    page_by_url = {page["source_url"]: page for page in pages}

    # Scraped pages are attached to a policy only through an explicit source map
    # or an exact official-domain match. Generic pages are retrieved as evidence,
    # but are never silently treated as verified facts about an unrelated plan.
    policy_docs: list[str] = []
    mapped_page_count = 0
    for policy in policies:
        linked_urls = set(source_map.get(str(policy.get("id")), []))
        official_url = policy.get("officialUrl")
        if official_url:
            official_domain = urlparse(str(official_url)).netloc.lower().removeprefix("www.")
            for page in pages:
                page_domain = urlparse(page["source_url"]).netloc.lower().removeprefix("www.")
                if official_domain and (page_domain == official_domain or page_domain.endswith("." + official_domain)):
                    linked_urls.add(page["source_url"])
        linked_pages = [page_by_url[url] for url in linked_urls if url in page_by_url]
        mapped_page_count += len(linked_pages)
        linked_text = " ".join(page["text"] for page in linked_pages)
        policy_docs.append(policy_document(policy) + "\n" + linked_text)

    # Hybrid word + character TF-IDF handles both terminology and spelling/phrase variants.
    documents = [query] + policy_docs
    word_matrix = TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True,
                                  strip_accents="unicode", max_features=50000).fit_transform(documents)
    char_matrix = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1,
                                  sublinear_tf=True, max_features=50000).fit_transform(documents)
    word_scores = cosine_similarity(word_matrix[0:1], word_matrix[1:]).flatten()
    char_scores = cosine_similarity(char_matrix[0:1], char_matrix[1:]).flatten()
    similarities = (0.8 * word_scores) + (0.2 * char_scores)
    scores = {str(policy["id"]): round(float(score) * 100, 2)
              for policy, score in zip(policies, similarities)}

    # Retrieve relevant scraped text for transparency. It is not used to claim
    # that a fictional/demo policy has a feature unless a source is linked to it.
    knowledge_matches: list[dict[str, Any]] = []
    if pages:
        chunks: list[dict[str, Any]] = []
        for page in pages:
            for chunk in chunk_text(page["text"]):
                chunks.append({**{k: page[k] for k in ("title", "source_url", "provider_domain", "category")}, "text": chunk})
        if chunks:
            corpus = [query] + [item["text"] for item in chunks]
            knowledge_matrix = TfidfVectorizer(ngram_range=(1, 2), min_df=1,
                                               sublinear_tf=True, strip_accents="unicode",
                                               max_features=50000).fit_transform(corpus)
            relevance = cosine_similarity(knowledge_matrix[0:1], knowledge_matrix[1:]).flatten()
            best = sorted(zip(chunks, relevance), key=lambda item: item[1], reverse=True)[:5]
            knowledge_matches = [
                {"title": item["title"], "sourceUrl": item["source_url"],
                 "providerDomain": item["provider_domain"], "category": item["category"],
                 "snippet": item["text"][:360], "relevance": round(float(score) * 100, 2)}
                for item, score in best if score > 0
            ]

    return {
        "scores": scores,
        "engineUsed": "python-sklearn-hybrid-word-char-tfidf",
        "knowledgeMatches": knowledge_matches,
        "scrapedPagesAvailable": len(pages),
        "policyLinkedScrapedPages": mapped_page_count,
    }

