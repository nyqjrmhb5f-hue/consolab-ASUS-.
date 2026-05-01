export async function fetchJson(url, options = {}) {
  const timeout = options.timeout ?? 3000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal
    });
    const body = await response.text();
    let data = null;

    try {
      data = JSON.parse(body);
    } catch {
      data = body;
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.message
    };
  } finally {
    clearTimeout(timer);
  }
}
