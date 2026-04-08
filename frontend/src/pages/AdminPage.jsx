import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  adminLogin,
  adminGetMenu,
  getPersonnel,
  importMenu,
  deleteMenuItem,
  adminGetOrders,
  exportOrders,
  exportRound,
  setAdminToken,
  downloadTemplate,
  createVoteSession,
  deleteVoteSession,
  importPersonnel,
  getParticipationStatus,
  getVoteSessions,
  endActiveRound,
  getRounds,
  getRoundDetail,
  deleteRound,
} from '../api'

const spicyLevelLabels = ['', '微辣', '中辣', '重辣']

function TabSwitch({ current }) {
  return (
    <div className="inline-flex p-1 rounded-2xl bg-white border border-slate-200 shadow-sm">
      <Link to="/admin/people" className={`px-4 py-2 rounded-xl text-sm font-medium transition ${current === 'people' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>人员管理</Link>
      <Link to="/admin" className={`px-4 py-2 rounded-xl text-sm font-medium transition ${current === 'order' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>点餐</Link>
      <Link to="/admin/vote" className={`px-4 py-2 rounded-xl text-sm font-medium transition ${current === 'vote' ? 'bg-violet-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>投票</Link>
    </div>
  )
}

function ActivityCard({ participation, onEnd, onRefresh }) {
  if (!participation) return null
  const modeClass = participation.mode === 'order' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : participation.mode === 'vote' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-slate-50 text-slate-600 border-slate-200'
  const modeText = participation.mode === 'order' ? '点餐进行中' : participation.mode === 'vote' ? '投票进行中' : '空闲中'
  const endText = participation.mode === 'order' ? '结束本次点单' : participation.mode === 'vote' ? '结束本次投票' : '结束当前活动'
  const percent = participation.total_count ? (participation.done_count / participation.total_count) * 100 : 0
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/85 backdrop-blur shadow-xl shadow-orange-100 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm text-slate-400 mb-2">当前活动</div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{participation.title || '当前活动'}</h2>
          <div className="flex flex-wrap gap-2">
            <span className={`px-3 py-1 rounded-full text-sm border ${modeClass}`}>{modeText}</span>
            <span className="px-3 py-1 rounded-full text-sm border bg-amber-50 text-amber-700 border-amber-200">已参与 {participation.done_count}/{participation.total_count}</span>
          </div>
        </div>
        <div className="md:text-right">
          <div className="text-sm text-slate-400 mb-2">参与进度</div>
          <div className="w-full md:w-64 h-3 rounded-full bg-slate-100 overflow-hidden mb-2"><div className="h-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${percent}%` }} /></div>
          <div className="text-xs text-slate-500">还有 {Math.max((participation.total_count || 0) - (participation.done_count || 0), 0)} 人未参与</div>
        </div>
      </div>
      {participation.pending?.length > 0 && <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">{participation.pending.map(name => <span key={name} className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-sm border border-amber-200">{name}</span>)}</div>}
      <div className="mt-5 flex flex-wrap gap-3"><button onClick={onEnd} className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition text-sm">{endText}</button><button onClick={onRefresh} className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition text-sm text-slate-600">刷新状态</button></div>
    </div>
  )
}

function HistoryBlock({ rounds, currentTab, roundSearch, setRoundSearch, fetchRounds, onView, onExport, onDelete }) {
  const filtered = rounds.filter(round => {
    const keyword = roundSearch.trim().toLowerCase()
    const modeOk = currentTab === 'people' ? true : round.mode === currentTab
    const text = `${round.title || ''} #${round.id}`.toLowerCase()
    return modeOk && (!keyword || text.includes(keyword))
  })
  return (
    <div className="bg-white rounded-3xl shadow-lg shadow-slate-100 border border-white overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between"><h3 className="font-semibold text-slate-700">🕘 最近历史</h3><button onClick={fetchRounds} className="text-sm text-brand hover:text-brand-dark transition">↻ 刷新</button></div>
      <div className="px-5 py-4 border-b border-slate-100"><input value={roundSearch} onChange={e => setRoundSearch(e.target.value)} placeholder="搜索标题或轮次ID" className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm" /></div>
      {filtered.length === 0 ? <div className="py-10 text-center text-slate-400">暂无匹配历史</div> : <div className="divide-y divide-slate-100">{filtered.filter(round => !round.active).slice(0, 5).map(round => <div key={round.id} className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition"><div><div className="font-medium text-slate-800">{round.title || (round.mode === 'order' ? '点餐' : '投票')} <span className="text-xs text-slate-400 ml-2">#{round.id}</span></div><div className="text-xs text-slate-400 mt-1">{new Date(round.created_at).toLocaleString()}</div></div><div className="text-right"><div className="flex flex-wrap gap-2 justify-end mb-1"><span className={`px-2 py-1 rounded-full text-xs border ${round.mode === 'order' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>{round.mode === 'order' ? '点餐' : '投票'}</span><button onClick={() => onView(round.id)} className="text-xs text-brand hover:text-brand-dark transition">查看详情</button>{round.mode === currentTab && <button onClick={() => onExport(round.id)} className="text-xs text-orange-500 hover:text-orange-600 transition">导出</button>}<button onClick={() => onDelete(round.id)} className="text-xs text-red-500 hover:text-red-600 transition">删除</button></div><div className="text-sm text-slate-600">参与 {round.count} 人</div></div></div>)}</div>}
    </div>
  )
}

function RoundDetailModal({ roundDetail, onClose }) {
  if (!roundDetail) return null
  return <div className="bg-white rounded-3xl shadow-lg shadow-slate-100 border border-white p-5"><div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-slate-700">📚 轮次详情：{roundDetail.round?.title || `#${roundDetail.round?.id}`}</h3><button onClick={onClose} className="text-sm text-slate-400">关闭</button></div>{roundDetail.round?.mode === 'order' ? <div className="space-y-3">{(roundDetail.orders || []).map(order => <div key={order.id} className="rounded-2xl border border-slate-200 p-4"><div className="font-medium text-slate-800">{order.person}</div><div className="mt-2 text-sm text-slate-600">{(order.items || []).map((item, idx) => <div key={idx}>{item.menu?.name} × {item.quantity} {item.spicy_level > 0 ? `· ${spicyLevelLabels[item.spicy_level]}` : ''}</div>)}</div></div>)}</div> : <div className="space-y-3">{(roundDetail.vote_sessions || []).map(vs => <div key={vs.id} className="rounded-2xl border border-slate-200 p-4"><div className="font-medium text-slate-800 mb-2">{vs.title}</div>{(vs.votes || []).map((v, idx) => <div key={idx} className="text-sm text-slate-600">{v.person} → {v.pizza?.name || `选项#${v.pizza_id}`}</div>)}</div>)}</div>}</div>
}

export default function AdminPage({ defaultTab = 'order' }) {
  const currentTab = defaultTab === 'people' ? 'people' : defaultTab === 'vote' ? 'vote' : 'order'
  const [isLogin, setIsLogin] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [menuList, setMenuList] = useState([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [orders, setOrders] = useState(null)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importingPersonnel, setImportingPersonnel] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [expandedItems, setExpandedItems] = useState({})
  const [voteSessions, setVoteSessions] = useState([])
  const [voteLoading, setVoteLoading] = useState(false)
  const [voteTitle, setVoteTitle] = useState('')
  const [votePizzas, setVotePizzas] = useState([{ name: '', servings: 4 }])
  const [creatingVote, setCreatingVote] = useState(false)
  const [expandedVotes, setExpandedVotes] = useState({})
  const [participation, setParticipation] = useState(null)
  const [rounds, setRounds] = useState([])
  const [roundDetail, setRoundDetail] = useState(null)
  const [personnelOptions, setPersonnelOptions] = useState([])
  const [roundSearch, setRoundSearch] = useState('')
  const [showGuide, setShowGuide] = useState(false)

  const fetchMenu = useCallback(async () => { setMenuLoading(true); try { setMenuList((await adminGetMenu()).data || []) } catch { setMenuList([]) } finally { setMenuLoading(false) } }, [])
  const fetchOrders = useCallback(async () => { setOrdersLoading(true); try { setOrders((await adminGetOrders()).data || []) } catch { setOrders([]) } finally { setOrdersLoading(false) } }, [])
  const fetchVotes = useCallback(async () => { setVoteLoading(true); try { setVoteSessions((await getVoteSessions()).data || []) } catch { setVoteSessions([]) } finally { setVoteLoading(false) } }, [])
  const fetchParticipation = useCallback(async () => {
    try { setParticipation((await getParticipationStatus(currentTab === 'people' ? '' : currentTab)).data) } catch {}
  }, [currentTab])
  const fetchRounds = useCallback(async () => { try { setRounds((await getRounds()).data || []) } catch { setRounds([]) } }, [])
  const fetchPersonnelOptions = useCallback(async () => { try { setPersonnelOptions((await getPersonnel()).data || []) } catch { setPersonnelOptions([]) } }, [])
  const refreshAll = useCallback(() => { fetchMenu(); fetchOrders(); fetchVotes(); fetchParticipation(); fetchRounds(); fetchPersonnelOptions() }, [fetchMenu, fetchOrders, fetchVotes, fetchParticipation, fetchRounds, fetchPersonnelOptions])

  useEffect(() => { const saved = localStorage.getItem('admin_token'); if (saved) { setAdminToken(saved); setIsLogin(true); refreshAll() } }, [refreshAll])

  const handleLogin = async () => { if (!password.trim()) return; setLoginError(''); try { const token = (await adminLogin(password.trim())).data.token; setAdminToken(token); localStorage.setItem('admin_token', token); setIsLogin(true); refreshAll() } catch (e) { setLoginError(e.response?.data?.error || '登录失败') } }
  const handleLogout = () => { setAdminToken(''); localStorage.removeItem('admin_token'); setIsLogin(false) }
  const handleImport = async (e) => { const file = e.target.files?.[0]; if (!file) return; setImporting(true); setErrorMsg(''); setSuccessMsg(''); try { await importMenu(file, ''); setSuccessMsg('菜单导入成功'); refreshAll() } catch (err) { setErrorMsg(err.response?.data?.error || '导入失败') } finally { setImporting(false); e.target.value = '' } }
  const handlePersonnelImport = async (e) => { const file = e.target.files?.[0]; if (!file) return; setImportingPersonnel(true); setErrorMsg(''); setSuccessMsg(''); try { await importPersonnel(file); setSuccessMsg('人员导入成功'); fetchPersonnelOptions() } catch (err) { setErrorMsg(err.response?.data?.error || '导入失败') } finally { setImportingPersonnel(false); e.target.value = '' } }
  const handleDeleteMenu = async (id, name) => { if (!confirm(`确认删除「${name}」？`)) return; try { await deleteMenuItem(id); refreshAll() } catch { setErrorMsg('删除失败') } }
  const handleCreateVote = async () => { if (!voteTitle.trim()) return setErrorMsg('请输入投票标题'); const valid = votePizzas.filter(p => p.name.trim()); if (valid.length < 2) return setErrorMsg('至少两个选项'); setCreatingVote(true); try { await createVoteSession({ title: voteTitle.trim(), deadline_at: '', pizzas: valid.map(p => ({ name: p.name.trim(), servings: p.servings })) }); setSuccessMsg('投票创建成功'); setVoteTitle(''); setVotePizzas([{ name: '', servings: 4 }]); refreshAll() } catch (e) { setErrorMsg(e.response?.data?.error || '创建失败') } finally { setCreatingVote(false) } }
  const handleDeleteVote = async (id, title) => { if (!confirm(`确认删除投票「${title}」？`)) return; try { await deleteVoteSession(id); refreshAll() } catch { setErrorMsg('删除失败') } }
  const handleEndRound = async () => { if (!confirm('确认结束当前活动？')) return; try { await endActiveRound(currentTab === 'people' ? '' : currentTab); refreshAll() } catch { setErrorMsg('结束失败') } }
  const handleViewRound = async (id) => { try { setRoundDetail((await getRoundDetail(id)).data) } catch { setErrorMsg('详情加载失败') } }
  const handleExportCurrent = async (mode) => { try { const res = await exportOrders(mode); const url = URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = `${mode === 'vote' ? '投票' : '点餐'}_${new Date().toLocaleDateString()}.html`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url) } catch { setErrorMsg('导出失败') } }
  const handleExportHistory = async (id) => { try { const res = await exportRound(id); const url = URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = `历史_${id}.html`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url) } catch { setErrorMsg('导出失败') } }
  const handleDeleteRound = async (id) => { if (!confirm(`确认删除历史 #${id}？`)) return; try { await deleteRound(id); setSuccessMsg(`已删除历史 #${id}`); refreshAll() } catch (e) { setErrorMsg(e.response?.data?.error || '删除历史失败') } }
  const addPizzaOption = () => setVotePizzas(prev => [...prev, { name: '', servings: 4 }])
  const removePizzaOption = (idx) => setVotePizzas(prev => prev.filter((_, i) => i !== idx))
  const updatePizzaOption = (idx, field, value) => setVotePizzas(prev => prev.map((p, i) => i === idx ? { ...p, [field]: field === 'servings' ? parseInt(value) || 1 : value } : p))
  const toggleExpand = (name) => setExpandedItems(prev => ({ ...prev, [name]: !prev[name] }))
  const toggleVoteExpand = (id) => setExpandedVotes(prev => ({ ...prev, [id]: !prev[id] }))

  const orderSummary = (() => {
    if (!orders?.length) return []
    const map = {}
    orders.forEach(o => (o.items || []).forEach(item => {
      const name = item.menu?.name || '未知菜品'
      if (!map[name]) map[name] = { name, total: 0, spicyBreakdown: {}, people: [] }
      map[name].total += item.quantity || 0
      map[name].spicyBreakdown[item.spicy_level || 0] = (map[name].spicyBreakdown[item.spicy_level || 0] || 0) + (item.quantity || 0)
      map[name].people.push({ person: o.person, quantity: item.quantity || 0, spicy_level: item.spicy_level || 0 })
    }))
    return Object.values(map)
  })()

  if (!isLogin) return <div className="flex items-center justify-center py-20"><div className="bg-white rounded-3xl shadow-xl shadow-orange-100 border border-white p-8 w-full max-w-sm"><div className="text-center mb-6"><div className="text-4xl mb-2">🔐</div><h2 className="text-xl font-bold text-slate-800">管理员登录</h2></div><input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="请输入管理密码..." className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-brand outline-none transition mb-4" />{loginError && <p className="text-red-500 text-sm mb-3 text-center">{loginError}</p>}<button onClick={handleLogin} className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-2xl transition">登录</button></div></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <TabSwitch current={currentTab} />
        <div className="flex items-center gap-3"><button onClick={() => setShowGuide(v => !v)} className="px-3 py-1.5 rounded-xl text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition">? 使用教程</button><button onClick={handleLogout} className="text-sm text-slate-400 hover:text-slate-600 transition">退出登录</button></div>
      </div>
      {errorMsg && <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-sm">⚠️ {errorMsg}</div>}
      {successMsg && <div className="p-3 bg-green-50 border border-green-200 text-green-600 rounded-2xl text-sm">✅ {successMsg}</div>}
      {showGuide && <div className="bg-white rounded-3xl shadow-lg shadow-slate-100 border border-white p-5"><h3 className="font-semibold text-slate-700 mb-3">📘 使用教程</h3><div className="grid gap-4 md:grid-cols-3 text-sm text-slate-600"><div className="rounded-2xl bg-slate-50 border border-slate-200 p-4"><div className="font-semibold text-slate-800 mb-2">1. 人员管理</div><p>先导入人员名单，保证点餐和投票使用同一批人。</p></div><div className="rounded-2xl bg-slate-50 border border-slate-200 p-4"><div className="font-semibold text-slate-800 mb-2">2. 发布活动</div><p>在点餐页导入菜单，在投票页创建投票，两个活动可同时存在。</p></div><div className="rounded-2xl bg-slate-50 border border-slate-200 p-4"><div className="font-semibold text-slate-800 mb-2">3. 导出结果</div><p>点餐和投票分别导出自己的 HTML 结果，历史也可单独查看。</p></div></div></div>}
      {currentTab !== 'people' && <ActivityCard participation={participation} onEnd={handleEndRound} onRefresh={refreshAll} />}

      {currentTab === 'people' && <div className="bg-white rounded-3xl shadow-lg shadow-slate-100 border border-white p-5"><h3 className="font-semibold text-slate-700 mb-3">👤 人员管理</h3><div className="flex flex-col gap-3"><label className="w-full"><input type="file" accept=".csv" onChange={handlePersonnelImport} disabled={importingPersonnel} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-brand-light file:text-brand-dark hover:file:bg-brand/30 cursor-pointer disabled:opacity-50" /></label>{importingPersonnel && <span className="text-sm text-slate-400">导入中...</span>}<div className="flex gap-3 flex-wrap"><button onClick={() => handleDownloadTemplate('personnel')} style={{ backgroundColor: '#F0FFF0' }} className="px-4 py-2 text-sm text-slate-600 rounded-xl border border-slate-200 transition">下载人员模板</button><button onClick={fetchPersonnelOptions} style={{ backgroundColor: '#F0FFFF' }} className="px-4 py-2 text-sm text-slate-600 rounded-xl border border-slate-200 transition">刷新名单</button></div></div><div className="mt-4 flex flex-wrap gap-2">{personnelOptions.map(p => <span key={p.id} className="px-3 py-1 bg-slate-50 text-slate-700 rounded-full text-sm border border-slate-200">{p.name}</span>)}</div></div>}

      {currentTab === 'order' && <div className="space-y-6"><div className="bg-white rounded-3xl shadow-lg shadow-slate-100 border border-white p-5"><h3 className="font-semibold text-slate-700 mb-3">📤 导入菜单并开启点餐</h3><div className="flex items-center gap-4 mb-3"><label className="flex-1"><input type="file" accept=".csv" onChange={handleImport} disabled={importing} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-brand-light file:text-brand-dark hover:file:bg-brand/30 cursor-pointer disabled:opacity-50" /></label>{importing && <span className="text-sm text-slate-400">导入中...</span>}</div><p className="text-xs text-slate-400 mb-3">导入会生成本次点餐活动。</p><div className="flex gap-3 flex-wrap"><button onClick={() => handleDownloadTemplate('plain')} className="px-4 py-2 text-sm bg-slate-50 text-slate-600 rounded-xl border border-slate-200 transition">无辣度模板</button><button onClick={() => handleDownloadTemplate('spicy')} className="px-4 py-2 text-sm bg-slate-50 text-slate-600 rounded-xl border border-slate-200 transition">有辣度模板</button></div></div><div className="bg-white rounded-3xl shadow-lg shadow-slate-100 border border-white overflow-hidden"><div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between"><h3 className="font-semibold text-slate-700">🍽️ 当前点餐菜品</h3><button onClick={fetchMenu} disabled={menuLoading} className="text-sm text-brand hover:text-brand-dark transition">{menuLoading ? '刷新中...' : '↻ 刷新'}</button></div>{menuList.length === 0 ? <div className="py-12 text-center text-slate-400">当前没有进行中的点餐</div> : <div className="divide-y divide-slate-100">{menuList.map(item => <div key={item.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/50 transition"><div className="flex items-center gap-2"><span className="font-medium text-slate-700">{item.name}</span>{item.spicy > 0 && <span className="text-sm text-orange-500">{'🌶️'.repeat(item.spicy)} {spicyLevelLabels[item.spicy]}</span>}</div><button onClick={() => handleDeleteMenu(item.id, item.name)} className="px-3 py-1 text-xs rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600 transition">删除</button></div>)}</div>}</div><div className="bg-white rounded-3xl shadow-lg shadow-slate-100 border border-white overflow-hidden"><div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between"><h3 className="font-semibold text-slate-700">📊 当前点餐汇总</h3><button onClick={fetchOrders} disabled={ordersLoading} className="text-sm text-brand hover:text-brand-dark transition">{ordersLoading ? '加载中...' : '↻ 刷新'}</button></div>{!orders ? <div className="py-12 text-center text-slate-400">点击刷新加载数据</div> : orderSummary.length === 0 ? <div className="py-12 text-center text-slate-400">暂无订单</div> : <div className="divide-y divide-slate-100">{orderSummary.map(itemSummary => <div key={itemSummary.name}><button onClick={() => toggleExpand(itemSummary.name)} className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50/50 transition text-left"><span className="font-medium text-slate-700">{itemSummary.name}</span><span className="flex items-center gap-3"><span className="px-3 py-0.5 bg-brand-light text-brand-dark rounded-full text-sm font-bold">{itemSummary.total} 份</span><span className="text-slate-400 text-xs">{expandedItems[itemSummary.name] ? '▲' : '▼'}</span></span></button>{expandedItems[itemSummary.name] && <div className="bg-slate-50 px-5 py-3 border-t border-slate-100">{itemSummary.people.map((p, i) => <div key={i} className="text-sm text-slate-600 py-1">{p.person} · {p.quantity}份 {p.spicy_level > 0 ? spicyLevelLabels[p.spicy_level] : ''}</div>)}</div>}</div>)}<div className="px-5 py-4 bg-amber-50/50 flex items-center justify-between"><span className="font-bold text-slate-700">合计</span><span className="font-bold text-brand-dark text-lg">{orderSummary.reduce((sum, i) => sum + i.total, 0)} 份</span></div></div>}</div><div className="flex justify-center pb-4"><button onClick={() => handleExportCurrent('order')} className="px-8 py-3 bg-white border-2 border-brand text-brand hover:bg-brand hover:text-white font-bold rounded-2xl transition shadow-sm">📄 导出当前点餐 HTML</button></div></div>}

      {currentTab === 'vote' && <div className="space-y-6"><div className="bg-white rounded-3xl shadow-lg shadow-slate-100 border border-white p-5"><h3 className="font-semibold text-slate-700 mb-4">🗳️ 投票管理</h3><div className="mb-5 p-4 bg-slate-50 rounded-2xl"><input type="text" value={voteTitle} onChange={e => setVoteTitle(e.target.value)} placeholder="投票标题（如：今天想吃什么披萨？）" className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand outline-none transition mb-3 text-sm" /><div className="space-y-2 mb-3">{votePizzas.map((pizza, index) => <div key={index} className="flex items-center gap-2"><input type="text" value={pizza.name} onChange={e => updatePizzaOption(index, 'name', e.target.value)} placeholder="披萨名称" className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:border-brand outline-none transition text-sm" /><input type="number" value={pizza.servings} onChange={e => updatePizzaOption(index, 'servings', e.target.value)} min="1" className="w-20 px-3 py-2 rounded-xl border border-slate-200 focus:border-brand outline-none transition text-sm text-center" />{votePizzas.length > 1 && <button onClick={() => removePizzaOption(index)} className="text-red-400 hover:text-red-600 text-sm transition">✕</button>}</div>)}</div><div className="flex gap-3 flex-wrap"><button onClick={addPizzaOption} className="px-4 py-2 text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition">+ 添加选项</button><button onClick={handleCreateVote} disabled={creatingVote} className="px-4 py-2 text-sm bg-brand hover:bg-brand-dark text-white rounded-xl transition disabled:opacity-50">{creatingVote ? '创建中...' : '创建投票'}</button></div></div>{voteSessions.length > 0 && <div className="space-y-4"><h4 className="text-sm font-semibold text-slate-600">当前投票</h4>{voteSessions.map(vs => <div key={vs.id} className="border border-slate-200 rounded-2xl p-4 bg-slate-50/40"><div className="font-medium text-slate-700 mb-3">{vs.title}</div>{(vs.pizza_stats || []).map(pizza => <div key={pizza.id} className="py-2 border-b border-slate-100 last:border-0"><div className="flex items-center justify-between"><span className="font-medium text-slate-700">{pizza.name}</span><div className="flex items-center gap-4 text-sm"><span className="text-slate-500">{pizza.vote_count} 票</span><span className="px-2 py-0.5 bg-brand-light text-brand-dark rounded-full font-semibold">需订 {pizza.need_to_order} 个</span></div></div>{pizza.voters?.length > 0 && <div className="mt-1 text-xs text-slate-400">{pizza.voters.join('、')}</div>}</div>)}</div>)}</div>}{voteLoading && <p className="text-sm text-slate-400 text-center mt-2">加载中...</p>}</div><div className="flex justify-center pb-4"><button onClick={() => handleExportCurrent('vote')} className="px-8 py-3 bg-white border-2 border-violet-400 text-violet-600 hover:bg-violet-500 hover:text-white font-bold rounded-2xl transition shadow-sm">📄 导出当前投票 HTML</button></div></div>}

      {currentTab !== 'people' && <HistoryBlock rounds={rounds} filteredRounds={[]} roundSearch={roundSearch} setRoundSearch={setRoundSearch} roundModeFilter={currentTab} setRoundModeFilter={()=>{}} fetchRounds={fetchRounds} handleViewRound={handleViewRound} handleExportRound={handleExportHistory} onView={handleViewRound} onExport={handleExportHistory} onDelete={handleDeleteRound} currentTab={currentTab} />}
      {currentTab !== 'people' && <RoundDetailModal roundDetail={roundDetail} onClose={() => setRoundDetail(null)} />}
    </div>
  )
}
