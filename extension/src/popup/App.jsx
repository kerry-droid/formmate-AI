import React, { useEffect, useState } from 'react';
import { DEFAULT_API_URL, requestSuggestion } from '../utils/api';

export default function App() {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState('');
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
            setQuestion(detected[0].question || '');
            setOptions((detected[0].options || []).join('\n'));
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
      setSuggestion(await requestSuggestion(question, options.split('\n').map((item) => item.trim()).filter(Boolean), apiUrl));
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
      <label>Question<textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Paste or select a question" required /></label>
      <label>Options <span>(one per line)</span><textarea value={options} onChange={(event) => setOptions(event.target.value)} placeholder="Optional choices" rows="4" /></label>
      <button type="submit" disabled={loading}>{loading ? 'Thinking...' : 'Suggest an answer'}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {suggestion && <section className="result" aria-live="polite"><div className="result-top"><p className="eyebrow">SUGGESTION</p><strong>{suggestion.answer || 'No answer suggested'}</strong><span>{Math.round(suggestion.confidence * 100)}% confidence</span></div><p>{suggestion.explanation}</p><button className="secondary" onClick={() => fields[0] && fill(0, suggestion.answer)}>Fill first detected field</button></section>}
    {fields.length > 0 && <p className="detected">{fields.length} supported field{fields.length === 1 ? '' : 's'} detected on this page.</p>}
    <footer>Review before filling. FormMate never submits forms.</footer>
  </main>;
}
