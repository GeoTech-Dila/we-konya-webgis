import { useState } from "react";
import "./AgentChat.css";

const SUGGESTED_QUESTIONS = [
  "En fazla acil olay bulunan 5 ilçe hangisi?",
  "Toplanma alanı en fazla olan ilçeleri sırala.",
  "Kapasite endeksi en düşük 3 ilçe hangisi?",
  "Karatay ile Karapınar'ı karşılaştır.",
  "Konya'da kaç mahalle var?",
  "Fay hattı uzunluğu en yüksek ilçeler hangileri?",
];

export default function AgentChat({ apiUrl }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Konya afet riski ve dirençlilik verileri hakkında ne öğrenmek istersiniz?" },
  ]);

  const ask = async (question) => {
    const text = question.trim();
    if (!text || loading) return;
    setMessage("");
    setMessages((items) => [...items, { role: "user", text }]);
    setLoading(true);
    try {
      const history = messages
        .slice(1)
        .filter((item) => item.role === "user" || item.role === "assistant")
        .slice(-10);
      const response = await fetch(`${apiUrl}/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Agent yanıt veremedi.");
      setMessages((items) => [...items, { role: "assistant", text: data.answer }]);
    } catch (error) {
      setMessages((items) => [...items, { role: "error", text: error.message }]);
    } finally {
      setLoading(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    ask(message);
  };

  if (!open) {
    return <button className="agent-chat-launcher" onClick={() => setOpen(true)}>✦ GIS Asistanı</button>;
  }

  return (
    <section className="agent-chat" aria-label="Agentic GIS sohbeti">
      <header>
        <div><strong>GIS Asistanı</strong><small>Gemini ücretsiz katmanı · Güncel WebGIS analizleri</small></div>
        <button onClick={() => setOpen(false)} aria-label="Sohbeti kapat">×</button>
      </header>
      <div className="agent-chat-messages">
        {messages.map((item, index) => (
          <div className={`agent-message ${item.role}`} key={`${item.role}-${index}`}>{item.text}</div>
        ))}
        {messages.length === 1 && !loading && (
          <div className="agent-suggestions" aria-label="Örnek GIS soruları">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button type="button" key={question} onClick={() => ask(question)}>{question}</button>
            ))}
          </div>
        )}
        {loading && <div className="agent-message assistant">Analiz ediyorum…</div>}
      </div>
      <form onSubmit={submit}>
        <input value={message} onChange={(event) => setMessage(event.target.value)}
          placeholder="Örn. En problemli 3 ilçe hangisi?" maxLength={2000} />
        <button disabled={loading || !message.trim()} aria-label="Gönder">➜</button>
      </form>
    </section>
  );
}
