import { useEffect, useMemo, useState } from 'react'

function useBackend() {
  const baseUrl = useMemo(() => import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000', [])
  return { baseUrl }
}

function App() {
  const { baseUrl } = useBackend()
  const [sellerEmail, setSellerEmail] = useState('')
  const [sellerName, setSellerName] = useState('')
  const [sellerTeam, setSellerTeam] = useState('')
  const [managerMode, setManagerMode] = useState(false)

  const [personas, setPersonas] = useState([])
  const [personaKey, setPersonaKey] = useState('')
  const [loading, setLoading] = useState(false)

  const [session, setSession] = useState(null) // holds current session doc
  const [message, setMessage] = useState('')
  const [lastMetrics, setLastMetrics] = useState(null)

  const [history, setHistory] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [premium, setPremium] = useState(null)

  // scoring weights config (local overrides)
  const [weights, setWeights] = useState({ rapport: 0.3, discovery: 0.2, objection: 0.3, closing: 0.2 })

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

  useEffect(() => {
    if (!sellerEmail) return
    fetchHistory(sellerEmail)
    fetchPremium(sellerEmail)
  }, [sellerEmail])

  const headersWithAuth = () => {
    const headers = { 'Content-Type': 'application/json' }
    if (managerMode && sellerEmail) {
      headers['X-User'] = `${sellerEmail}|manager|${sellerTeam || ''}`
    }
    return headers
  }

  const registerSeller = async () => {
    if (!sellerEmail || !sellerName) return alert('Informe nome e e-mail')
    try {
      const res = await fetch(`${baseUrl}/api/register`, {
        method: 'POST',
        headers: headersWithAuth(),
        body: JSON.stringify({ name: sellerName, email: sellerEmail, team: sellerTeam, role: managerMode ? 'manager' : 'seller' }),
      })
      if (!res.ok) throw new Error('Falha ao registrar')
      alert('Perfil atualizado!')
      fetchHistory(sellerEmail)
      fetchLeaderboard('30d')
      fetchPremium(sellerEmail)
    } catch (e) {
      alert(e.message)
    }
  }

  const loadWeights = async () => {
    try {
      const query = new URLSearchParams({ email: sellerEmail || '', team: sellerTeam || '' })
      const res = await fetch(`${baseUrl}/api/score-config?${query.toString()}`)
      const data = await res.json()
      if (data && data.weights) setWeights(data.weights)
    } catch (e) {
      console.error(e)
    }
  }

  const saveWeights = async (scope) => {
    try {
      const payload = { scope, team: scope === 'team' ? sellerTeam : undefined, email: scope === 'user' ? sellerEmail : undefined, weights }
      const res = await fetch(`${baseUrl}/api/score-config`, {
        method: 'POST',
        headers: headersWithAuth(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Falha ao salvar pesos')
      alert('Pesos salvos!')
    } catch (e) {
      alert(e.message)
    }
  }

  const startSession = async () => {
    if (!sellerEmail || !personaKey) return
    setLoading(true)
    try {
      const res = await fetch(`${baseUrl}/api/sessions/start`, {
        method: 'POST',
        headers: headersWithAuth(),
        body: JSON.stringify({ seller_email: sellerEmail, persona_key: personaKey, weights }),
      })
      if (!res.ok) throw new Error('Falha ao iniciar sessão')
      const data = await res.json()
      setSession(data)
      setLastMetrics(null)
      setMessage('')
      // preload history and leaderboard
      fetchHistory(sellerEmail)
      fetchLeaderboard('30d')
      fetchPremium(sellerEmail)
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
        headers: headersWithAuth(),
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
        headers: headersWithAuth(),
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('Erro ao finalizar sessão')
      const data = await res.json()
      setSession(data)
      // refresh history and leaderboard
      fetchHistory(sellerEmail)
      fetchLeaderboard('30d')
      fetchPremium(sellerEmail)
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
      const res = await fetch(`${baseUrl}/api/leaderboard?period=${period}${sellerTeam ? `&team=${encodeURIComponent(sellerTeam)}` : ''}`)
      const data = await res.json()
      setLeaderboard(data)
    } catch (e) {
      console.error(e)
    }
  }

  const fetchPremium = async (email) => {
    try {
      const res = await fetch(`${baseUrl}/api/premium-status?seller_email=${encodeURIComponent(email)}`)
      const data = await res.json()
      setPremium(data)
    } catch (e) {
      console.error(e)
    }
  }

  const currentScore = session?.current_score ? Math.round(session.current_score * 10) / 10 : 0
  const lastFeedback = history?.[0]?.feedback

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="px-6 py-4 border-b bg-white/70 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Plataforma de Treinamento de Vendas com IA</h1>
            <p className="text-slate-600 text-sm">Roleplay com personas, pontuação em tempo real, histórico, ranking e coaching</p>
          </div>
          <a href="/test" className="text-sm text-blue-600 hover:underline">Ver status do backend</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Start & settings */}
        <section className="lg:col-span-3 bg-white rounded-xl shadow-sm p-4 border space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">Perfil e Sessão</h2>

          <div>
            <label className="block text-sm text-slate-700 mb-1">Seu nome</label>
            <input className="w-full border rounded-lg px-3 py-2" placeholder="Seu nome" value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">Seu e-mail</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder="voce@empresa.com"
              value={sellerEmail}
              onChange={(e) => setSellerEmail(e.target.value)}
              onBlur={() => { fetchHistory(sellerEmail); fetchPremium(sellerEmail); }}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">Time (opcional)</label>
            <input className="w-full border rounded-lg px-3 py-2" placeholder="ex.: Squad Norte" value={sellerTeam} onChange={(e) => setSellerTeam(e.target.value)} />
          </div>

          <div className="flex items-center gap-2">
            <input id="managerMode" type="checkbox" checked={managerMode} onChange={(e) => setManagerMode(e.target.checked)} />
            <label htmlFor="managerMode" className="text-sm text-slate-700">Modo gerente (permite salvar pesos globais/de time)</label>
          </div>

          <button onClick={registerSeller} className="w-full bg-slate-700 hover:bg-slate-800 text-white font-semibold py-2 rounded-lg">Salvar Perfil</button>

          <div>
            <label className="block text-sm text-slate-700 mb-1">Persona</label>
            <select
              className="w-full border rounded-lg px-3 py-2 mb-1"
              value={personaKey}
              onChange={(e) => setPersonaKey(e.target.value)}
            >
              {personas.map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500">Perfil DISC e gatilhos já parametrizados.</p>
          </div>

          <div className="mt-2">
            <button
              onClick={startSession}
              disabled={loading || !sellerEmail || !personaKey}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition"
            >
              {loading ? 'Iniciando...' : 'Iniciar Sessão'}
            </button>
          </div>

          <div className="mt-3">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Resumo</h3>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>E-mail: {sellerEmail || '—'}</li>
              <li>Time: {sellerTeam || '—'}</li>
              <li>Persona: {personas.find(p => p.key === personaKey)?.name || '—'}</li>
              <li>Status: {session ? (session.status === 'active' ? 'Em andamento' : 'Finalizada') : '—'}</li>
              <li>Pontuação atual: {currentScore}</li>
            </ul>
          </div>

          <div className="mt-3 border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">Pesos da Pontuação</h3>
              <button className="text-xs text-blue-600" onClick={loadWeights}>Carregar</button>
            </div>
            <WeightInput label="Rapport" value={weights.rapport} onChange={(v) => setWeights({ ...weights, rapport: v })} />
            <WeightInput label="Descoberta" value={weights.discovery} onChange={(v) => setWeights({ ...weights, discovery: v })} />
            <WeightInput label="Objeções" value={weights.objection} onChange={(v) => setWeights({ ...weights, objection: v })} />
            <WeightInput label="Fechamento" value={weights.closing} onChange={(v) => setWeights({ ...weights, closing: v })} />
            <div className="grid grid-cols-3 gap-2 mt-2">
              <button className="text-xs bg-slate-100 rounded px-2 py-1" onClick={() => saveWeights('user')}>Salvar (Usuário)</button>
              <button className="text-xs bg-slate-100 rounded px-2 py-1" onClick={() => saveWeights('team')}>Salvar (Time)</button>
              <button className="text-xs bg-slate-100 rounded px-2 py-1" onClick={() => saveWeights('global')}>Salvar (Global)</button>
            </div>
          </div>

          {premium && (
            <div className={`mt-3 rounded-lg border p-3 ${premium.eligible ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className="text-sm font-semibold">Status Premium</p>
              {premium.eligible ? (
                <p className="text-sm text-emerald-700">Parabéns! Agendamentos premium liberados. Média: <b>{premium.average}</b> nos últimos {premium.last_n} roleplays.</p>
              ) : (
                <p className="text-sm text-amber-700">Faltam alguns pontos para liberar. {premium.reason || ''}</p>
              )}
            </div>
          )}
        </section>

        {/* Middle: Chat */}
        <section className="lg:col-span-6 bg-white rounded-xl shadow-sm p-4 border flex flex-col min-h-[520px]">
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
            <div className="mt-3 grid grid-cols-4 gap-3 text-center">
              <MetricCard title="Rapport" value={lastMetrics.rapport} />
              <MetricCard title="Descoberta" value={lastMetrics.discovery} />
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

            {lastFeedback && (
              <div className="mt-3 border-t pt-3">
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Último Feedback</h3>
                <p className="text-xs text-slate-700 whitespace-pre-wrap bg-slate-50 p-2 rounded-lg border">{lastFeedback}</p>
              </div>
            )}
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

function WeightInput({ label, value, onChange }) {
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>{Math.round((value || 0) * 100)}%</span>
      </div>
      <input type="range" min="0" max="1" step="0.05" value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full" />
    </div>
  )
}

export default App
