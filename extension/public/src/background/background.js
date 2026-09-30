const DEFAULT_API_URL = 'https://formmate-ai-ten.vercel.app';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['apiUrl'], (stored) => {
    if (!stored.apiUrl || stored.apiUrl === 'http://localhost:5001' || stored.apiUrl === 'http://localhost:5000') {
      chrome.storage.local.set({ apiUrl: DEFAULT_API_URL });
    }
  });
});

async function answerDetectedFields(tabId, fields, requestId) {
  const { apiUrl = DEFAULT_API_URL } = await chrome.storage.local.get('apiUrl');
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions: fields.slice(0, 50).map(({ question, options }) => ({ question, options })) })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `Answer service returned ${response.status}`);
  const answers = (payload.answers || []).map((result, index) => ({
    index: fields[index].index,
    answer: result.answer,
    confidence: Number(result.confidence) || 0
  }));
  await chrome.tabs.sendMessage(tabId, { type: 'APPLY_AUTO_ANSWERS', requestId, answers });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'FORM_DETECTED') {
    const count = Number(message.count) || 0;
    chrome.action.setBadgeText({ text: count ? String(count) : '', tabId: sender.tab?.id });
    chrome.action.setBadgeBackgroundColor({ color: '#d97952' });
    if (sender.tab?.id && message.fields?.length) {
      answerDetectedFields(sender.tab.id, message.fields, message.requestId).catch((error) => {
        console.warn('FormMate could not auto-fill this page:', error.message);
        chrome.tabs.sendMessage(sender.tab.id, { type: 'ANSWER_REQUEST_FAILED', requestId: message.requestId, error: error.message }).catch(() => {});
      });
    }
  }
});


chrome.commands.onCommand.addListener((command) => {
  if (command !== 'autofill-current-form') return;
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'AUTOFILL_NOW' }).catch(() => {});
  });
});
