window.QuizAPI = {
  async call(action, payload = {}, options = {}) {
    const url = (window.QUIZ_CONFIG || {}).APPS_SCRIPT_URL;
    if (!url || url.includes('PASTE_')) {
      throw new Error('Apps Script URL is not configured yet.');
    }

    const timeoutMs = Number(options.timeoutMs || 10000);
    const retries = Number(options.retries ?? 5);
    const retryDelaysMs = Array.isArray(options.retryDelaysMs) ? options.retryDelaysMs : null;
    const onRetry = typeof options.onRetry === 'function' ? options.onRetry : () => {};

    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const body = new URLSearchParams({
          payload: JSON.stringify({ action, ...payload })
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        let response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body,
            signal: controller.signal,
            cache: 'no-store'
          });
        } finally {
          clearTimeout(timeoutId);
        }

        const text = await response.text();
        let data = null;

        try {
          data = JSON.parse(text);
        } catch (_) {
          // Apps Script can return an HTML error page during a burst. Treat that as retryable.
          throw Object.assign(new Error('Temporary quiz server response.'), { retryable: true });
        }

        if (!response.ok) {
          throw Object.assign(
            new Error(data && data.error ? data.error : `Quiz server error (${response.status}).`),
            { retryable: data && data.retryable !== false }
          );
        }

        if (!data.ok) {
          const err = new Error(data.error || 'Quiz server request failed.');
          err.retryable = data.retryable === true;
          throw err;
        }

        return data;
      } catch (e) {
        lastError = normalizeNetworkError_(e);
        const retryable = lastError.retryable === true || e.name === 'AbortError' || e instanceof TypeError;

        if (!retryable || attempt >= retries) {
          throw lastError;
        }

        const base = retryDelaysMs && retryDelaysMs[attempt] != null
          ? Number(retryDelaysMs[attempt])
          : Math.min(4000, 350 * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * Math.min(300, Math.max(50, base * 0.2)));
        const delay = Math.max(100, base + jitter);

        onRetry({
          attempt: attempt + 1,
          totalAttempts: retries + 1,
          delayMs: delay,
          message: lastError.message
        });

        await sleep_(delay);
      }
    }

    throw lastError || new Error('Quiz server request failed.');
  }
};

function sleep_(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeNetworkError_(e) {
  if (!e) return new Error('Quiz server request failed.');

  if (e.name === 'AbortError') {
    return Object.assign(
      new Error('The quiz server is busy or taking too long to respond.'),
      { retryable: true }
    );
  }

  if (e instanceof TypeError) {
    return Object.assign(
      new Error('Network connection problem. Retrying automatically...'),
      { retryable: true }
    );
  }

  return e;
}
