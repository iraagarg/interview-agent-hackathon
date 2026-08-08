import { useEffect, useRef, useState } from 'react';

const MAX_HEIGHT = 160;

export default function Composer({ onSend, disabled, placeholder }) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  // Grow with the answer, then scroll internally rather than pushing the
  // transcript off screen.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  async function submit() {
    const text = value.trim();
    if (!text || disabled) return;

    // Clear only once the turn is accepted. If the request fails the answer is
    // still sitting in the box, so retrying is one click rather than retyping.
    const sent = await onSend(text);
    if (sent !== false) setValue('');
  }

  function onKeyDown(event) {
    // Enter sends, Shift+Enter adds a newline — the convention people expect
    // from a chat box.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto w-full max-w-3xl px-5 py-4">
        <div
          className="flex items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-2
                     focus-within:border-indigo-500/70"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Your answer"
            className="max-h-40 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] leading-relaxed
                       text-zinc-100 placeholder:text-zinc-600 focus:outline-none
                       disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={submit}
            disabled={disabled || value.trim() === ''}
            aria-label="Send answer"
            className="mb-0.5 shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white
                       transition hover:bg-indigo-500
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
                       disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            Send
          </button>
        </div>
        <p className="mt-2 px-1 text-[11px] text-zinc-600">
          Enter to send · Shift + Enter for a new line
        </p>
      </div>
    </div>
  );
}
