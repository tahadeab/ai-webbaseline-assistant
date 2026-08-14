import React, { useMemo, useState } from 'react'
import axios from 'axios'
import { jsPDF } from 'jspdf'
import './index.css'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '' })

function App() {
  const [inputText, setInputText] = useState('')
  const [documentName, setDocumentName] = useState('')
  const [summary, setSummary] = useState('')
  const [flashcards, setFlashcards] = useState([])
  const [quiz, setQuiz] = useState([])
  const [feature, setFeature] = useState('')
  const [featureInfo, setFeatureInfo] = useState(null)
  const [flipped, setFlipped] = useState({})
  const [revealed, setRevealed] = useState({})
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')

  const wordCount = useMemo(() => inputText.trim() ? inputText.trim().split(/\s+/).length : 0, [inputText])
  const characterCount = inputText.length

  function clearError() { setError('') }
  function requestError(err) { return err?.response?.data?.detail || err?.response?.data?.error || 'Something went wrong. Please try again.' }

  async function handleUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    clearError(); setLoading('upload')
    const form = new FormData(); form.append('file', file)
    try {
      const response = await api.post('/api/upload', form)
      if (response.data.error) throw new Error(response.data.error)
      setInputText(response.data.content || '')
      setDocumentName(response.data.filename || file.name)
      setSummary(''); setFlashcards([]); setQuiz([])
    } catch (err) { setError(err.message || requestError(err)) }
    finally { setLoading(''); event.target.value = '' }
  }

  async function generate(path, payload, onSuccess, key) {
    if (!inputText.trim()) { setError('Add some study material before generating content.'); return }
    clearError(); setLoading(key)
    try { const response = await api.post(path, payload); onSuccess(response.data) }
    catch (err) { setError(requestError(err)) }
    finally { setLoading('') }
  }

  function summarize() { generate('/api/documents/', { content: inputText, title: documentName || 'Study notes' }, data => setSummary(data.summary || ''), 'summary') }
  function createFlashcards() { generate('/api/flashcards', { content: inputText, count: 8 }, data => { setFlashcards(data.flashcards || []); setFlipped({}) }, 'flashcards') }
  function createQuiz() { generate('/api/quiz', { content: inputText, tf_count: 4, mcq_count: 4 }, data => { setQuiz(data.questions || []); setRevealed({}) }, 'quiz') }

  async function lookupFeature(event) {
    event?.preventDefault(); if (!feature.trim()) return
    clearError(); setLoading('feature')
    try { const response = await api.post('/api/feature-info', { feature }); setFeatureInfo(response.data) }
    catch (err) { setError(requestError(err)) }
    finally { setLoading('') }
  }

  function resetWorkspace() {
    setInputText(''); setDocumentName(''); setSummary(''); setFlashcards([]); setQuiz([]); setFeatureInfo(null); setFeature(''); setError('')
  }

  function exportPDF() {
    if (!summary && !flashcards.length && !quiz.length) { setError('Generate at least one result before exporting.'); return }
    const doc = new jsPDF({ unit: 'pt', format: 'a4' }); const margin = 44; const width = 510; let y = margin
    const write = (text, size = 11, gap = 16) => { doc.setFontSize(size); const lines = doc.splitTextToSize(text, width); if (y + lines.length * gap > 780) { doc.addPage(); y = margin }; doc.text(lines, margin, y); y += lines.length * gap + 8 }
    doc.setTextColor(18, 35, 60); write('AI Web Baseline Assistant', 20, 24); write(documentName || 'Study workspace export', 11)
    if (summary) { write('SUMMARY', 14); write(summary) }
    if (flashcards.length) { write('FLASHCARDS', 14); flashcards.forEach((card, i) => write(`${i + 1}. Q: ${card.question}\nA: ${card.answer}`)) }
    if (quiz.length) { write('QUIZ', 14); quiz.forEach((question, i) => write(`${i + 1}. ${question.question}\nOptions: ${(question.options || []).join(', ')}\nAnswer: ${question.answer}`)) }
    doc.save('ai-web-baseline-study-pack.pdf')
  }

  const busy = Boolean(loading)
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">AI</span><div><strong>Web Baseline</strong><span>Assistant</span></div></div>
        <div className="top-actions"><button className="button ghost" onClick={resetWorkspace}>New workspace</button><button className="button primary" onClick={exportPDF}>Export study pack</button></div>
      </header>

      <section className="hero"><div><p className="eyebrow">LEARN · BUILD · SHIP</p><h1>Turn web docs into <em>developer-ready</em> knowledge.</h1><p className="hero-copy">Summarize technical material, build flashcards, test your recall, and check browser Baseline support in one focused workspace.</p></div><div className="hero-stat"><span>Workspace status</span><strong>{wordCount ? 'Ready to study' : 'Waiting for notes'}</strong><small>{wordCount.toLocaleString()} words · {characterCount.toLocaleString()} characters</small></div></section>

      {error && <div className="alert" role="alert"><strong>Action needed:</strong> {error}<button onClick={clearError} aria-label="Dismiss error">×</button></div>}

      <section className="workspace-grid">
        <article className="panel input-panel"><div className="panel-heading"><div><span className="step">01</span><h2>Bring your material</h2></div><span className="format-note">TXT · MD · PDF · DOCX</span></div>
          <label className="upload-zone"><input type="file" accept=".txt,.md,.pdf,.docx" onChange={handleUpload} disabled={busy} /><span className="upload-icon">↑</span><strong>{loading === 'upload' ? 'Reading your file…' : 'Drop a file or browse'}</strong><small>{documentName || 'Up to 10 MB · text is processed locally by the API'}</small></label>
          <div className="divider"><span>or paste notes</span></div><textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Paste an article, documentation page, lecture notes, or code explanation here…" aria-label="Study material" />
          <div className="input-footer"><span>{wordCount.toLocaleString()} words</span><button className="button ghost small" onClick={() => { setInputText(''); setDocumentName('') }} disabled={!inputText}>Clear text</button></div>
          <div className="action-row"><button className="button primary" onClick={summarize} disabled={busy || !inputText.trim()}>{loading === 'summary' ? 'Summarizing…' : 'Create summary'}</button><button className="button secondary" onClick={createFlashcards} disabled={busy || !inputText.trim()}>{loading === 'flashcards' ? 'Creating…' : 'Make flashcards'}</button><button className="button secondary" onClick={createQuiz} disabled={busy || !inputText.trim()}>{loading === 'quiz' ? 'Building…' : 'Build quiz'}</button></div>
        </article>

        <article className="panel baseline-panel"><div className="panel-heading"><div><span className="step">02</span><h2>Explore Web Baseline</h2></div><span className="live-dot">● Sample data</span></div><p className="panel-intro">Check browser support and practical guidance for modern web platform features.</p>
          <form className="feature-search" onSubmit={lookupFeature}><input value={feature} onChange={e => setFeature(e.target.value)} placeholder="Try: CSS Container Queries" aria-label="Web feature" /><button className="button primary" disabled={loading === 'feature'}>{loading === 'feature' ? 'Checking…' : 'Check feature'}</button></form>
          {featureInfo?.error ? <div className="feature-empty"><strong>{featureInfo.error}</strong><p>{featureInfo.suggestions?.length ? `Try ${featureInfo.suggestions.join(', ')}.` : 'Try a feature from the Baseline dataset.'}</p></div> : featureInfo?.feature ? <div className="feature-result"><div className="feature-title"><div><span className="support-badge">Baseline</span><h3>{featureInfo.feature}</h3></div>{featureInfo.mdn_url && <a href={featureInfo.mdn_url} target="_blank" rel="noreferrer">Read MDN ↗</a>}</div><p>{featureInfo.support_summary}</p><div className="quiz-mini"><strong>Quick recall</strong>{featureInfo.quiz?.map((item, i) => <details key={i}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></div> : <div className="feature-empty"><span className="feature-glyph">◈</span><strong>Search the platform</strong><p>Get a concise explanation, support context, and a quick check question.</p></div>}
        </article>
      </section>

      <section className="results-grid"><article className="panel result-panel summary-panel"><div className="result-heading"><div><span className="result-icon">✦</span><h2>Summary</h2></div><span className="result-label">AI GENERATED</span></div>{summary ? <p className="summary-text">{summary}</p> : <EmptyState text="Your focused summary will appear here after you process your material." />}</article>
        <article className="panel result-panel"><div className="result-heading"><div><span className="result-icon">▣</span><h2>Flashcards</h2></div><span className="result-label">{flashcards.length} CARDS</span></div>{flashcards.length ? <div className="cards-grid">{flashcards.map((card, i) => <button className={`study-card ${flipped[i] ? 'flipped' : ''}`} key={`${card.question}-${i}`} onClick={() => setFlipped(prev => ({ ...prev, [i]: !prev[i] }))}><small>CARD {String(i + 1).padStart(2, '0')}</small><strong>{flipped[i] ? card.answer : card.question}</strong><span>{flipped[i] ? 'Click to see question' : 'Click to reveal answer'}</span></button>)}</div> : <EmptyState text="Generate flashcards to practice active recall." />}</article>
        <article className="panel result-panel quiz-panel"><div className="result-heading"><div><span className="result-icon">✓</span><h2>Knowledge check</h2></div><span className="result-label">{quiz.length} QUESTIONS</span></div>{quiz.length ? <div className="questions">{quiz.map((item, i) => <div className="question" key={`${item.question}-${i}`}><strong>{i + 1}. {item.question}</strong>{item.options && <div className="options">{item.options.map(option => <span key={option}>{option}</span>)}</div>}<button className="answer-toggle" onClick={() => setRevealed(prev => ({ ...prev, [i]: !prev[i] }))}>{revealed[i] ? `Answer: ${item.answer}` : 'Reveal answer'}</button></div>)}</div> : <EmptyState text="Build a quiz to verify what you remember." />}</article>
      </section>
      <footer><span>AI Web Baseline Assistant</span><span>Built for developers who learn by doing.</span></footer>
    </main>
  )
}

function EmptyState({ text }) { return <div className="empty-state"><span>⌁</span><p>{text}</p></div> }
createRoot(document.getElementById('root')).render(<App />)
