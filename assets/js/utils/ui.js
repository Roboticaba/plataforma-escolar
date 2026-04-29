export function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function showFeedback(element, type, message) {
  if (!element) {
    return;
  }

  element.className = `feedback feedback-${type}`;
  element.textContent = message;
  element.hidden = !message;
}

export function clearFeedback(element) {
  if (!element) {
    return;
  }

  element.hidden = true;
  element.textContent = "";
  element.className = "feedback";
}

export function setLoading(button, isLoading, idleText, loadingText) {
  if (!button) {
    return;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : idleText;
}

export function renderEmptyState(message) {
  return `<div class="empty-panel">${escapeHtml(message)}</div>`;
}
