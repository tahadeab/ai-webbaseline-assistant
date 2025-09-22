# AI Study Assistant + Web Baseline Integrations

An AI-powered study helper that integrates Web Baseline feature data to help developers and students:
- Summarize articles/notes.
- Generate flashcards.
- Create quick quizzes (True/False and MCQ).
- Explore modern web features (Baseline) with quick info, MDN links, and a mini-quiz.

This project aligns with the hackathon theme: it integrates Baseline data about web features with a developer tool (a web app) to make it easier for web developers to adopt modern web features.

## Live Demo (hosted URL)
- Live URL: https://your-domain-or-netlify-url.example (replace when deployed)

## Repository
- Public Repo: https://github.com/tahadeab/ai-webbaseline-assistant 

## Features
- Summarization via three-tier fallback: Hugging Face Inference API (optional) → local Transformers (optional) → simple sentence-based summary.
- File upload and parsing: TXT, PDF (pypdf), DOCX (python-docx).
- Flashcards generation + interactive Flip Cards study mode.
- Quiz generation with improved MCQs (keyword masking and smarter distractors) + True/False.
- Baseline feature lookup with sample dataset (MDN URL, support summary, quick quiz).
- Export results to PDF (summary, flashcards, quiz).
- Modern UI: React + Vite + TailwindCSS.

## Tech Stack
- Frontend: React 18, Vite, TailwindCSS, jsPDF.
- Backend: FastAPI, Uvicorn.
- NLP (optional): Hugging Face Inference API (via `HUGGINGFACE_API_TOKEN`), or local `transformers`.
- Parsing: pypdf, python-docx.

## Architecture
```
frontend/ (Vite + React + Tailwind)
  src/main.jsx (UI, Flip Cards, PDF export)
  src/index.css (Tailwind styles)

backend/ (FastAPI)
  app/main.py (REST APIs: summarize, flashcards, quiz, upload, feature-info)
  baseline_data/baseline_features_sample.json (sample Baseline data)
  uploads/ (uploaded files)
```

## Getting Started (Local, Windows-friendly)
Prereqs: Python 3.11+, Node.js 18+.

1) Backend
```
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Optional: better local summarization (large install)
# pip install transformers

# Optional: enable Hugging Face Inference API
# copy .env.example to .env and set your token/model
# HUGGINGFACE_API_TOKEN=hf_...
# HUGGINGFACE_MODEL=facebook/bart-large-cnn

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

2) Frontend
```
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

3) Docker (optional)
```
docker compose up --build
```

## Environment Variables (backend/.env)
```
HUGGINGFACE_API_TOKEN=hf_xxx            # optional; enables cloud summarization
HUGGINGFACE_MODEL=facebook/bart-large-cnn
```

## API Endpoints (backend)
- `POST /api/upload` → multipart file → `{ filename, content }`.
- `POST /api/documents/` → `{ content, title?, max_length? }` → `{ summary }`.
- `POST /api/flashcards` → `{ content, count? }` → `{ flashcards: [{question, answer}] }`.
- `POST /api/quiz` → `{ content, tf_count?, mcq_count? }` → `{ questions: [...] }`.
- `POST /api/feature-info` → `{ feature }` → Baseline info + quick quiz.
- `GET /api/health` → health check.

## Submission Checklist (Hackathon)
1. URL to hosted Project: add your live URL in this README (see Live Demo section).
2. Comprehensive description: see Features, Tech Stack, Architecture, and API sections above.
3. Answer submission questions: include additional Q&A in this README or on the submission portal.
4. Public repo URL: add your GitHub link in the Repository section.
5. Permissive Open-Source License: this repo includes `LICENSE` (MIT).
6. Demo video (>3 minutes): add link here once recorded.
   - Demo Video: https://your-video-link.example (replace)

## How It Helps Developers Adopt Modern Web Features
- Integrates Baseline features data into a study/workflow tool, allowing developers to quickly check support, read summaries, and self-test.
- Encourages practical adoption by embedding learning (summary/flashcards/quiz) right alongside Baseline exploration.

## Contributing
PRs and issues are welcome. Please open a discussion for significant changes.

## License
This project is released under the MIT License. See `LICENSE`.

---

## Project Story

### Inspiration
We wanted to make adopting modern web features easier while also helping students and developers learn faster. By blending Web Baseline data with an AI study workflow (summary → flashcards → quiz), the app encourages hands-on learning right where the developer works. We took inspiration from:

- The friction developers face when checking browser support and MDN while planning features.
- Study techniques like spaced repetition and self-testing. A simplified retention idea is often modeled as:

  $$ R(t) = e^{-\tfrac{t}{\lambda}} $$

  where $R(t)$ is retention over time $t$, and $\lambda$ controls the forgetting rate. Our flip-card and quiz flow is designed to counteract this decay by quick, repeated recall.

### How We Built It
- Backend (`backend/app/main.py`):
  - FastAPI endpoints for summarization (`/api/documents/`), flashcards (`/api/flashcards`), quizzes (`/api/quiz`), uploads (`/api/upload`), and Baseline feature info (`/api/feature-info`).
  - Summarization pipeline with three layers: Hugging Face Inference API (optional) → local `transformers` (optional) → naive fallback.
  - File parsing using `pypdf` and `python-docx`.
  - CORS + simple health check.
- Frontend (`frontend/src/main.jsx`):
  - React + Vite + TailwindCSS UI for upload, summarize, flashcards, and quizzes.
  - Flip Cards study mode (click to reveal answer/question).
  - Export results to PDF via `jspdf`.
- Baseline Data: `backend/baseline_data/baseline_features_sample.json` used to demonstrate feature lookups with MDN link and a mini-quiz.

### What We Learned
- How to structure multi-tier AI fallbacks that gracefully degrade when external APIs or large models aren’t available.
- Practical TailwindCSS setup with Vite and handling editor lint false-positives for `@tailwind`/`@apply` while the build pipeline compiles correctly.
- Designing simple but effective heuristics for MCQ generation—keyword masking, distractor selection by frequency/length—and understanding their trade-offs.
- Dockerizing a full-stack app for local dev parity.

### Challenges
- Balancing accuracy vs. performance for summarization without requiring heavyweight installs for all users.
- Handling diverse document formats (txt/pdf/docx) robustly, especially PDFs with complex layouts.
- Creating meaningful MCQs from arbitrary text—noisy inputs and domain vocabulary can degrade distractor quality.
- Ensuring the UI stays simple yet covers the full flow (upload → summarize → flashcards → quiz → export).

### Future Work
- Stronger quiz generation (NER, keyword extraction, and syntax-aware blanks) and adaptive difficulty.
- True spaced-repetition scheduling, e.g., Leitner boxes, with persistence (SQLite/Firebase) and progress analytics.
- Real Baseline API/data feed with live updates and per-feature deep-dives.
- Authentication + personal libraries of notes, decks, and quizzes.
- One-click deploy templates (Netlify + Render) and Chrome Extension for in-page summarization.
