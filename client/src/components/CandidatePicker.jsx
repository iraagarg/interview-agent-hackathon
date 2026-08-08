/**
 * Start screen. The contract requires a candidate object on the first request,
 * so one has to be chosen before the interview can begin.
 */
function summarise(candidate) {
  const missions = candidate.missions || [];
  const skipped = missions.filter((m) => m.skipped).length;
  const failed = missions.filter((m) => m.passed === false).length;
  const retried = missions.filter((m) => m.passed && (m.attempts || 1) >= 3).length;

  const parts = [];
  if (skipped) parts.push(`${skipped} skipped`);
  if (failed) parts.push(`${failed} failed`);
  if (retried) parts.push(`${retried} needed 3+ tries`);
  return parts.length ? parts.join(' · ') : 'clean record';
}

export default function CandidatePicker({ candidates, onSelect, disabled }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-5 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          AI Interview Agent
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-zinc-400">
          A technical interview grounded in the candidate&apos;s real progress through the
          31-day AI cohort. Pick someone to interview — the questions are chosen from the
          days they skipped, failed, or struggled with.
        </p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        {candidates.map((candidate) => {
          const m = candidate.member;
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(candidate)}
              className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-left transition
                         hover:border-indigo-500/60 hover:bg-zinc-900
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                         disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-zinc-100">{m.name}</span>
                <span className="shrink-0 text-xs text-zinc-500">{m.yearsExperience}y</span>
              </div>
              <div className="mt-0.5 truncate text-sm text-zinc-400">{m.jobRole}</div>
              <div className="mt-2 text-xs text-zinc-500 group-hover:text-zinc-400">
                {summarise(candidate)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
