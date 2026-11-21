# InsureMate

InsureMate keeps its React frontend and Node.js/TypeScript application backend. All NLP and ML processing now runs in the Python service under `ml/`.

## Requirements

- Node.js 22 or newer
- Python 3.10 or newer
- A Gemini API key for entity extraction and assistant replies

## Setup

1. Install the existing frontend/backend dependencies:

   ```bash
   npm install
   ```

2. Create a Python virtual environment and install the ML/NLP dependencies:

   **Windows PowerShell**
   ```powershell
   py -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r ml/requirements.txt
   ```

   **macOS/Linux**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r ml/requirements.txt
   ```

3. Copy `.env.example` to `.env` and set `GEMINI_API_KEY`. Optional additional keys (`GEMINI_API_KEY_2` through `GEMINI_API_KEY_4`) are tried as fallbacks.

4. Train and evaluate the intent classifier:

   ```bash
   python ml/train_intent.py
   ```

   This creates `ml/models/intent_classifier.joblib` and `ml/models/intent_metrics.json`.

5. Start the application:

   ```bash
   npm run dev
   ```

   The Node server starts the Python NLP service automatically on `127.0.0.1:8001`. If your Python executable is not named `python` on Windows or `python3` on macOS/Linux, set `PYTHON_EXECUTABLE` in `.env`.

## Python NLP/ML architecture

- `ml/service.py`: FastAPI service for input normalization, intent classification, Gemini entity extraction, requirement normalization, context merging, conflict/follow-up generation, and semantic matching.
- `ml/train_intent.py`: compares TF-IDF + Logistic Regression, Linear SVM, and Multinomial Naive Bayes using stratified cross-validation, evaluates the selected model on a held-out test split, then refits it on all labelled examples for deployment.
- `ml/data/intent_training.csv`: 249 curated labelled examples across five intents. These include synthetic/curated examples and are not scraped website data.
- `ml/scraper.py`: extracts text from explicitly listed permitted webpages in `ml/urls.txt`.
- `ml/text_cleaner.py`: cleans scraped webpage text and writes JSONL records.
- `ml/pdf_extractor.py`: extracts text from policy PDFs placed in `ml/scraped_data/pdfs/`.
- `ml/scraped_data/`: raw and cleaned scraped data.

The intent classifier is a genuine locally trained ML model. The current dataset contains 249 curated examples. The latest internal holdout evaluation achieved 86% accuracy (50 test examples); this is a development estimate, not a production guarantee, because the dataset is small and includes synthetic/curated examples. Add reviewed real user utterances and maintain an external test set before treating it as production-ready. The weaker intent remains `resolve_conflict`, so collect real examples that distinguish trade-offs/compromises from ordinary constraint updates. Gemini is a separately pretrained external model used for entity extraction and natural-language responses; this project does not fine-tune Gemini. The trained intent classifier still determines the intent passed into extraction.

Semantic policy matching uses scikit-learn TF-IDF vectors and cosine similarity, calculated against the policy records supplied by the existing SQLite database. It is not a neural embedding model.

## Collect insurance website text

1. Check the website's terms, copyright conditions, and `robots.txt`.
2. Add specific allowed page URLs to `ml/urls.txt` (one URL per line).
3. Run:

   ```bash
   python ml/scraper.py
   python ml/text_cleaner.py
   ```

4. Cleaned page records are written to `ml/scraped_data/cleaned/insurance_dataset.jsonl` with source URLs and collection timestamps.

Scraped pages are a knowledge corpus. They are not automatically labelled training examples. Label sentences separately before using them to train a supervised NLP model.

## Environment variables

- `GEMINI_API_KEY`: required for Gemini entity extraction.
- `GEMINI_API_KEY_2` through `GEMINI_API_KEY_4`: optional additional keys tried as quota/model fallbacks.
- `GEMINI_MODEL`: optional preferred model (defaults to `gemini-3.5-flash-lite`, then falls back to `gemini-3.6-flash`).
- `PORT`: Node application port (defaults to `3000`).
- `PYTHON_NLP_PORT`: Python service port (defaults to `8001`).
- `PYTHON_EXECUTABLE`: optional Python executable override.

The natural-language analysis endpoint is limited to 10 requests per IP per minute. Gemini requests also try each configured key against the preferred model and then the fallback model list.

## Scraped insurance knowledge in recommendations

The Python semantic endpoint now uses a hybrid word/character TF-IDF representation for policy matching and retrieves relevant passages from the cleaned scraped corpus. The recommendation response includes the top retrieved source passages so they can be inspected in the Recommendations page.

1. Add permitted URLs to `ml/urls.txt`. Use `health|https://...`, `car|https://...`, `life|https://...`, or `travel|https://...` to label each page.
2. Run `python ml/scraper.py`.
3. Run `python ml/text_cleaner.py`.
4. Generate recommendations again. The page will show retrieved passages and source links.
5. To let scraped content contribute to a particular policy's semantic score, link the exact official product-page URL to that policy ID in `ml/policy_sources.json`. Only map pages that describe that exact product. Do not map generic insurer pages or competitor policies to a demo policy.

The current 18 catalog records are demonstration policies and have no official product URLs. Therefore scraped passages are displayed as supporting knowledge, but are not falsely treated as verified features of those demonstration plans. For policy-specific scraped influence, first add real policy records with their official product URLs or explicitly map verified sources. The Python retrieval layer does not invent coverage, waiting periods, premiums, or exclusions from general insurer pages.

Recommendation weights were adjusted to: requirement fit 50%, semantic similarity 20%, coverage fit 15%, and budget fit 15%. Mandatory unmet requirements and eligibility remain sorting/eligibility priorities. The semantic score uses the actual Python-computed score (no fixed default score when missing).
