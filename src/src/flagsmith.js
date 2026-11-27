// Minimal client for the Flagsmith Admin API (v1 featurestates endpoints).
// Works against a self-hosted instance: FLAGSMITH_URL=http://localhost:8000
export class Flagsmith {
  constructor({ baseUrl, apiKey, environmentKey, fetchImpl = fetch }) {
    this.base = baseUrl.replace(/\/$/, '') + '/api/v1';
    this.apiKey = apiKey;
    this.env = environmentKey;
    this.fetch = fetchImpl;
  }

  async #req(path, opts = {}) {
    const res = await this.fetch(this.base + path, {
      ...opts,
      headers: {
        Authorization: `Api-Key ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`Flagsmith ${res.status} on ${path}: ${await res.text()}`);
    return res.json();
  }

  /** Returns { id, enabled } for a feature in the configured environment. */
  async getFlag(name) {
    const data = await this.#req(
      `/environments/${this.env}/featurestates/?feature_name=${encodeURIComponent(name)}`,
    );
    const fs = (data.results || []).find((r) => !r.identity && !r.feature_segment);
    if (!fs) throw new Error(`Flag "${name}" not found in this environment`);
    return { id: fs.id, enabled: fs.enabled };
  }

  /** Sets enabled=true/false. Returns { before, after }. */
  async setFlag(name, enabled) {
    const cur = await this.getFlag(name);
    const updated = await this.#req(`/environments/${this.env}/featurestates/${cur.id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
    return { before: cur.enabled, after: updated.enabled };
  }
}
