import React from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import { jsPDF } from 'jspdf'
import './index.css'

function App(){
  const [feature, setFeature] = React.useState('')
  const [inputText, setInputText] = React.useState('')
  const [summary, setSummary] = React.useState(null)
  const [featureInfo, setFeatureInfo] = React.useState(null)
  const [flashcards, setFlashcards] = React.useState([])
  const [quiz, setQuiz] = React.useState([])
  const [studyMode, setStudyMode] = React.useState(false)
  const [flipped, setFlipped] = React.useState({})
  const [loading, setLoading] = React.useState(false)
  const [uploadName, setUploadName] = React.useState('')

  async function handleUpload(e){
    const file = e.target.files?.[0]
    if(!file) return
    const form = new FormData()
    form.append('file', file)
    setLoading(true)
    try{
      const res = await axios.post('/api/upload', form, { headers: { 'Content-Type': 'multipart/form-data' }})
      if(res.data?.content){
        setInputText(res.data.content)
        setUploadName(res.data.filename || file.name)
      }
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  async function doSummarize(){
    if(!inputText.trim()) return
    setLoading(true)
    try{
      const res = await axios.post('/api/documents/', { content: inputText, title: uploadName || 'Input' })
      setSummary(res.data?.summary || '')
    } finally { setLoading(false) }
  }

  async function doFeature(){
    if(!feature.trim()) return
    setLoading(true)
    try{
      const res = await axios.post('/api/feature-info', { feature })
      setFeatureInfo(res.data)
    } finally { setLoading(false) }
  }

  async function doFlashcards(){
    if(!inputText.trim()) return
    setLoading(true)
    try{
      const res = await axios.post('/api/flashcards', { content: inputText, count: 6 })
      setFlashcards(res.data?.flashcards || [])
      setFlipped({})
    } finally { setLoading(false) }
  }

  async function doQuiz(){
    if(!inputText.trim()) return
    setLoading(true)
    try{
      const res = await axios.post('/api/quiz', { content: inputText, tf_count: 3, mcq_count: 3 })
      setQuiz(res.data?.questions || [])
    } finally { setLoading(false) }
  }

  function exportPDF(){
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const margin = 40
    let y = margin
    doc.setFontSize(16)
    doc.text('AI Study Assistant - Export', margin, y)
    y += 24
    doc.setFontSize(12)
    if(summary){
      doc.text('Summary:', margin, y)
      y += 16
      const lines = doc.splitTextToSize(summary, 520)
      doc.text(lines, margin, y)
      y += lines.length * 14 + 12
    }
    if(flashcards?.length){
      doc.text('Flashcards:', margin, y); y += 16
      flashcards.forEach((c, i) => {
        const q = `Q${i+1}: ${c.question}`
        const a = `A${i+1}: ${c.answer}`
        const linesQ = doc.splitTextToSize(q, 520)
        const linesA = doc.splitTextToSize(a, 520)
        if(y + (linesQ.length + linesA.length) * 14 > 780){ doc.addPage(); y = margin }
        doc.text(linesQ, margin, y); y += linesQ.length * 14
        doc.text(linesA, margin, y); y += linesA.length * 14 + 8
      })
    }
    if(quiz?.length){
      if(y > 700){ doc.addPage(); y = margin }
      doc.text('Quiz:', margin, y); y += 16
      quiz.forEach((q, i) => {
        const qtext = `${i+1}. ${q.question}`
        const linesQ = doc.splitTextToSize(qtext, 520)
        if(y + linesQ.length * 14 > 780){ doc.addPage(); y = margin }
        doc.text(linesQ, margin, y); y += linesQ.length * 14
        if(q.options?.length){
          q.options.forEach((opt, k) => {
            const line = `   - ${opt}`
            const ls = doc.splitTextToSize(line, 520)
            if(y + ls.length * 14 > 780){ doc.addPage(); y = margin }
            doc.text(ls, margin, y); y += ls.length * 14
          })
        }
        const ans = `Answer: ${q.answer}`
        const la = doc.splitTextToSize(ans, 520)
        if(y + la.length * 14 > 780){ doc.addPage(); y = margin }
        doc.text(la, margin, y); y += la.length * 14 + 8
      })
    }
    doc.save('ai-study-assistant.pdf')
  }

  return (
    <div className="container py-8">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">AI Study Assistant</h1>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={()=>window.open('https://fastapi.tiangolo.com/', '_blank')}>Docs</button>
            <a className="btn btn-primary" href="#" onClick={(e)=>{e.preventDefault(); exportPDF()}}>Export PDF</a>
          </div>
        </div>
        <p className="text-gray-600 mt-2">Upload a file or paste text to get a summary, flashcards, and a quick quiz.</p>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="card">
          <h2 className="font-semibold text-lg mb-3">1) Input Text / Upload File</h2>
          <div className="flex items-center gap-3 mb-3">
            <label className="btn btn-secondary cursor-pointer">
              <input type="file" accept=".txt,.md,.pdf,.docx" className="hidden" onChange={handleUpload} />
              Upload File
            </label>
            {uploadName && <span className="badge">{uploadName}</span>}
          </div>
          <textarea className="textarea" placeholder="Paste your study text here..." value={inputText} onChange={e=>setInputText(e.target.value)} />
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn btn-primary" onClick={doSummarize} disabled={loading}>Summarize</button>
            <button className="btn btn-secondary" onClick={doFlashcards} disabled={loading}>Flashcards</button>
            <button className="btn btn-secondary" onClick={doQuiz} disabled={loading}>Quiz</button>
          </div>
          {loading && <div className="text-sm text-gray-500 mt-2">Processing...</div>}
        </section>

        <section className="card">
          <h2 className="font-semibold text-lg mb-3">2) Web Features (Baseline)</h2>
          <div className="flex gap-2 mb-3">
            <input className="input" value={feature} onChange={e=>setFeature(e.target.value)} placeholder="e.g., CSS Container Queries" />
            <button className="btn btn-secondary" onClick={doFeature} disabled={loading}>Get Feature</button>
          </div>
          {!featureInfo && <p className="text-gray-500 text-sm">Enter a feature name to get info and browser support.</p>}
          {featureInfo?.error && <p className="text-red-600">{featureInfo.error}</p>}
          {featureInfo?.feature && (
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Feature: {featureInfo.feature}</h3>
                {featureInfo.mdn_url && <a className="text-primary underline" href={featureInfo.mdn_url} target="_blank" rel="noreferrer">MDN</a>}
              </div>
              <p className="text-sm text-gray-700 mt-1">{featureInfo.support_summary}</p>
              <div className="mt-3">
                <h4 className="font-medium mb-1">Quick Quiz</h4>
                <ul className="list-disc pl-5 space-y-2">
                  {featureInfo.quiz?.map((q,i)=> (
                    <li key={i} className="text-sm">
                      <span className="font-semibold">Q:</span> {q.question}
                      <details className="mt-1">
                        <summary className="cursor-pointer text-primary">Show answer</summary>
                        <div className="pl-3 text-gray-700">{q.answer}</div>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mt-6">
        <section className="card md:col-span-3">
          <h2 className="font-semibold text-lg mb-3">Summary</h2>
          {summary ? (
            <p className="leading-7 text-gray-800 whitespace-pre-wrap">{summary}</p>
          ) : (
            <p className="text-sm text-gray-500">No summary yet.</p>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg">Flashcards</h2>
            <button className="btn btn-secondary" onClick={()=> setStudyMode(s=>!s)} disabled={!flashcards?.length}>
              {studyMode ? 'List View' : 'Study Mode'}
            </button>
          </div>
          {flashcards?.length ? (
            studyMode ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {flashcards.map((c,i)=> (
                  <button
                    key={i}
                    onClick={()=> setFlipped(prev=> ({...prev, [i]: !prev[i]}))}
                    className={`border rounded-lg p-4 text-left transition-colors ${flipped[i] ? 'bg-primary text-white' : 'bg-white hover:bg-gray-50'}`}
                  >
                    <div className="text-sm uppercase tracking-wide mb-1 opacity-70">Card {i+1}</div>
                    <div className="font-semibold">{flipped[i] ? `A: ${c.answer}` : `Q: ${c.question}`}</div>
                    <div className="mt-2 text-xs opacity-80">{flipped[i] ? 'Click to see Question' : 'Click to reveal Answer'}</div>
                  </button>
                ))}
              </div>
            ) : (
              <ul className="space-y-3">
                {flashcards.map((c,i)=> (
                  <li key={i} className="border rounded-lg p-3">
                    <div className="font-semibold">Q: {c.question}</div>
                    <div className="text-gray-700 mt-1">A: {c.answer}</div>
                  </li>
                ))}
              </ul>
            )
          ) : <p className="text-sm text-gray-500">No flashcards yet.</p>}
        </section>

        <section className="card md:col-span-2">
          <h2 className="font-semibold text-lg mb-3">Quiz</h2>
          {quiz?.length ? (
            <ul className="space-y-3">
              {quiz.map((q,i)=> (
                <li key={i} className="border rounded-lg p-3">
                  <div className="font-semibold">{i+1}. {q.question}</div>
                  {q.options?.length && (
                    <ul className="list-disc pl-5 mt-2 text-gray-700">
                      {q.options.map((o,k)=> <li key={k}>{o}</li>)}
                    </ul>
                  )}
                  <div className="mt-2 text-primary">Answer: {q.answer}</div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-gray-500">No quiz yet.</p>}
        </section>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
