import { useState } from 'react';
import { postInterview, newSessionId } from './api.js';

/**
 * SCAFFOLD placeholder. The real chat UI — message history, candidate picker,
 * and the feedback panel rendered on done:true — lands in step 6.
 * This version exists so the client build and the CORS path to the backend
 * can be verified before any UI work.
 */
export default function App() {
  const [status, setStatus] = useState('idle');
  const [output, setOutput] = useState(null);

  async function ping() {
    setStatus('calling');
    try {
      const data = await postInterview({
        sessionId: newSessionId(),
        candidate: { member: { name: 'Scaffold Check' }, missions: [], signals: {} },
      });
      setOutput(data);
      setStatus('ok');
    } catch (err) {
      setOutput({ error: err.message, code: err.code });
      setStatus('error');
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold">AI Interview Agent</h1>
        <p className="text-slate-400 text-sm">
          Scaffold. Chat UI arrives in step 6 — this button just proves the client can
          reach <code className="text-slate-300">POST /api/interview</code>.
        </p>
        <button
          onClick={ping}
          disabled={status === 'calling'}
          className="rounded-lg bg-indigo-500 px-4 py-2 font-medium hover:bg-indigo-400 disabled:opacity-50"
        >
          {status === 'calling' ? 'Calling…' : 'Test backend connection'}
        </button>
        {output && (
          <pre className="rounded-lg bg-slate-900 border border-slate-800 p-4 text-xs overflow-x-auto">
            {JSON.stringify(output, null, 2)}
          </pre>
        )}
      </div>
    </main>
  );
}
