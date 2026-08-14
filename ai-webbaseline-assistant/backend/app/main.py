from __future__ import annotations

import json
import logging
import os
import random
import re
import uuid
from pathlib import Path
from typing import List, Optional

import requests
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover
    pass

try:
    from transformers import pipeline
except Exception:  # pragma: no cover
    pipeline = None

logger = logging.getLogger("uvicorn.error")

app = FastAPI(
    title="AI Web Baseline Assistant API",
    version="1.0.0",
    description="Study tools and Baseline feature discovery for modern web developers.",
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

BASELINE_FILE = Path(__file__).resolve().parents[1] / "baseline_data" / "baseline_features_sample.json"
UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_CONTENT_CHARS = 100_000

_summarizer = None


def get_baseline_data() -> dict:
    try:
        return json.loads(BASELINE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.error("Unable to read Baseline data: %s", exc)
        return {"features": []}


def split_sentences(text: str) -> List[str]:
    return [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", text.replace("\r", " "))
        if sentence.strip()
    ]


def get_summarizer():
    global _summarizer
    if _summarizer is None and pipeline is not None:
        try:
            _summarizer = pipeline("summarization", model="t5-small", tokenizer="t5-small")
        except Exception as exc:  # pragma: no cover
            logger.warning("Local summarizer unavailable: %s", exc)
            _summarizer = False
    return _summarizer if _summarizer is not False else None


def summarize_via_hf_api(text: str, max_length: int) -> Optional[str]:
    token = os.getenv("HUGGINGFACE_API_TOKEN")
    model = os.getenv("HUGGINGFACE_MODEL", "facebook/bart-large-cnn")
    if not token:
        return None
    try:
        response = requests.post(
            f"https://api-inference.huggingface.co/models/{model}",
            headers={"Authorization": f"Bearer {token}"},
            json={"inputs": text, "parameters": {"max_length": max_length, "min_length": 20, "do_sample": False}},
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        if isinstance(data, list) and data:
            return data[0].get("summary_text") or data[0].get("generated_text")
    except (requests.RequestException, ValueError, KeyError) as exc:
        logger.warning("Cloud summarization failed: %s", exc)
    return None


class DocumentIn(BaseModel):
    content: str = Field(min_length=1, max_length=MAX_CONTENT_CHARS)
    title: str = Field(default="Untitled", max_length=200)
    max_length: int = Field(default=200, ge=40, le=500)


class FeatureQuery(BaseModel):
    feature: str = Field(min_length=1, max_length=120)


class FlashcardsIn(BaseModel):
    content: str = Field(min_length=1, max_length=MAX_CONTENT_CHARS)
    count: int = Field(default=6, ge=1, le=20)


class QuizIn(BaseModel):
    content: str = Field(min_length=1, max_length=MAX_CONTENT_CHARS)
    tf_count: int = Field(default=3, ge=0, le=10)
    mcq_count: int = Field(default=3, ge=0, le=10)


class Flashcard(BaseModel):
    question: str
    answer: str


class QuizQuestion(BaseModel):
    type: str
    question: str
    options: Optional[List[str]] = None
    answer: str


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "ai-webbaseline-assistant", "version": app.version}


@app.get("/api/features")
async def list_features():
    features = get_baseline_data().get("features", [])
    return {"features": [{"name": item.get("name"), "mdn_url": item.get("mdn_url")} for item in features]}


@app.post("/api/documents/")
async def create_document(payload: DocumentIn):
    text = payload.content.strip()
    summary = summarize_via_hf_api(text, payload.max_length)
    if not summary:
        summarizer = get_summarizer()
        if summarizer is not None:
            try:
                result = summarizer(text[:12_000], max_length=payload.max_length, min_length=20, do_sample=False)
                summary = result[0]["summary_text"]
            except Exception as exc:  # pragma: no cover
                logger.warning("Local summarization failed: %s", exc)
    if not summary:
        sentences = split_sentences(text)
        summary = " ".join(sentences[:3])[:2_000]
    return {"title": payload.title, "summary": summary, "word_count": len(text.split())}


@app.post("/api/feature-info")
async def feature_info(query: FeatureQuery):
    requested = query.feature.strip().lower()
    features = get_baseline_data().get("features", [])
    exact = next((item for item in features if item.get("name", "").lower() == requested), None)
    match = exact or next((item for item in features if requested in item.get("name", "").lower()), None)
    if not match:
        suggestions = [item.get("name") for item in features if any(word in item.get("name", "").lower() for word in requested.split())]
        return {"error": "Feature not found", "suggestions": suggestions[:5]}
    quiz = [
        {"question": f"What should a developer remember about {match.get('name')}?", "answer": sentence}
        for sentence in split_sentences(match.get("summary", ""))[:3]
    ]
    return {
        "feature": match.get("name"),
        "support_summary": match.get("summary", ""),
        "support": match.get("support", {}),
        "mdn_url": match.get("mdn_url"),
        "quiz": quiz,
    }


@app.post("/api/flashcards")
async def generate_flashcards(payload: FlashcardsIn):
    sentences = split_sentences(payload.content.strip())
    cards = [
        Flashcard(question=f"What is the key idea in this statement?", answer=sentence)
        for sentence in sentences[: payload.count]
    ]
    return {"flashcards": [card.model_dump() for card in cards]}


@app.post("/api/quiz")
async def generate_quiz(payload: QuizIn):
    text = payload.content.strip()
    sentences = split_sentences(text)
    questions: List[QuizQuestion] = []
    for sentence in sentences[: payload.tf_count]:
        questions.append(QuizQuestion(type="tf", question=sentence, options=["True", "False"], answer="True"))

    words = re.findall(r"[A-Za-z][A-Za-z-]{3,}", text)
    frequencies = {word.lower(): sum(1 for item in words if item.lower() == word.lower()) for word in words}
    candidates = sorted(set(frequencies), key=lambda item: (frequencies[item], len(item)), reverse=True)
    pool = list(set(word.lower() for word in words))
    random.shuffle(pool)
    generated = 0
    for sentence in sentences:
        if generated >= payload.mcq_count:
            break
        target = next((word for word in candidates if re.search(rf"\b{re.escape(word)}\b", sentence, re.I)), None)
        if not target:
            continue
        masked = re.sub(rf"\b{re.escape(target)}\b", "____", sentence, flags=re.I)
        distractors = [word for word in pool if word != target and abs(len(word) - len(target)) <= 3][:3]
        options = list(dict.fromkeys([target, *distractors]))
        if len(options) < 2:
            continue
        random.shuffle(options)
        questions.append(QuizQuestion(type="mcq", question=masked, options=options, answer=target))
        generated += 1
    return {"questions": [question.model_dump() for question in questions]}


def _read_txt(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def _read_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
        return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
    except Exception as exc:
        logger.warning("PDF parsing failed: %s", exc)
        return ""


def _read_docx(path: Path) -> str:
    try:
        import docx
        return "\n".join(paragraph.text for paragraph in docx.Document(str(path)).paragraphs)
    except Exception as exc:
        logger.warning("DOCX parsing failed: %s", exc)
        return ""


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    filename = Path(file.filename or "document.txt").name
    suffix = Path(filename).suffix.lower()
    if suffix not in {".txt", ".md", ".pdf", ".docx"}:
        return {"error": "Unsupported file type. Use TXT, Markdown, PDF, or DOCX."}
    content_bytes = await file.read()
    if len(content_bytes) > MAX_UPLOAD_BYTES:
        return {"error": "File is too large. Maximum size is 10 MB."}
    temporary_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    temporary_path.write_bytes(content_bytes)
    try:
        if suffix in {".txt", ".md"}:
            content = _read_txt(temporary_path)
        elif suffix == ".pdf":
            content = _read_pdf(temporary_path)
        else:
            content = _read_docx(temporary_path)
    finally:
        temporary_path.unlink(missing_ok=True)
    return {"filename": filename, "content": content[:MAX_CONTENT_CHARS], "word_count": len(content.split())}
