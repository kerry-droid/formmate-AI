import React, { useEffect, useState } from 'react';
import { DEFAULT_API_URL, requestSuggestion } from '../utils/api';

function parsePastedQuestion(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { question: '', options: [] };

  const choiceMarker = /^(?:(?:[A-H]|\d+)[.)]|[-*•])\s+/i;
  const questionLine = lines.findIndex((line) => line.includes('?'));
  if (questionLine >= 0 && questionLine < lines.length - 1) {
    return {
      question: lines.slice(0, questionLine + 1).join(' '),
      options: lines.slice(questionLine + 1).map((line) => line.replace(choiceMarker, '').trim()).filter(Boolean)
    };
  }

  const firstChoice = lines.findIndex((line, index) => index > 0 && choiceMarker.test(line));
  if (firstChoice > 0 && lines.length - firstChoice >= 2) {
    return {
      question: lines.slice(0, firstChoice).join(' '),
      options: lines.slice(firstChoice).map((line) => line.replace(choiceMarker, '').trim()).filter(Boolean)
    };
  }
  return { question: lines.join(' '), options: [] };
}

export default function App() {
  const [questionText, setQuestionText] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [apiUrlDraft, setApiUrlDraft] = useState(DEFAULT_API_URL);
  const [apiUrlMessage, setApiUrlMessage] = useState('');
  const [fields, setFields] = useState([]);

  useEffect(() => {
    chrome.storage?.local.get(['apiUrl'], (stored) => {
      const savedApiUrl = stored.apiUrl;
      const url = savedApiUrl && !['http://localhost:5000', 'http://localhost:5001'].includes(savedApiUrl) ? savedApiUrl : DEFAULT_API_URL;
      setApiUrl(url);
      setApiUrlDraft(url);
    });
    chrome.tabs?.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'DETECT_FIELDS' }, (detected) => {
        if (!chrome.runtime.lastError && detected) {
          setFields(detected);
          if (detected[0]) {
            const choices = detected[0].options || [];
            setQuestionText([detected[0].question, ...choices].filter(Boolean).join('\n'));
          }
        }
      });
    });
  }, []);

  function saveApiUrl(event) {
    event.preventDefault();
    setApiUrlMessage('');
    let parsed;
    try { parsed = new URL(apiUrlDraft.trim()); }
    catch { setApiUrlMessage('Enter a valid backend URL, including https://.'); return; }
    if (!['https:', 'http:'].includes(parsed.protocol) || (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1')) {
      setApiUrlMessage('Use an HTTPS URL, or localhost for local development.');
      return;
    }
    const baseUrl = parsed.origin;
    const save = () => chrome.storage.local.set({ apiUrl: baseUrl }, () => {
      setApiUrl(baseUrl);
      setApiUrlDraft(baseUrl);
      setApiUrlMessage('Backend URL saved.');
    });
    if (parsed.protocol === 'https:' && chrome.permissions) {
      chrome.permissions.request({ origins: [`${baseUrl}/*`] }, (granted) => {
        if (granted) save();
        else setApiUrlMessage('Allow access to this backend URL to connect.');
      });
    } else save();
  }

  async function analyze(event) {
    event.preventDefault();
    setLoading(true); setError(''); setSuggestion(null);
    try {
      const parsed = parsePastedQuestion(questionText);
      if (!parsed.question) throw new Error('Paste a question to get a suggestion.');
      setSuggestion(await requestSuggestion(parsed.question, parsed.options, apiUrl));
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }

  function fill(index, value) {
    chrome.tabs?.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'FILL_FIELD', index, value });
    });
  }

  return <main>
    <header><span className="mark">FM</span><div><p className="eyebrow">FORMMATE AI</p><h1>Review your next answer.</h1></div></header>
    <p className="intro">A quiet second opinion for forms you are authorized to complete.</p>
    <form className="backend-settings" onSubmit={saveApiUrl}>
      <label>Backend URL<input value={apiUrlDraft} onChange={(event) => setApiUrlDraft(event.target.value)} placeholder="https://your-project.vercel.app" /></label>
      <button type="submit" className="secondary">Save backend URL</button>
      {apiUrlMessage && <p className="api-url-message" role="status">{apiUrlMessage}</p>}
    </form>
    <form onSubmit={analyze}>
      <label>Question and choices<textarea value={questionText} onChange={(event) => setQuestionText(event.target.value)} placeholder={'Paste everything here, with each choice on a new line:\nWhat is the capital of Kenya?\nKampala\nUganda\nNairobi'} rows="7" required /></label>
      <p className="detected">Paste the question first, then put each answer choice on its own line.</p>
      <button type="submit" disabled={loading}>{loading ? 'Thinking...' : 'Suggest an answer'}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {suggestion && <section className="result" aria-live="polite"><div className="result-top"><p className="eyebrow">SUGGESTION</p><strong>{suggestion.answer || 'No answer suggested'}</strong><span>{Math.round(suggestion.confidence * 100)}% confidence</span></div><p>{suggestion.explanation}</p><button className="secondary" onClick={() => fields[0] && fill(0, suggestion.answer)}>Fill first detected field</button></section>}
    {fields.length > 0 && <p className="detected">{fields.length} supported field{fields.length === 1 ? '' : 's'} detected on this page.</p>}
    <footer>Review before filling. FormMate never submits forms.</footer>
  </main>;
}
