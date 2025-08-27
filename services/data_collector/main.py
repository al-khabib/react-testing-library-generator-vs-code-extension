# services/data-collector/main.py
from fastapi import FastAPI
import json
from datetime import datetime
import os

app = FastAPI(title="Fine-tuning Data Collector")

TRAINING_DATA_PATH = "training_data/rtl_tests.jsonl"


@app.post("/collect/feedback")
async def collect_feedback(data: dict):
    """Collect user feedback on generated tests"""
    training_example = {
        "instruction": f"Generate React Testing Library tests for this component:\n{data['componentSource']}",
        "output": data['acceptedTest'],  # User-approved test
        "context": data.get('context', {}),
        "timestamp": datetime.now().isoformat(),
        "quality_score": data.get('rating', 5)
    }

    # Append to training dataset
    os.makedirs(os.path.dirname(TRAINING_DATA_PATH), exist_ok=True)
    with open(TRAINING_DATA_PATH, "a") as f:
        f.write(json.dumps(training_example) + "\n")

    return {"status": "collected"}
