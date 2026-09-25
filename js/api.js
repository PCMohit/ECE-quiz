window.QuizAPI = {
  async call(action, payload = {}, options = {}) {
    const url = (window.QUIZ_CONFIG || {}).APPS_SCRIPT_URL;
    if (!url || url.includes('PASTE_')) {
      throw new Error('Apps Script URL is not configured yet.');
    }

    const timeoutMs = Math.max(5000, Number(options.timeoutMs || 15000));
    const retries = Math.max(0, Number(options.retries ?? 4));
    const retryDelaysMs = Array.isArray(options.retryDelaysMs) ? options.retryDelaysMs : [];
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
            redirect: 'follow',
            cache: 'no-store',
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }

        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (_) {
          throw Object.assign(new Error('Temporary quiz server response.'), { retryable: true });
        }

        // Apps Script normally returns HTTP 200 even when our doPost reports an application error.
        if (!response.ok && response.status < 500 && response.status !== 429) {
          const err = new Error(data && data.error ? data.error : `Quiz server error (${response.status}).`);
          err.retryable = false;
          throw err;
        }

        if (!data.ok) {
          const err = new Error(data.error || 'Quiz server request failed.');
          err.retryable = data.retryable === true || response.status >= 500 || response.status === 429;
          err.code = data.code || '';
          throw err;
        }

        return data;
      } catch (e) {
        lastError = normalizeNetworkError_(e);
        const retryable =
          lastError.retryable === true ||
          e.name === 'AbortError' ||
          e instanceof TypeError;

        if (!retryable || attempt >= retries) {
          throw lastError;
        }

        const base = retryDelaysMs[attempt] != null
          ? Math.max(500, Number(retryDelaysMs[attempt]))
          : Math.min(12000, 1000 * Math.pow(2, attempt));

        // Small jitter prevents a synchronized retry storm when many participants receive the same error.
        const jitter = Math.floor(Math.random() * Math.min(750, Math.max(100, base * 0.25)));
        const delay = base + jitter;

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
  if (!e) return Object.assign(new Error('Quiz server request failed.'), { retryable: true });

  if (e.name === 'AbortError') {
    return Object.assign(
      new Error('The quiz server is taking longer than expected.'),
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
