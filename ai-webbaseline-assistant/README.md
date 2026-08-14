# AI Web Baseline Assistant

AI Web Baseline Assistant is a developer-focused study workspace that turns technical notes into practical learning assets. It combines document summarization, active-recall flashcards, knowledge-check quizzes, and Web Baseline feature discovery in one focused interface.

## Why this project exists

Modern web development moves quickly, and developers often need to understand both the concept and its browser support before shipping a feature. This application closes that gap by connecting a study workflow with Web Baseline research: read or upload material, generate a compact study pack, and verify platform support through a searchable feature panel.

## Core capabilities

| Capability | Description |
| --- | --- |
| Document intake | Paste notes or upload TXT, Markdown, PDF, and DOCX files. Files are limited to 10 MB and parsed by the FastAPI backend. |
| Smart summaries | Uses the optional Hugging Face API first, then an optional local transformer, and finally a reliable sentence-based fallback. |
| Flashcards | Generates active-recall cards with a click-to-flip study mode. |
| Knowledge checks | Creates True/False and multiple-choice questions, with answers hidden until revealed. |
| Web Baseline explorer | Searches the included Baseline dataset, provides support context, an MDN link, and quick recall questions. |
| Study pack export | Exports generated summaries, flashcards, and quizzes into a PDF. |
| Responsive interface | English-first UI with keyboard-friendly controls, clear empty states, error feedback, and responsive layouts. |

## Architecture

```text
ai-webbaseline-assistant/
├── backend/
│   ├── app/main.py                 # FastAPI application and API routes
│   ├── baseline_data/              # Baseline feature dataset
│   ├── requirements.txt            # Reproducible Python dependencies
│   └── uploads/                    # Temporary upload directory
├── frontend/
│   ├── src/main.jsx                # React application and interaction logic
│   ├── src/index.css               # Design system and responsive styles
│   ├── index.html                  # Metadata and application shell
│   └── package.json                # Frontend scripts and dependencies
├── docker-compose.yml
└── README.md
```

## Quick start

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Vite proxies API calls to the same origin when deployed behind a reverse proxy; for a separate backend, set `VITE_API_URL` before starting the frontend.

### Docker

```bash
docker compose up --build
```

## Optional AI configuration

The application works without external model credentials. To enable cloud summarization, create `backend/.env`:

```env
HUGGINGFACE_API_TOKEN=hf_your_token
HUGGINGFACE_MODEL=facebook/bart-large-cnn
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

The service degrades gracefully to local or heuristic summarization if the optional service is unavailable.

## API reference

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service status and version. |
| `GET` | `/api/features` | List available Baseline feature names. |
| `POST` | `/api/upload` | Parse a TXT, MD, PDF, or DOCX file. |
| `POST` | `/api/documents/` | Generate a summary from text. |
| `POST` | `/api/flashcards` | Generate flashcards from text. |
| `POST` | `/api/quiz` | Generate True/False and MCQ questions. |
| `POST` | `/api/feature-info` | Find a Baseline feature and return guidance. |

Interactive API documentation is available at `http://localhost:8000/docs` while the backend is running.

## Verification

The current version has been verified with the following checks:

```text
Frontend production build: PASS
Python syntax compilation: PASS
Health endpoint: PASS
Summary endpoint: PASS
Flashcards endpoint: PASS
Quiz endpoint: PASS
Baseline feature endpoint: PASS
```

## Product and engineering improvements

This release replaces the MVP interface with an English, responsive workspace; fixes missing runtime imports and backend dependency declarations; adds bounded input validation, safe temporary filenames, upload-size limits, automatic cleanup, configurable CORS, feature suggestions, clear API errors, hidden quiz answers, word and character counts, reset controls, and improved PDF export. The code now keeps the frontend interaction model in one readable entry point and the backend API in one documented service module, making the next refactor into feature modules straightforward.

## License

This project is released under the MIT License. See [LICENSE](LICENSE).

## Repository

[github.com/tahadeab/ai-webbaseline-assistant](https://github.com/tahadeab/ai-webbaseline-assistant)
