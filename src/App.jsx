import { useEffect, useMemo, useState } from 'react'

function useBackend() {
  const baseUrl = useMemo(() => import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000', [])
  return { baseUrl }
}

function App() {
  const { baseUrl } = useBackend()
  const [sellerEmail, setSellerEmail] = useState('')
  const [personas, setPersonas] = useState([])
  const [personaKey, setPersonaKey] = useState('')
  const [loading, setLoading] = useState(false)

  const [session, setSession] = useState(null) // holds current session doc
  const [message, setMessage] = useState('')
  const [lastMetrics, setLastMetrics] = useState(null)

  const [history, setHistory] = useState([])
  const [leaderboard, setLeaderboard] = useState([])

  useEffect(() => {
    // load personas
    const load = async () => {
      try {
        const res = await fetch(`${baseUrl}/api/personas`)
        const data = await res.json()
        setPersonas(data)
        if (data.length > 0) setPersonaKey(data[0].key)
      } catch (e) {
        console.error(e)
      }
    }
    load()
  }, [baseUrl])

  const startSession = async () => {
    if (!sellerEmail || !personaKey) return
    setLoading(true)
    try {
      const res = await fetch(`${baseUrl}/api/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seller_email: sellerEmail, persona_key: personaKey }),
      })
      if (!res.ok) throw new Error('Falha ao iniciar sessão')
      const data = await res.json()
      setSession(data)
      setLastMetrics(null)
      setMessage('')
      // preload history and leaderboard
      fetchHistory(sellerEmail)
      fetchLeaderboard('30d')
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!session || !message.trim()) return
    const text = message.trim()
    setMessage('')

    // optimistic UI
    const optimistic = {
      ...session,
      messages: [
        ...(session.messages || []),
        { role: 'seller', text, ts: new Date().toISOString() },
      ],
    }
    setSession(optimistic)

    try {
      const res = await fetch(`${baseUrl}/api/sessions/${session.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error('Erro ao enviar mensagem')
      const data = await res.json()
      setSession(data)
      setLastMetrics(data.last_metrics || null)
    } catch (e) {
      alert(e.message)
    }
  }

  const finishSession = async () => {
    if (!session) return
    try {
      const res = await fetch(`${baseUrl}/api/sessions/${session.id}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('Erro ao finalizar sessão')
      const data = await res.json()
      setSession(data)
      // refresh history and leaderboard
      fetchHistory(sellerEmail)
      fetchLeaderboard('30d')
    } catch (e) {
      alert(e.message)
    }
  }

  const fetchHistory = async (email) => {
    if (!email) return
    try {
      const res = await fetch(`${baseUrl}/api/history?seller_email=${encodeURIComponent(email)}`)
      const data = await res.json()
      setHistory(data)
    } catch (e) {
      console.error(e)
    }
  }

  const fetchLeaderboard = async (period) => {
    try {
      const res = await fetch(`${baseUrl}/api/leaderboard?period=${period}`)
      const data = await res.json()
      setLeaderboard(data)
    } catch (e) {
      console.error(e)
    }
  }

  const currentScore = session?.current_score ? Math.round(session.current_score * 10) / 10 : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="px-6 py-4 border-b bg-white/70 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Plataforma de Treinamento de Vendas com IA</h1>
            <p className="text-slate-600 text-sm">Roleplay com personas, pontuação em tempo real, histórico e ranking</p>
          </div>
          <a href="/test" className="text-sm text-blue-600 hover:underline">Ver status do backend</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Start & settings */}
        <section className="lg:col-span-3 bg-white rounded-xl shadow-sm p-4 border">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Iniciar Treinamento</h2>
          <label className="block text-sm text-slate-700 mb-1">Seu e-mail</label>
          <input
            className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="você@empresa.com"
            value={sellerEmail}
            onChange={(e) => setSellerEmail(e.target.value)}
            onBlur={() => fetchHistory(sellerEmail)}
          />

          <label className="block text-sm text-slate-700 mb-1">Persona</label>
          <select
            className="w-full border rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={personaKey}
            onChange={(e) => setPersonaKey(e.target.value)}
          >
            {personas.map((p) => (
              <option key={p.key} value={p.key}>{p.name}</option>
            ))}
          </select>

          <button
            onClick={startSession}
            disabled={loading || !sellerEmail || !personaKey}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition"
          >
            {loading ? 'Iniciando...' : 'Iniciar Sessão'}
          </button>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Resumo</h3>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>E-mail: {sellerEmail || '—'}</li>
              <li>Persona: {personas.find(p => p.key === personaKey)?.name || '—'}</li>
              <li>Status: {session ? (session.status === 'active' ? 'Em andamento' : 'Finalizada') : '—'}</li>
              <li>Pontuação atual: {currentScore}</li>
            </ul>
          </div>
        </section>

        {/* Middle: Chat */}
        <section className="lg:col-span-6 bg-white rounded-xl shadow-sm p-4 border flex flex-col min-h-[480px]">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Simulação</h2>

          <div className="flex-1 overflow-y-auto border rounded-lg p-3 space-y-3 bg-slate-50">
            {!session && (
              <p className="text-sm text-slate-500">Inicie uma sessão para começar o roleplay.</p>
            )}
            {session?.messages?.map((m, idx) => (
              <div key={idx} className={`max-w-[85%] ${m.role === 'seller' ? 'ml-auto' : ''}`}>
                <div className={`${m.role === 'seller' ? 'bg-blue-600 text-white' : 'bg-white'} border rounded-lg px-3 py-2 shadow-sm`}> 
                  <p className="text-sm whitespace-pre-wrap">{m.text}</p>
                  <p className="text-[10px] mt-1 opacity-70">{m.role === 'seller' ? 'Você' : 'Cliente (IA)'} • {new Date(m.ts).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={session ? 'Digite sua resposta...' : 'Inicie uma sessão'}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              disabled={!session || session.status !== 'active'}
            />
            <button
              onClick={sendMessage}
              disabled={!session || session.status !== 'active' || !message.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-4 rounded-lg"
            >
              Enviar
            </button>
            <button
              onClick={finishSession}
              disabled={!session || session.status !== 'active'}
              className="bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold px-4 rounded-lg"
            >
              Finalizar
            </button>
          </div>

          {lastMetrics && (
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <MetricCard title="Rapport" value={lastMetrics.rapport} />
              <MetricCard title="Objeções" value={lastMetrics.objection} />
              <MetricCard title="Fechamento" value={lastMetrics.closing} />
            </div>
          )}
        </section>

        {/* Right: History & Leaderboard */}
        <section className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-4 border">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Histórico</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {history.length === 0 && (
                <p className="text-sm text-slate-500">Sem registros. Finalize sessões para ver aqui.</p>
              )}
              {history.map((h) => (
                <div key={h.id} className="border rounded-lg p-2">
                  <p className="text-sm font-medium text-slate-800">{h.persona_key}</p>
                  <p className="text-xs text-slate-600">{new Date(h.created_at).toLocaleString()}</p>
                  <p className="text-xs mt-1">Pontuação: <span className="font-semibold">{Math.round(h.final_score * 10) / 10}</span></p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4 border">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-800">Ranking (30d)</h2>
              <button
                className="text-sm text-blue-600 hover:underline"
                onClick={() => fetchLeaderboard('30d')}
              >Atualizar</button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {leaderboard.length === 0 && (
                <p className="text-sm text-slate-500">Sem dados suficientes.</p>
              )}
              {leaderboard.map((r, idx) => (
                <div key={r.seller_email} className="flex items-center justify-between border rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-slate-100 rounded px-2 py-0.5">#{idx + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-800 truncate max-w-[140px]">{r.seller_email}</p>
                      <p className="text-xs text-slate-600">Sessões: {r.sessions}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{r.avg_score}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="text-center text-xs text-slate-500 py-6">
        Conectado a: <span className="font-mono">{baseUrl}</span>
      </footer>
    </div>
  )
}

function MetricCard({ title, value }) {
  return (
    <div className="border rounded-lg p-3 bg-white">
      <p className="text-xs text-slate-600">{title}</p>
      <p className="text-xl font-semibold text-slate-800">{Math.round((value || 0) * 10) / 10}</p>
    </div>
  )
}

export default App
