chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['apiUrl'], (stored) => {
    if (!stored.apiUrl || stored.apiUrl === 'http://localhost:5001' || stored.apiUrl === 'http://localhost:5000') {
      chrome.storage.local.set({ apiUrl: 'https://formmate-ai-ten.vercel.app' });
    }
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'FORM_DETECTED') {
    chrome.action.setBadgeText({ text: message.count ? String(message.count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#d97952' });
  }
});
