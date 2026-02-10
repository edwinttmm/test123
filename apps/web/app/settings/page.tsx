"use client";

import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function SettingsPage() {
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    const res = await fetch(`${API_URL}/tenant/integrations/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ provider, apiKey })
    });
    setMessage(res.ok ? "Saved securely." : "Failed to save key.");
    if (res.ok) setApiKey("");
  }

  return (
    <main>
      <h2>Settings</h2>
      <p>Add integration API keys after the app is live. Keys are stored encrypted server-side.</p>
      <form onSubmit={saveKey} style={{ display: "grid", gap: 8, maxWidth: 500 }}>
        <label>
          Session token (owner/admin)
          <input value={token} onChange={(e) => setToken(e.target.value)} required />
        </label>
        <label>
          Provider
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="openai">OpenAI</option>
            <option value="stripe">Stripe</option>
            <option value="xero">Xero</option>
            <option value="quickbooks">QuickBooks</option>
            <option value="vapi">Vapi</option>
          </select>
        </label>
        <label>
          API Key
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
        </label>
        <button type="submit">Save key</button>
      </form>
      {message ? <p>{message}</p> : null}
    </main>
  );
}
