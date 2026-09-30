function getLabel(field) {
  if (field.labels?.length) return field.labels[0].innerText.trim();
  const labelledBy = field.getAttribute('aria-labelledby');
  if (labelledBy) return document.getElementById(labelledBy)?.innerText?.trim() || '';
  return field.getAttribute('aria-label') || field.name || field.placeholder || '';
}

function detectFields() {
  return [...document.querySelectorAll('input, textarea, select')]
    .filter((field) => !['hidden', 'submit', 'button'].includes(field.type))
    .map((field) => ({
      element: field,
      question: getLabel(field),
      options: field.tagName === 'SELECT' ? [...field.options].map((option) => option.text).filter(Boolean) : []
    }))
    .filter(({ question }) => question);
}

function showDetectionBanner(fields) {
  if (!fields.length || document.getElementById('formmate-detection-banner')) return;
  const banner = document.createElement('aside');
  banner.id = 'formmate-detection-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML = '<strong>FormMate found ' + fields.length + ' form field' + (fields.length === 1 ? '' : 's') + '.</strong><span>Open the extension to review the question.</span><button type="button">Dismiss</button>';
  Object.assign(banner.style, {
    position: 'fixed', zIndex: '2147483647', top: '16px', right: '16px', maxWidth: '300px',
    padding: '14px 16px', border: '1px solid #b7d5c2', borderRadius: '6px', color: '#183a31',
    background: '#f4fbf5', boxShadow: '0 8px 24px rgba(24, 58, 49, .18)',
    font: '14px/1.4 sans-serif'
  });
  banner.querySelector('span').style.display = 'block';
  banner.querySelector('span').style.margin = '4px 0 10px';
  banner.querySelector('button').addEventListener('click', () => banner.remove());
  document.body.appendChild(banner);
}

const detectedFields = detectFields();
showDetectionBanner(detectedFields);
chrome.runtime.sendMessage({ type: 'FORM_DETECTED', count: detectedFields.length });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'DETECT_FIELDS') sendResponse(detectFields().map(({ element, ...field }) => field));
  if (message.type === 'FILL_FIELD') {
    const fields = detectFields();
    const target = fields[message.index]?.element;
    if (target) {
      target.focus();
      target.value = message.value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      sendResponse({ ok: true });
    }
  }
  return true;
});
