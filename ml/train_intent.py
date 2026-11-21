from pathlib import Path
import json
import pandas as pd
from joblib import dump
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.naive_bayes import MultinomialNB
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "intent_training.csv"
MODEL_DIR = ROOT / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)


def build_candidates():
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 3),
        lowercase=True,
        strip_accents="unicode",
        sublinear_tf=True,
        min_df=1,
        max_df=0.98
    )
    return {
        "logistic_regression": Pipeline([
            ("tfidf", vectorizer),
            ("classifier", LogisticRegression(max_iter=3000, class_weight="balanced", C=2.0))
        ]),
        "linear_svm": Pipeline([
            ("tfidf", vectorizer),
            ("classifier", LinearSVC(class_weight="balanced", C=1.0))
        ]),
        "multinomial_naive_bayes": Pipeline([
            ("tfidf", vectorizer),
            ("classifier", MultinomialNB(alpha=0.3))
        ])
    }


def main():
    data = pd.read_csv(DATA).dropna(subset=["text", "intent"])
    data["text"] = data["text"].astype(str).str.strip()
    data["intent"] = data["intent"].astype(str).str.strip()
    data = data[data["text"] != ""].drop_duplicates(subset=["text", "intent"])

    x_train, x_test, y_train, y_test = train_test_split(
        data["text"], data["intent"], test_size=0.20,
        random_state=42, stratify=data["intent"]
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    candidates = build_candidates()
    comparisons = {}
    for name, candidate in candidates.items():
        scores = cross_val_score(candidate, x_train, y_train, cv=cv, scoring="f1_macro", n_jobs=-1)
        comparisons[name] = {
            "cv_macro_f1_mean": float(scores.mean()),
            "cv_macro_f1_std": float(scores.std()),
            "fold_scores": [float(v) for v in scores]
        }

    best_name = max(comparisons, key=lambda name: comparisons[name]["cv_macro_f1_mean"])
    best_model = candidates[best_name]
    best_model.fit(x_train, y_train)
    predictions = best_model.predict(x_test)

    metrics = {
        "selected_model": best_name,
        "model_selection_metric": "5-fold stratified cross-validation macro F1 on training split",
        "model_comparison": comparisons,
        "holdout_accuracy": float(accuracy_score(y_test, predictions)),
        "holdout_classification_report": classification_report(
            y_test, predictions, output_dict=True, zero_division=0
        ),
        "holdout_confusion_matrix": confusion_matrix(
            y_test, predictions, labels=sorted(data["intent"].unique())
        ).tolist(),
        "confusion_matrix_labels": sorted(data["intent"].unique().tolist()),
        "training_rows": int(len(x_train)),
        "testing_rows": int(len(x_test)),
        "total_rows": int(len(data)),
        "class_counts": {str(k): int(v) for k, v in data["intent"].value_counts().items()},
        "classes": sorted(data["intent"].unique().tolist()),
        "note": "Synthetic/curated examples are included. Holdout metrics are an internal development estimate, not a production accuracy guarantee. Validate with unseen real user conversations before deployment."
    }

    # Refit the selected configuration on all labelled examples for deployment.
    # The holdout metrics above are computed before this final refit.
    best_model.fit(data["text"], data["intent"])
    metrics["deployment_training_rows"] = int(len(data))
    dump(best_model, MODEL_DIR / "intent_classifier.joblib")
    (MODEL_DIR / "intent_metrics.json").write_text(json.dumps(metrics, indent=2))
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
