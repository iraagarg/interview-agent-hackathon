import { useEffect, useRef } from 'react';
import FeedbackCard from './FeedbackCard.jsx';

function Bubble({ message }) {
  const isCandidate = message.role === 'candidate';

  return (
    <div className={`flex ${isCandidate ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          isCandidate
            ? 'animate-rise max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-[15px] leading-relaxed text-white'
            : 'animate-rise max-w-[85%] rounded-2xl rounded-bl-md border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-[15px] leading-relaxed text-zinc-100'
        }
      >
        {message.content}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-zinc-800 bg-zinc-900 px-4 py-3.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
        <span className="sr-only">Interviewer is typing</span>
      </div>
    </div>
  );
}

export default function MessageList({ messages, loading, feedback, error }) {
  const bottomRef = useRef(null);

  // Follow the conversation as it grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, loading, feedback, error]);

  return (
    <div className="scroll-slim flex-1 overflow-y-auto">
      <div
        className="mx-auto w-full max-w-3xl space-y-4 px-5 py-6"
        role="log"
        aria-live="polite"
      >
        {messages.map((message, i) => (
          <Bubble key={i} message={message} />
        ))}

        {loading && <Thinking />}

        {error && (
          <div
            role="alert"
            className="animate-rise flex gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-[14px] leading-relaxed text-red-300"
          >
            <span aria-hidden="true" className="mt-[3px] shrink-0 font-semibold">!</span>
            <span>{error}</span>
          </div>
        )}

        {feedback && <FeedbackCard feedback={feedback} />}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
