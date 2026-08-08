import { useCallback, useRef, useState } from 'react';
import { postInterview, newSessionId } from './api.js';
import CandidatePicker from './components/CandidatePicker.jsx';
import MessageList from './components/MessageList.jsx';
import Composer from './components/Composer.jsx';
import candidatesData from '../../data/candidates.json';

const candidates = candidatesData.candidates;

export default function App() {
  const [candidate, setCandidate] = useState(null);
  const [messages, setMessages] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const sessionIdRef = useRef(null);
  // Guards against a double-click or a StrictMode double-invoke firing two
  // requests for the same turn. The server serialises per session too, but the
  // UI should not send the answer twice in the first place.
  const inFlightRef = useRef(false);

  const questionCount = messages.filter((m) => m.role === 'interviewer').length;
  const done = feedback !== null;

  const start = useCallback(async (chosen) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    sessionIdRef.current = newSessionId();
    setCandidate(chosen);
    setMessages([]);
    setFeedback(null);
    setError(null);
    setLoading(true);

    try {
      const data = await postInterview({
        sessionId: sessionIdRef.current,
        candidate: chosen,
      });
      setMessages([{ role: 'interviewer', content: data.reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  /** Resolves false when the turn failed, so the composer keeps the answer. */
  const send = useCallback(async (text) => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;

    const optimistic = { role: 'candidate', content: text };
    setMessages((prev) => [...prev, optimistic]);
    setError(null);
    setLoading(true);

    try {
      const data = await postInterview({
        sessionId: sessionIdRef.current,
        message: text,
      });
      setMessages((prev) => [...prev, { role: 'interviewer', content: data.reply }]);
      if (data.done) setFeedback(data.feedback);
      return true;
    } catch (err) {
      // Roll the optimistic message back out of the transcript so the UI does
      // not imply an answer was delivered when it never left the browser.
      setMessages((prev) => prev.filter((m) => m !== optimistic));
      setError(`${err.message} Your answer was not sent — press Send to retry.`);
      return false;
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    sessionIdRef.current = null;
    setCandidate(null);
    setMessages([]);
    setFeedback(null);
    setError(null);
  }, []);

  if (!candidate) {
    return (
      <main className="h-full overflow-y-auto">
        <CandidatePicker candidates={candidates} onSelect={start} disabled={loading} />
      </main>
    );
  }

  const m = candidate.member;

  return (
    <main className="flex h-full flex-col">
      <header className="shrink-0 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-medium text-zinc-100">{m.name}</h1>
            <p className="truncate text-[13px] text-zinc-500">
              {m.jobRole} · {m.yearsExperience}y
            </p>
          </div>

          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              done
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {done ? 'Complete' : `Question ${questionCount}`}
          </span>

          {/* When the interview is over the primary call to action lives in the
              footer, so a second identical button here would just be clutter. */}
          {!done && (
            <button
              type="button"
              onClick={reset}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] text-zinc-400 transition
                         hover:bg-zinc-800 hover:text-zinc-100
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Exit
            </button>
          )}
        </div>
      </header>

      <MessageList
        messages={messages}
        loading={loading}
        feedback={feedback}
        error={error}
      />

      {done ? (
        <div className="shrink-0 border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
          <div className="mx-auto w-full max-w-3xl px-5 py-5">
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm
                         font-medium text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-900
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Interview another candidate
            </button>
          </div>
        </div>
      ) : (
        <Composer
          onSend={send}
          disabled={loading}
          placeholder={loading ? 'Waiting for the interviewer…' : 'Type your answer…'}
        />
      )}
    </main>
  );
}
