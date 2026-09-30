chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ apiUrl: 'http://localhost:5001' });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'FORM_DETECTED') {
    chrome.action.setBadgeText({ text: message.count ? String(message.count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#d97952' });
  }
});
