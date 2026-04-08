import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getHomeState, submitOrder, castVote, getPersonnel, getMyOrder } from '../api'

const spicyLevelLabels = ['', '微辣', '中辣', '重辣']

function StatusBadge({ mode }) {
  const normalized = mode === 'idle' ? 'idle' : mode.includes('点餐') && mode.includes('投票') ? 'both' : mode.includes('点餐') ? 'order' : mode.includes('投票') ? 'vote' : 'idle'
  const map = {
    order: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    vote: 'bg-violet-50 text-violet-700 border-violet-200',
    both: 'bg-amber-50 text-amber-700 border-amber-200',
    idle: 'bg-slate-50 text-slate-600 border-slate-200',
  }
  const text = mode === 'idle' ? '空闲中' : mode
  return <span className={`inline-flex items-center px-3 py-1 rounded-full border text-sm font-medium ${map[normalized] || map.idle}`}>{text}</span>
}

function PageTabs({ current }) {
  return (
    <div className="inline-flex flex-row items-center p-1 rounded-2xl bg-white border border-slate-200 whitespace-nowrap">
      <Link to="/" className={`px-4 py-2 rounded-xl text-sm font-medium transition ${current === 'order' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>点餐</Link>
      <Link to="/vote" className={`px-4 py-2 rounded-xl text-sm font-medium transition ${current === 'vote' ? 'bg-violet-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>投票</Link>
    </div>
  )
}

export default function OrderPage({ defaultTab = 'order' }) {
  const currentTab = defaultTab === 'vote' ? 'vote' : 'order'
  const [selectedPerson, setSelectedPerson] = useState('')
  const [personnelList, setPersonnelList] = useState([])
  const [homeState, setHomeState] = useState({ mode: 'idle' })
  const [selectedDishId, setSelectedDishId] = useState('')
  const [selectedPizzaId, setSelectedPizzaId] = useState('')
  const [remark, setRemark] = useState('')
  const [spicyLevel, setSpicyLevel] = useState(1)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [error, setError] = useState('')

  const isOrderMode = !!homeState.order
  const isVoteMode = !!homeState.vote
  const showingOrderTab = currentTab === 'order'
  const showingVoteTab = currentTab === 'vote'
  const menuList = homeState.order?.menu || []
  const voteSessions = homeState.vote?.votes || []
  const activeVote = voteSessions[0]
  const canOperate = (showingOrderTab && isOrderMode) || (showingVoteTab && isVoteMode)

  const fetchHomeState = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getHomeState()
      setHomeState(res.data || { mode: 'idle' })
    } catch {
      setError('加载首页状态失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPersonnel = useCallback(async () => {
    try {
      const res = await getPersonnel()
      setPersonnelList(res.data || [])
    } catch {}
  }, [])

  const loadExistingOrder = useCallback(async (person) => {
    if (!person || !isOrderMode) return
    try {
      const res = await getMyOrder(person)
      const existing = res.data
      if (existing?.items?.length > 0) {
        const firstItem = existing.items[0]
        setSelectedDishId(String(firstItem.menu_id || ''))
        setRemark(existing.remark || '')
        if (firstItem.spicy_level) setSpicyLevel(firstItem.spicy_level)
      }
    } catch {}
  }, [isOrderMode])

  useEffect(() => { fetchHomeState() }, [fetchHomeState])
  useEffect(() => { fetchPersonnel() }, [fetchPersonnel])

  const selectedDish = useMemo(() => menuList.find(m => String(m.id) === String(selectedDishId)), [menuList, selectedDishId])
  const selectedPizza = useMemo(() => activeVote?.pizzas?.find(p => String(p.id) === String(selectedPizzaId)), [activeVote, selectedPizzaId])

  const handlePersonChange = async (e) => {
    const person = e.target.value
    setSelectedPerson(person)
    setSelectedDishId('')
    setSelectedPizzaId('')
    setRemark('')
    setSpicyLevel(1)
    setError('')
    if (person) await loadExistingOrder(person)
  }

  const handleSubmit = async () => {
    if (!selectedPerson.trim()) return setError('请选择您的姓名')

    if (showingOrderTab) {
      if (!selectedDishId) return setError('请选择一道菜品')
      setSubmitting(true)
      setError('')
      try {
        await submitOrder({
          person: selectedPerson.trim(),
          remark: remark.trim(),
          items: [{ menu_id: Number(selectedDishId), quantity: 1, ...(selectedDish?.spicy > 0 ? { spicy_level: spicyLevel } : {}) }],
        })
        setSuccessMsg(`${selectedPerson} 已完成本次点餐：${selectedDish?.name || ''}${selectedDish?.spicy > 0 ? `（${spicyLevelLabels[spicyLevel]}）` : ''}${remark.trim() ? `；备注：${remark.trim()}` : ''}`)
        setSuccess(true)
      } catch (e) {
        setError(e.response?.data?.error || '提交订单失败')
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (showingVoteTab) {
      if (!selectedPizzaId || !activeVote) return setError('请选择一个投票选项')
      setSubmitting(true)
      setError('')
      try {
        await castVote({ vote_session_id: activeVote.id, person: selectedPerson.trim(), pizza_id: Number(selectedPizzaId) })
        setSuccessMsg(`${selectedPerson} 已完成本次投票：${selectedPizza?.name || ''}`)
        setSuccess(true)
      } catch (e) {
        setError(e.response?.data?.error || '投票失败')
      } finally {
        setSubmitting(false)
      }
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-12 w-12 border-4 border-amber-300 border-t-orange-500"></div></div>
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white/90 backdrop-blur rounded-3xl border border-white shadow-xl shadow-orange-100 p-8 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-3xl font-bold text-slate-800 mb-2">{showingVoteTab ? '投票成功' : '点餐成功'}</h2>
          <p className="text-slate-500 mb-6">{successMsg}</p>
          <div className="bg-slate-50 rounded-2xl p-4 text-left text-sm text-slate-600 mb-6">
            <div>姓名：<span className="font-semibold text-slate-800">{selectedPerson}</span></div>
            <div>当前活动：<span className="font-semibold text-slate-800">{homeState.title || (showingVoteTab ? '投票' : '点餐')}</span></div>
            <div>你的选择：<span className="font-semibold text-slate-800">{showingVoteTab ? selectedPizza?.name : selectedDish?.name}</span></div>
            {showingOrderTab && remark.trim() && <div>备注：<span className="font-semibold text-slate-800">{remark.trim()}</span></div>}
          </div>
          <button onClick={() => { setSuccess(false); setSelectedDishId(''); setSelectedPizzaId(''); setRemark(''); fetchHomeState() }} className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-2xl font-medium transition shadow-lg shadow-orange-200">返回继续处理</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 backdrop-blur shadow-xl shadow-orange-100 p-6 md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(251,191,36,0.18),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(249,115,22,0.12),_transparent_30%)]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-400 mb-2">当前活动</div>
            <h1 className="text-3xl font-bold text-slate-900 mb-3">{homeState.title || '点餐 / 投票'}</h1>
            <p className="text-slate-500 max-w-xl">请选择姓名后完成当前活动。本页会根据后台状态显示当前可执行的流程。</p>
            {homeState.order?.deadline_at && showingOrderTab && <p className="mt-3 text-sm text-orange-600">⏰ 截止时间：{new Date(homeState.order.deadline_at).toLocaleString()}</p>}
            {homeState.vote?.deadline_at && showingVoteTab && <p className="mt-3 text-sm text-orange-600">⏰ 截止时间：{new Date(homeState.vote.deadline_at).toLocaleString()}</p>}
          </div>
          <div className="flex flex-col gap-3 lg:items-end lg:text-right shrink-0">
            <StatusBadge mode={homeState.mode} />
            <PageTabs current={currentTab} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-1">
        <div className="bg-white rounded-3xl border border-white shadow-lg shadow-slate-100 p-6">
          <div className="text-sm font-semibold text-slate-500 mb-3">第一步 · 选择姓名</div>
          <select value={selectedPerson} onChange={handlePersonChange} disabled={submitting} className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 outline-none transition text-slate-700 bg-white disabled:opacity-50">
            <option value="" hidden>请选择你的姓名...</option>
            {personnelList.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
          <p className="mt-3 text-xs text-slate-400">选择后会自动加载你在当前活动中的已有记录（如果存在）。</p>
        </div>
      </section>

      {showingOrderTab && isOrderMode && (
        <section className="bg-white rounded-3xl border border-white shadow-lg shadow-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-slate-500">第二步 · 选择菜品</div>
              <div className="text-xs text-slate-400 mt-1">使用下拉框选择菜品，随后设置辣度和备注</div>
            </div>
            {selectedDish && <div className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-sm font-medium border border-amber-200">已选：{selectedDish.name}</div>}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="text-sm font-semibold text-slate-600 mb-2 block">菜品</label>
            <select value={selectedDishId} onChange={e => setSelectedDishId(e.target.value)} className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm outline-none focus:border-amber-400">
              <option value="">请选择菜品...</option>
              {menuList.map(item => <option key={item.id} value={item.id}>{item.name}{item.spicy > 0 ? '（支持辣度）' : ''}</option>)}
            </select>
          </div>
          {selectedDish && selectedDish.spicy > 0 && (
            <div className="mt-4 rounded-2xl bg-white border border-amber-100 px-4 py-3 flex items-center gap-3">
              <span className="text-sm text-slate-500">辣度</span>
              <select value={spicyLevel} onChange={e => setSpicyLevel(parseInt(e.target.value))} className="text-sm px-3 py-2 rounded-xl border border-slate-200 focus:border-amber-400 outline-none">
                {[1, 2, 3].map(level => <option key={level} value={level}>{'🌶️'.repeat(level)} {spicyLevelLabels[level]}</option>)}
              </select>
            </div>
          )}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-600 mb-2">第三步 · 备注（可选）</div>
            <textarea value={remark} onChange={e => setRemark(e.target.value)} rows={3} maxLength={120} placeholder="例如：少饭、不要葱、打包分开..." className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400" />
          </div>
        </section>
      )}

      {showingVoteTab && isVoteMode && activeVote && (
        <section className="bg-white rounded-3xl border border-white shadow-lg shadow-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-slate-500">第三步 · 选择投票项</div>
              <div className="text-xs text-slate-400 mt-1">每人只能选 1 项，确认后计入当前活动</div>
            </div>
            {selectedPizza && <div className="px-3 py-1 rounded-full bg-violet-50 text-violet-700 text-sm font-medium border border-violet-200">已选：{selectedPizza.name}</div>}
          </div>
          <div className="space-y-3">
            {(activeVote.pizzas || []).map(pizza => {
              const isSelected = String(selectedPizzaId) === String(pizza.id)
              return (
                <div key={pizza.id} onClick={() => setSelectedPizzaId(isSelected ? '' : String(pizza.id))} className={`rounded-3xl border p-5 transition cursor-pointer ${isSelected ? 'border-violet-400 ring-4 ring-violet-100 shadow-lg shadow-violet-100 bg-violet-50/40' : 'border-slate-200 hover:border-violet-200 hover:shadow-md bg-white'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div><div className="font-semibold text-slate-800 text-lg">{pizza.name}</div><div className="mt-1 text-xs text-slate-400">建议分食人数：{pizza.servings} 人</div></div>
                    <div className="flex items-center gap-3"><span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs">{pizza.servings}人/个</span><div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-violet-500 bg-violet-500 text-white' : 'border-slate-300 text-transparent'}`}>✓</div></div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {!canOperate && (
        <section className="bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm p-10 text-center text-slate-400">
          <div className="text-5xl mb-3">🕐</div>
          <div className="text-lg font-semibold text-slate-700 mb-1">{showingOrderTab ? '当前没有进行中的点餐' : '当前没有进行中的投票'}</div>
          <p>{showingOrderTab ? '如需参与投票，请切换到“投票”标签页。' : '如需点餐，请切换到“点餐”标签页。'}</p>
        </section>
      )}

      {error && <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-sm text-center shadow-sm">⚠️ {error}</div>}

      {canOperate && (
        <section className="sticky bottom-4 z-10">
          <div className="bg-white/90 backdrop-blur border border-white rounded-3xl shadow-xl shadow-orange-100 p-4 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
            <div className="text-sm text-slate-500">
              {selectedPerson ? <>当前操作人：<span className="font-semibold text-slate-800">{selectedPerson}</span></> : '请先选择姓名'}
              {showingOrderTab && selectedDish && <> · 菜品：<span className="font-semibold text-slate-800">{selectedDish.name}</span></>}
              {showingVoteTab && selectedPizza && <> · 选项：<span className="font-semibold text-slate-800">{selectedPizza.name}</span></>}
            </div>
            <button onClick={handleSubmit} disabled={submitting || (!selectedDishId && !selectedPizzaId)} className="w-full md:w-auto min-w-[180px] px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-2xl shadow-lg shadow-orange-200 disabled:opacity-50 disabled:cursor-not-allowed transition">
              {submitting ? '提交中...' : showingVoteTab ? '确认投票' : selectedDish ? '确认点餐' : '请选择后提交'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
