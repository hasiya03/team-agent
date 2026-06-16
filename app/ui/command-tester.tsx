"use client";

import { useState } from "react";
import { Send } from "lucide-react";

export default function CommandTester() {
  const [body, setBody] = useState("Add member Amal whatsapp:+94771234567 marketing");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setReply("");
    const response = await fetch("/api/dev/admin-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
    const json = await response.json();
    setReply(json.reply || json.error || "No reply");
    setLoading(false);
  }

  return (
    <div className="form">
      <div className="field">
        <label>Message</label>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} />
      </div>
      <button className="button" type="button" onClick={submit} disabled={loading}>
        <Send size={16} />
        {loading ? "Sending" : "Send"}
      </button>
      {reply ? <p className="message-body">{reply}</p> : null}
    </div>
  );
}
