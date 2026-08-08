/**
 * Rendered inline at the end of the transcript once the server returns
 * done: true. Mirrors the contract shape exactly:
 * { summary, strengths[], gaps[], next[] }.
 */
const SECTIONS = [
  { key: 'strengths', title: 'Strengths', dot: 'bg-emerald-400' },
  { key: 'gaps', title: 'Gaps', dot: 'bg-amber-400' },
  { key: 'next', title: 'What to do next', dot: 'bg-indigo-400' },
];

export default function FeedbackCard({ feedback }) {
  if (!feedback) return null;

  return (
    <section
      aria-label="Interview feedback"
      className="animate-rise overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50"
    >
      <div className="border-b border-zinc-800 px-5 py-3.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-400">
          Interview feedback
        </h2>
      </div>

      <div className="space-y-6 px-5 py-5">
        <p className="text-[15px] leading-relaxed text-zinc-200">{feedback.summary}</p>

        {SECTIONS.map(({ key, title, dot }) => {
          const items = Array.isArray(feedback[key]) ? feedback[key] : [];
          if (items.length === 0) return null;

          return (
            <div key={key}>
              <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {title}
              </h3>
              <ul className="space-y-2">
                {items.map((item, i) => (
                  <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-zinc-300">
                    <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
