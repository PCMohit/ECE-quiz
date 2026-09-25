window.QuizAPI = {
  async call(action, payload = {}, options = {}) {
    const url = (window.QUIZ_CONFIG || {}).APPS_SCRIPT_URL;
    if (!url || url.includes('PASTE_')) {
      throw new Error('Apps Script URL is not configured yet.');
    }

    const timeoutMs = Number(options.timeoutMs || 25000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body = new URLSearchParams({
        payload: JSON.stringify({ action, ...payload })
      });

      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body,
        signal: controller.signal,
        cache: 'no-store'
      });

      const text = await r.text();
      let d;
      try {
        d = JSON.parse(text);
      } catch (_) {
        throw new Error('The quiz server returned an invalid response. Please try again.');
      }

      if (!r.ok || !d.ok) {
        throw new Error(d.error || `Quiz server error (${r.status}).`);
      }

      return d;
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error('The quiz server is taking too long to respond. Please wait a few seconds and try again.');
      }
      if (e instanceof TypeError) {
        throw new Error('Could not reach the quiz server. Please check your internet connection and try again.');
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }
};
