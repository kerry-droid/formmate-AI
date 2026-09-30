function getLabel(field) {
  if (field.labels?.length) return field.labels[0].innerText.trim();
  const labelledBy = field.getAttribute('aria-labelledby');
  if (labelledBy) return document.getElementById(labelledBy)?.innerText?.trim() || '';
  return field.getAttribute('aria-label') || field.name || field.placeholder || '';
}

// Google Forms' editor exposes question titles and answer choices as text inputs.
// They are authoring controls, so filling them can alter the form itself.
function isFormEditor() {
  return location.hostname === 'docs.google.com'
    && /^\/forms\/d\/[^/]+\/edit(?:\/|$)/.test(location.pathname);
}

function getRadioGroups() {
  return [...document.querySelectorAll('[role="radiogroup"]')].map((group) => {
    const container = group.closest('[role="listitem"]') || group.parentElement;
    const heading = container?.querySelector('[role="heading"]');
    const labelledBy = group.getAttribute('aria-labelledby');
    const question = (labelledBy ? document.getElementById(labelledBy)?.innerText : '')
      || heading?.innerText || group.getAttribute('aria-label') || '';
    const optionElements = [...group.querySelectorAll('[role="radio"]')];
    const options = optionElements.map((option) =>
      (option.getAttribute('aria-label') || option.innerText || '').trim()
    ).filter(Boolean);
    if (!question.trim() || !options.length || optionElements.some((option) => option.getAttribute('aria-checked') === 'true')) return null;
    return { element: group, question: question.trim(), options, optionElements, kind: 'radio' };
  }).filter(Boolean);
}

function detectFields() {
  if (isFormEditor()) return [];
  const standardFields = [...document.querySelectorAll('input, textarea, select')]
    .filter((field) => !['hidden', 'submit', 'button', 'password', 'file', 'checkbox', 'radio'].includes(field.type))
    .filter((field) => !field.disabled && !field.readOnly && !field.value.trim())
    .map((field) => ({
      element: field,
      question: getLabel(field),
      options: field.tagName === 'SELECT' ? [...field.options].map((option) => option.text.trim()).filter(Boolean) : [],
      kind: field.tagName === 'SELECT' ? 'select' : 'text'
    }))
    .filter(({ question }) => question);
  return [...standardFields, ...getRadioGroups()].sort((a, b) => {
    const relation = a.element.compareDocumentPosition(b.element);
    return relation & Node.DOCUMENT_POSITION_FOLLOWING ? -1
      : relation & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
  });
}

function setFieldValue(field, value) {
  const prototype = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
    : field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

function applyAnswer(target, answer) {
  if (!target || !answer || !target.element?.isConnected) return false;
  const value = String(answer).trim();
  if (!value) return false;
  if (target.kind === 'radio') {
    const selected = target.optionElements.find((option) =>
      (option.getAttribute('aria-label') || option.innerText || '').trim().toLowerCase() === value.toLowerCase()
    );
    if (!selected || selected.getAttribute('aria-disabled') === 'true') return false;
    selected.click();
    return true;
  }
  if (target.element.value.trim()) return false;
  if (target.kind === 'select') {
    const option = [...target.element.options].find((item) => item.text.trim().toLowerCase() === value.toLowerCase()
      || item.value.trim().toLowerCase() === value.toLowerCase());
    if (!option) return false;
    setFieldValue(target.element, option.value);
  } else setFieldValue(target.element, value);
  return true;
}

const pendingFieldMaps = new Map();
let requestCounter = 0;

function fillAnswers(answers, requestId) {
  const fields = pendingFieldMaps.get(requestId) || [];
  pendingFieldMaps.delete(requestId);
  let filled = 0;
  answers.forEach(({ index, answer, confidence }) => {
    const target = fields[index];
    if (!target || confidence < 0.85 || !applyAnswer(target, answer)) return;
    filled += 1;
  });
  return filled;
}

function showStatus(message) {
  document.getElementById('formmate-detection-banner')?.remove();
  const banner = document.createElement('aside');
  banner.id = 'formmate-detection-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML = '<strong>FormMate</strong><span></span><button type="button" aria-label="Dismiss">Dismiss</button>';
  banner.querySelector('span').textContent = message;
  Object.assign(banner.style, {
    position: 'fixed', zIndex: '2147483647', top: '16px', right: '16px', maxWidth: '320px',
    padding: '14px 16px', border: '1px solid #b7d5c2', borderRadius: '6px', color: '#183a31',
    background: '#f4fbf5', boxShadow: '0 8px 24px rgba(24, 58, 49, .18)', font: '14px/1.4 sans-serif'
  });
  banner.querySelector('strong').style.display = 'block';
  banner.querySelector('span').style.display = 'block';
  banner.querySelector('span').style.margin = '4px 0 10px';
  banner.querySelector('button').addEventListener('click', () => banner.remove());
  document.body.appendChild(banner);
}

let lastSignature = '';
let analyzeTimer;
let progressTimer;
function requestAnswers(fields) {
  const requestId = `page-${++requestCounter}`;
  pendingFieldMaps.set(requestId, fields);
  chrome.runtime.sendMessage({
    type: 'FORM_DETECTED', requestId,
    count: fields.length,
    fields: fields.map(({ question, options }, index) => ({ index, question, options }))
  });
}

function analyzePage(force = false) {
  if (isFormEditor()) {
    lastSignature = 'google-forms-editor';
    return;
  }
  const fields = detectFields();
  const signature = fields.map(({ question, options }) => `${question}:${options.join('|')}`).join('\n');
  if (!force && signature === lastSignature) return;
  lastSignature = signature;
  requestAnswers(fields);
}

function requestManualAnswers() {
  if (isFormEditor()) return;
  const fields = detectFields();
  if (!fields.length) {
    showStatus('No unanswered supported fields found on this page.');
    return;
  }
  clearInterval(progressTimer);
  const startedAt = Date.now();
  showStatus(`Finding answers for ${fields.length} fields... 0s`);
  progressTimer = setInterval(() => {
    const status = document.querySelector('#formmate-detection-banner span');
    if (!status) {
      clearInterval(progressTimer);
      return;
    }
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    status.textContent = `Finding answers for ${fields.length} fields... ${seconds}s`;
  }, 1000);
  analyzePage(true);
}

analyzePage();
document.addEventListener('keydown', (event) => {
  if (!event.altKey || event.key !== 'Enter' || event.repeat || isFormEditor()) return;
  event.preventDefault();
  event.stopPropagation();
  requestManualAnswers();
}, true);
new MutationObserver(() => {
  clearTimeout(analyzeTimer);
  analyzeTimer = setTimeout(analyzePage, 250);
}).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'AUTOFILL_NOW') {
    requestManualAnswers();
    sendResponse({ ok: true });
    return;
  }
  if (message.type === 'DETECT_FIELDS') {
    sendResponse(detectFields().map(({ question, options }) => ({ question, options })));
    return;
  }
  if (message.type === 'FILL_FIELD') {
    sendResponse({ ok: applyAnswer(detectFields()[message.index], message.value) });
    return;
  }
  if (message.type === 'ANSWER_REQUEST_FAILED') {
    clearInterval(progressTimer);
    showStatus(message.error ? `Could not get answers: ${message.error}` : 'Could not get answers. Check the backend connection and try again.');
    sendResponse({ ok: true });
    return;
  }
  if (message.type === 'APPLY_AUTO_ANSWERS') {
    clearInterval(progressTimer);
    const filled = fillAnswers(message.answers || [], message.requestId);
    showStatus(filled
      ? `Filled ${filled} field${filled === 1 ? '' : 's'} with high confidence. Review answers before submitting.`
      : 'Form fields detected. No high confidence answers were available to fill.');
    sendResponse({ filled });
  }
});
