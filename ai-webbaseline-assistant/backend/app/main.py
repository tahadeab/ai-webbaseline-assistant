from fastapi import FastAPI, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
from pathlib import Path
import logging
from typing import List, Optional
import os
import re
import random
import requests
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# Lightweight NLP without heavy external services
try:
    from transformers import pipeline  # optional; app works without it
except Exception:  # pragma: no cover
    pipeline = None

app = FastAPI(title="AI Study Assistant")

# CORS for local dev (Vite default port 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("uvicorn.error")

BASELINE_FILE = Path(__file__).resolve().parents[1] / 'baseline_data' / 'baseline_features_sample.json'
UPLOAD_DIR = Path(__file__).resolve().parents[1] / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

# Lazy-load summarization pipeline (t5-small for lighter footprint)
_summarizer = None
def get_summarizer():
    global _summarizer
    if _summarizer is None and pipeline is not None:
        try:
            _summarizer = pipeline("summarization", model="t5-small", tokenizer="t5-small")
        except Exception as e:
            logger.error(f"Failed to load summarization model: {e}")
            _summarizer = None
    return _summarizer

def summarize_via_hf_api(text: str, max_length: int = 200) -> Optional[str]:
    token = os.getenv("HUGGINGFACE_API_TOKEN")
    model = os.getenv("HUGGINGFACE_MODEL", "facebook/bart-large-cnn")
    if not token:
        return None
    try:
        headers = {"Authorization": f"Bearer {token}"}
        payload = {"inputs": text, "parameters": {"max_length": max_length, "min_length": 30, "do_sample": False}}
        url = f"https://api-inference.huggingface.co/models/{model}"
        r = requests.post(url, headers=headers, json=payload, timeout=60)
        r.raise_for_status()
        data = r.json()
        # API returns list of dicts with 'summary_text'
        if isinstance(data, list) and data and 'summary_text' in data[0]:
            return data[0]['summary_text']
        # Some models return 'generated_text'
        if isinstance(data, list) and data and 'generated_text' in data[0]:
            return data[0]['generated_text']
    except Exception as e:
        logger.warning(f"HF summarization failed: {e}")
    return None

class DocumentIn(BaseModel):
    content: str
    title: str = "Untitled"
    max_length: int = 200

class FeatureQuery(BaseModel):
    feature: str

class Flashcard(BaseModel):
    question: str
    answer: str

class QuizQuestion(BaseModel):
    type: str  # "tf" or "mcq"
    question: str
    options: Optional[List[str]] = None
    answer: str

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.post("/api/documents/")
async def create_document(payload: DocumentIn):
    text = (payload.content or "").strip()
    if not text:
        return {"error": "empty content"}
    # Try HF API first, then local model, then naive
    try:
        summary = summarize_via_hf_api(text, max_length=min(256, payload.max_length))
        if not summary:
            summarizer = get_summarizer()
            if summarizer is not None:
                summary_chunks = summarizer(text, max_length=min(256, payload.max_length), min_length=30, do_sample=False)
                summary = summary_chunks[0]['summary_text']
            else:
                raise RuntimeError("summarizer unavailable")
    except Exception as e:
        logger.warning(f"Summarization fallback due to: {e}")
        # Naive summary by sentences
        sentences = [s.strip() for s in text.replace("\n", " ").split('.') if s.strip()]
        summary = '. '.join(sentences[:2]) + ('.' if sentences else '')
    return {"title": payload.title, "content": payload.content, "summary": summary}

@app.post("/api/feature-info")
async def feature_info(q: FeatureQuery):
    try:
        data = json.loads(BASELINE_FILE.read_text(encoding='utf-8'))
    except Exception as e:
        logger.error(f"Failed reading baseline file: {e}")
        return {"error": "baseline data not found"}
    for f in data.get("features", []):
        if f.get("name", "").lower() == q.feature.lower():
            lines = f.get("summary", "").split('.')
            quiz = []
            for l in lines[:3]:
                if l.strip():
                    quiz.append({"question": f"What is a key point about {f.get('name') }?", "answer": l.strip()})
            return {
                "feature": f.get("name"),
                "support_summary": f.get("summary"),
                "quiz": quiz,
                "support": f.get("support"),
                "mdn_url": f.get("mdn_url")
            }
    return {"error": "feature not found"}

# Flashcards endpoint
class FlashcardsIn(BaseModel):
    content: str
    count: int = 5

@app.post("/api/flashcards")
async def generate_flashcards(payload: FlashcardsIn):
    text = (payload.content or "").strip()
    if not text:
        return {"flashcards": []}
    sentences = [s.strip() for s in text.replace("\n", " ").split('.') if s.strip()]
    cards: List[Flashcard] = []
    for s in sentences[: max(1, payload.count)]:
        # Simple heuristic: create Q/A from sentence
        q = f"What is the key idea?"
        a = s
        cards.append(Flashcard(question=q, answer=a))
    return {"flashcards": [c.dict() for c in cards]}

# Quiz endpoint (TF + improved MCQ)
class QuizIn(BaseModel):
    content: str
    tf_count: int = 3
    mcq_count: int = 2

@app.post("/api/quiz")
async def generate_quiz(payload: QuizIn):
    text = (payload.content or "").strip()
    if not text:
        return {"questions": []}
    sentences = [s.strip() for s in re.split(r"[\.\!\?]", text.replace("\n", " ")) if s.strip()]
    questions: List[QuizQuestion] = []
    # True/False
    for s in sentences[: payload.tf_count]:
        questions.append(QuizQuestion(type="tf", question=f"True or False: {s}", answer="True"))
    # Improved MCQ: pick keywords (longer words, capitalized or frequent), mask them, choose distractors from corpus
    words_all = re.findall(r"[A-Za-z\u0600-\u06FF]+", text)  # support English/Arabic letters
    freq = {}
    for w in words_all:
        key = w.lower()
        if len(key) >= 5:
            freq[key] = freq.get(key, 0) + 1
    # candidate keywords sorted by frequency and length
    candidates = sorted(freq.keys(), key=lambda k: (freq[k], len(k)), reverse=True)
    # Build pool for distractors (unique words similar length)
    unique_pool = list({w.lower() for w in words_all if len(w) >= 4})
    random.shuffle(unique_pool)
    mcq_generated = 0
    for s in sentences:
        if mcq_generated >= payload.mcq_count:
            break
        tokens = re.findall(r"\w+|\W+", s)
        # find first candidate present in sentence
        target = None
        for c in candidates:
            if re.search(rf"\b{re.escape(c)}\b", s, flags=re.IGNORECASE):
                target = c
                break
        if not target:
            # fallback to a mid token
            words = [t for t in tokens if re.match(r"\w+", t)]
            if len(words) > 6:
                target = words[len(words)//2].lower()
            else:
                continue
        answer = target
        # mask in sentence
        masked = re.sub(rf"\b{re.escape(target)}\b", "____", s, flags=re.IGNORECASE)
        # pick distractors of similar length and not equal to answer
        distractors = [w for w in unique_pool if w != answer and abs(len(w) - len(answer)) <= 2]
        distractors = distractors[:10]
        if answer in distractors:
            distractors.remove(answer)
        # ensure 3 distractors
        while len(distractors) < 3 and unique_pool:
            cand = unique_pool.pop()
            if cand != answer:
                distractors.append(cand)
        options = list({answer, *distractors[:3]})
        random.shuffle(options)
        questions.append(QuizQuestion(type="mcq", question=masked, options=options, answer=answer))
        mcq_generated += 1
    return {"questions": [q.dict() for q in questions]}

# File upload (txt, pdf, docx)
def _read_txt(path: Path) -> str:
    try:
        return path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        return path.read_text(errors='ignore')

def _read_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        text = []
        for page in reader.pages:
            text.append(page.extract_text() or "")
        return "\n".join(text)
    except Exception as e:
        logger.error(f"PDF parse error: {e}")
        return ""

def _read_docx(path: Path) -> str:
    try:
        import docx
        doc = docx.Document(str(path))
        return "\n".join([p.text for p in doc.paragraphs])
    except Exception as e:
        logger.error(f"DOCX parse error: {e}")
        return ""

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix.lower()
    temp_path = UPLOAD_DIR / file.filename
    with temp_path.open("wb") as f:
        f.write(await file.read())
    if suffix in (".txt", ".md"):
        content = _read_txt(temp_path)
    elif suffix in (".pdf",):
        content = _read_pdf(temp_path)
    elif suffix in (".docx",):
        content = _read_docx(temp_path)
    else:
        return {"error": "unsupported file type"}
    return {"filename": file.filename, "content": content[:100000]}
