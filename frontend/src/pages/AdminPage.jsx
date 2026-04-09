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

// Helper function to parse spicy options
function parseSpicyOptions(spicyOptionsStr) {
  if (!spicyOptionsStr || spicyOptionsStr === "") return null; // no spicy
  const parts = spicyOptionsStr.split(",");
  if (parts.length === 1) {
    return { type: "single", value: parseInt(parts[0]) }; // single fixed option
  }
  return { type: "multiple", options: parts.map(p => parseInt(p)) }; // multiple selectable options
}

// Helper function to format spicy options for display
function formatSpicyOptions(spicyOptionsStr) {
  const info = parseSpicyOptions(spicyOptionsStr)
  if (!info) return '无辣'
  if (info.type === 'single') {
    return spicyLevelLabels[info.value] || '无辣'
  }
  return info.options.map(opt => spicyLevelLabels[opt] || '').filter(Boolean).join('/')
}

function sanitizeDownloadFilename(name, fallback = '导出文件') {
  const trimmed = String(name || '').trim()
  const safe = trimmed.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ')
  return safe || fallback
}

async function downloadBlob(blob, filename) {
  const safeFilename = sanitizeDownloadFilename(filename)
  const isMobileBrowser = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')

  if (isMobileBrowser) {
    const reader = new FileReader()
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(blob)
    })
    const opened = window.open(dataUrl, '_blank', 'noopener,noreferrer')
    if (!opened) {
      window.location.href = dataUrl
    }
    return
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeFilename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const modeStyles = {
  order: {
    bg: 'bg-[#FFFBEB]',
    accent: '#F59E0B',
    accentBg: 'bg-amber-500',
    accentHover: 'hover:bg-amber-600',
    accentLight: 'rgba(245,158,11,0.15)',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    tabActive: 'bg-amber-500 text-white',
    progressBar: 'bg-amber-500',
    tag: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  vote: {
    bg: 'bg-[#F5F3FF]',
    accent: '#8B5CF6',
    accentBg: 'bg-violet-500',
    accentHover: 'hover:bg-violet-600',
    accentLight: 'rgba(139,92,246,0.15)',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    tabActive: 'bg-violet-500 text-white',
    progressBar: 'bg-violet-500',
    tag: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  people: {
    bg: 'bg-[#F7F6F3]',
    accent: '#37352F',
    accentBg: 'bg-[#37352F]',
    accentHover: 'hover:bg-[#787774]',
    accentLight: 'rgba(55,53,47,0.15)',
    badge: 'bg-gray-50 text-gray-600 border-gray-200',
    tabActive: 'bg-[#37352F] text-white',
    progressBar: 'bg-[#37352F]',
    tag: 'bg-[#F7F6F3] text-[#37352F] border-[#E8E7E4]',
  }
}

function getModeStyles(tab) {
  return modeStyles[tab] || modeStyles.people
}

function TabSwitch({ current }) {
  const styles = getModeStyles(current)
  return (
    <div className="inline-flex p-1 rounded-md bg-[#F7F6F3] border border-[#E8E7E4]">
      <Link
        to="/admin/people"
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-300 ${
          current === 'people'
            ? modeStyles.people.tabActive
            : 'text-[#787774] hover:bg-white hover:text-[#37352F]'
        }`}
      >
        人员管理
      </Link>
      <Link
        to="/admin"
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-300 ${
          current === 'order'
            ? modeStyles.order.tabActive
            : 'text-[#787774] hover:bg-white hover:text-[#37352F]'
        }`}
      >
        点餐
      </Link>
      <Link
        to="/admin/vote"
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-300 ${
          current === 'vote'
            ? modeStyles.vote.tabActive
            : 'text-[#787774] hover:bg-white hover:text-[#37352F]'
        }`}
      >
        投票
      </Link>
    </div>
  )
}

function ActivityCard({ participation, onEnd, onRefresh, currentTab }) {
  if (!participation) return null
  const styles = getModeStyles(currentTab)
  const modeClass = participation.mode === 'order'
    ? modeStyles.order.badge
    : participation.mode === 'vote'
    ? modeStyles.vote.badge
    : 'bg-[#F7F6F3] text-[#787774] border-[#E8E7E4]'
  const modeText = participation.mode === 'order' ? '点餐进行中' : participation.mode === 'vote' ? '投票进行中' : '空闲中'
  const endText = participation.mode === 'order' ? '结束本次点单' : participation.mode === 'vote' ? '结束本次投票' : '结束当前活动'
  const percent = participation.total_count ? (participation.done_count / participation.total_count) * 100 : 0
  return (
    <div className="rounded-lg border border-[#E8E7E4] bg-white p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm text-[#787774] mb-2">当前活动</div>
          <h2 className="text-xl font-bold text-[#37352F] mb-2">{participation.title || '当前活动'}</h2>
          <div className="flex flex-wrap gap-2">
            <span className={`px-3 py-1 rounded-md text-sm border transition-colors duration-300 ${modeClass}`}>{modeText}</span>
            <span className="px-3 py-1 rounded-md text-sm border transition-colors duration-300" style={{ backgroundColor: styles.accentLight, color: styles.accent, borderColor: styles.accent }}>
              已参与 {participation.done_count}/{participation.total_count}
            </span>
          </div>
        </div>
        <div className="md:text-right">
          <div className="text-sm text-[#787774] mb-2">参与进度</div>
          <div className="w-full md:w-64 h-2 rounded-md bg-[#F7F6F3] overflow-hidden mb-2">
            <div className="h-full transition-colors duration-300" style={{ width: `${percent}%`, backgroundColor: styles.accent }} />
          </div>
          <div className="text-xs text-[#787774]">还有 {Math.max((participation.total_count || 0) - (participation.done_count || 0), 0)} 人未参与</div>
        </div>
      </div>
      {participation.pending?.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#E8E7E4] flex flex-wrap gap-2">
          {participation.pending.map(name => (
            <span key={name} className="px-3 py-1 bg-[#F7F6F3] text-[#787774] rounded-md text-sm border border-[#E8E7E4]">
              {name}
            </span>
          ))}
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button onClick={onEnd} className={`px-4 py-2 rounded-md text-white hover:bg-[#787774] transition-colors duration-300 text-sm ${styles.accentBg}`}>
          {endText}
        </button>
        <button onClick={onRefresh} className="px-4 py-2 rounded-md border border-[#E8E7E4] bg-white hover:bg-[#F7F6F3] transition text-sm text-[#787774]">
          刷新状态
        </button>
      </div>
    </div>
  )
}

function HistoryBlock({ rounds, currentTab, roundSearch, setRoundSearch, fetchRounds, onView, onExport, onDelete }) {
  const styles = getModeStyles(currentTab)
  const filtered = rounds.filter(round => {
    const keyword = roundSearch.trim().toLowerCase()
    const modeOk = currentTab === 'people' ? true : round.mode === currentTab
    const text = `${round.title || ''} #${round.id}`.toLowerCase()
    return modeOk && (!keyword || text.includes(keyword))
  })
  return (
    <div className="bg-white rounded-lg border border-[#E8E7E4] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E8E7E4] flex items-center justify-between">
        <h3 className="font-semibold text-[#37352F]">🕘 最近历史</h3>
        <button onClick={fetchRounds} className="text-sm transition-colors duration-300" style={{ color: styles.accent }}>
          ↻ 刷新
        </button>
      </div>
      <div className="px-5 py-4 border-b border-[#E8E7E4]">
        <input
          value={roundSearch}
          onChange={e => setRoundSearch(e.target.value)}
          placeholder="搜索标题或轮次ID"
          className="w-full px-4 py-3 rounded-md border border-[#E8E7E4] text-sm focus:border-current outline-none transition-colors duration-300"
          style={{ borderColor: styles.accent }}
        />
      </div>
      {filtered.length === 0 ? (
        <div className="py-10 text-center text-[#787774]">暂无匹配历史</div>
      ) : (
        <div className="divide-y divide-[#E8E7E4]">
          {filtered.filter(round => !round.active).slice(0, 5).map(round => {
            const roundStyles = getModeStyles(round.mode)
            return (
              <div key={round.id} className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#F7F6F3] transition">
                <div>
                  <div className="font-medium text-[#37352F]">
                    {round.title || (round.mode === 'order' ? '点餐' : '投票')}
                    <span className="text-xs text-[#9B9A97] ml-2">#{round.id}</span>
                  </div>
                  <div className="text-xs text-[#9B9A97] mt-1">{new Date(round.created_at).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="flex flex-wrap gap-2 justify-end mb-1">
                    <span className={`px-2 py-1 rounded-md text-xs border transition-colors duration-300 ${roundStyles.tag}`}>
                      {round.mode === 'order' ? '点餐' : '投票'}
                    </span>
                    <button onClick={() => onView(round.id)} className="text-xs transition-colors duration-300" style={{ color: styles.accent }}>
                      查看详情
                    </button>
                    {round.mode === currentTab && (
                      <button onClick={() => onExport(round.id)} className="text-xs transition-colors duration-300" style={{ color: styles.accent }}>
                        导出
                      </button>
                    )}
                    <button onClick={() => onDelete(round.id)} className="text-xs text-[#EB5757] hover:text-[#D94A4A] transition">
                      删除
                    </button>
                  </div>
                  <div className="text-sm text-[#787774]">参与 {round.count} 人</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RoundDetailModal({ roundDetail, onClose }) {
  if (!roundDetail) return null
  return (
    <div className="bg-white rounded-lg border border-[#E8E7E4] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[#37352F]">📚 轮次详情：{roundDetail.round?.title || `#${roundDetail.round?.id}`}</h3>
        <button onClick={onClose} className="text-sm text-[#787774] hover:text-[#37352F]">关闭</button>
      </div>
      {roundDetail.round?.mode === 'order' ? (
        <div className="space-y-3">
          {(roundDetail.orders || []).map(order => (
            <div key={order.id} className="rounded-md border border-[#E8E7E4] p-4">
              <div className="font-medium text-[#37352F]">{order.person}</div>
              <div className="mt-2 text-sm text-[#787774]">
                {(order.items || []).map((item, idx) => (
                  <div key={idx}>
                    {item.menu?.name} × {item.quantity} {item.spicy_level > 0 ? `· ${spicyLevelLabels[item.spicy_level]}` : ''}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {(roundDetail.vote_sessions || []).map(vs => (
            <div key={vs.id} className="rounded-md border border-[#E8E7E4] p-4">
              <div className="font-medium text-[#37352F] mb-2">{vs.title}</div>
              {(vs.votes || []).map((v, idx) => (
                <div key={idx} className="text-sm text-[#787774]">
                  {v.person} → {v.pizza?.name || `选项#${v.pizza_id}`}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
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

  // Get mode-specific styles
  const styles = getModeStyles(currentTab)

  const fetchMenu = useCallback(async () => {
    setMenuLoading(true)
    try { setMenuList((await adminGetMenu()).data || []) }
    catch { setMenuList([]) }
    finally { setMenuLoading(false) }
  }, [])
  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true)
    try { setOrders((await adminGetOrders()).data || []) }
    catch { setOrders([]) }
    finally { setOrdersLoading(false) }
  }, [])
  const fetchVotes = useCallback(async () => {
    setVoteLoading(true)
    try { setVoteSessions((await getVoteSessions()).data || []) }
    catch { setVoteSessions([]) }
    finally { setVoteLoading(false) }
  }, [])
  const fetchParticipation = useCallback(async () => {
    try { setParticipation((await getParticipationStatus(currentTab === 'people' ? '' : currentTab)).data) }
    catch {}
  }, [currentTab])
  const fetchRounds = useCallback(async () => {
    try { setRounds((await getRounds()).data || []) }
    catch { setRounds([]) }
  }, [])
  const fetchPersonnelOptions = useCallback(async () => {
    try { setPersonnelOptions((await getPersonnel()).data || []) }
    catch { setPersonnelOptions([]) }
  }, [])
  const refreshAll = useCallback(() => {
    fetchMenu(); fetchOrders(); fetchVotes(); fetchParticipation(); fetchRounds(); fetchPersonnelOptions()
  }, [fetchMenu, fetchOrders, fetchVotes, fetchParticipation, fetchRounds, fetchPersonnelOptions])

  useEffect(() => {
    const saved = localStorage.getItem('admin_token')
    if (saved) { setAdminToken(saved); setIsLogin(true); refreshAll() }
  }, [refreshAll])

  const handleLogin = async () => {
    if (!password.trim()) return
    setLoginError('')
    try {
      const token = (await adminLogin(password.trim())).data.token
      setAdminToken(token)
      localStorage.setItem('admin_token', token)
      setIsLogin(true)
      refreshAll()
    } catch (e) { setLoginError(e.response?.data?.error || '登录失败') }
  }
  const handleLogout = () => {
    setAdminToken('')
    localStorage.removeItem('admin_token')
    setIsLogin(false)
  }
  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      await importMenu(file, '')
      setSuccessMsg('菜单导入成功')
      refreshAll()
    } catch (err) { setErrorMsg(err.response?.data?.error || '导入失败') }
    finally { setImporting(false); e.target.value = '' }
  }
  const handlePersonnelImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportingPersonnel(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      await importPersonnel(file)
      setSuccessMsg('人员导入成功')
      fetchPersonnelOptions()
    } catch (err) { setErrorMsg(err.response?.data?.error || '导入失败') }
    finally { setImportingPersonnel(false); e.target.value = '' }
  }
  const handleDeleteMenu = async (id, name) => {
    if (!confirm(`确认删除「${name}」？`)) return
    try { await deleteMenuItem(id); refreshAll() }
    catch { setErrorMsg('删除失败') }
  }
  const handleCreateVote = async () => {
    if (!voteTitle.trim()) return setErrorMsg('请输入投票标题')
    const valid = votePizzas.filter(p => p.name.trim())
    if (valid.length < 2) return setErrorMsg('至少两个选项')
    setCreatingVote(true)
    try {
      await createVoteSession({
        title: voteTitle.trim(),
        deadline_at: '',
        pizzas: valid.map(p => ({ name: p.name.trim(), servings: p.servings }))
      })
      setSuccessMsg('投票创建成功')
      setVoteTitle('')
      setVotePizzas([{ name: '', servings: 4 }])
      refreshAll()
    } catch (e) { setErrorMsg(e.response?.data?.error || '创建失败') }
    finally { setCreatingVote(false) }
  }
  const handleDeleteVote = async (id, title) => {
    if (!confirm(`确认删除投票「${title}」？`)) return
    try { await deleteVoteSession(id); refreshAll() }
    catch { setErrorMsg('删除失败') }
  }
  const handleEndRound = async () => {
    if (!confirm('确认结束当前活动？')) return
    try { await endActiveRound(currentTab === 'people' ? '' : currentTab); refreshAll() }
    catch { setErrorMsg('结束失败') }
  }
  const handleViewRound = async (id) => {
    try { setRoundDetail((await getRoundDetail(id)).data) }
    catch { setErrorMsg('详情加载失败') }
  }
  const handleExportCurrent = async (mode) => {
    try {
      const res = await exportOrders(mode)
      await downloadBlob(new Blob([res.data], { type: res.data?.type || 'text/html;charset=utf-8' }), `${mode === 'vote' ? '投票' : '点餐'}_${new Date().toLocaleDateString()}.html`)
    } catch { setErrorMsg('导出失败') }
  }
  const handleExportHistory = async (id) => {
    try {
      const detailRes = await getRoundDetail(id)
      const round = detailRes.data.round
      const roundTitle = round.mode === 'vote' && detailRes.data.vote_sessions?.length > 0
        ? detailRes.data.vote_sessions[0].title
        : round.title
      const res = await exportRound(id)
      await downloadBlob(new Blob([res.data], { type: res.data?.type || 'text/html;charset=utf-8' }), `${roundTitle}.html`)
    } catch (e) {
      console.error('Export error:', e)
      setErrorMsg('导出失败: ' + (e.response?.data?.error || e.message || '未知错误'))
    }
  }
  const handleDeleteRound = async (id) => {
    if (!confirm(`确认删除历史 #${id}？`)) return
    try {
      await deleteRound(id)
      setSuccessMsg(`已删除历史 #${id}`)
      refreshAll()
    } catch (e) { setErrorMsg(e.response?.data?.error || '删除历史失败') }
  }
  const handleDownloadTemplate = async (type) => {
    try {
      const res = await downloadTemplate(type)
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = type === 'personnel' ? '人员模板.csv' : '菜单模板.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch { setErrorMsg('下载模板失败') }
  }
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

  if (!isLogin) {
    return (
      <div className={`min-h-screen ${styles.bg} flex items-center justify-center py-20 transition-colors duration-300`}>
        <div className="bg-white rounded-lg border border-[#E8E7E4] p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🔐</div>
            <h2 className="text-xl font-bold text-[#37352F]">管理员登录</h2>
          </div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="请输入管理密码..."
            className="w-full px-4 py-3 rounded-md border border-[#E8E7E4] focus:border-current focus:ring-2 outline-none transition mb-4"
            style={{ '--tw-ring-color': styles.accentLight, borderColor: styles.accent }}
          />
          {loginError && <p className="text-[#EB5757] text-sm mb-3 text-center">{loginError}</p>}
          <button onClick={handleLogin} className={`w-full py-3 text-white font-medium rounded-md transition-colors duration-300 ${styles.accentBg} ${styles.accentHover}`}>
            登录
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${styles.bg} transition-colors duration-300`}>
      <div className="max-w-4xl mx-auto space-y-6 py-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <TabSwitch current={currentTab} />
        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(v => !v)} className="px-3 py-1.5 rounded-md text-sm font-medium border border-[#E8E7E4] bg-white hover:bg-[#F7F6F3] text-[#787774] transition">
            ? 使用教程
          </button>
          <button onClick={handleLogout} className="text-sm text-[#787774] hover:text-[#37352F] transition">
            退出登录
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-white border border-[#EB5757] text-[#EB5757] rounded-md text-sm">
          ⚠️ {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-white border border-[#4EAD5B] text-[#4EAD5B] rounded-md text-sm">
          ✅ {successMsg}
        </div>
      )}

      {showGuide && (
        <div className="bg-white rounded-lg border border-[#E8E7E4] p-5">
          <h3 className="font-semibold text-[#37352F] mb-3">📘 使用教程</h3>
          <div className="grid gap-4 md:grid-cols-3 text-sm text-[#787774]">
            <div className="rounded-md bg-[#F7F6F3] border border-[#E8E7E4] p-4">
              <div className="font-semibold text-[#37352F] mb-2">1. 人员管理</div>
              <p>先导入人员名单，保证点餐和投票使用同一批人。</p>
            </div>
            <div className="rounded-md bg-[#F7F6F3] border border-[#E8E7E4] p-4">
              <div className="font-semibold text-[#37352F] mb-2">2. 发布活动</div>
              <p>在点餐页导入菜单，在投票页创建投票，两个活动可同时存在。</p>
            </div>
            <div className="rounded-md bg-[#F7F6F3] border border-[#E8E7E4] p-4">
              <div className="font-semibold text-[#37352F] mb-2">3. 导出结果</div>
              <p>点餐和投票分别导出自己的 HTML 结果，历史也可单独查看。</p>
            </div>
          </div>
        </div>
      )}

      {currentTab !== 'people' && <ActivityCard participation={participation} onEnd={handleEndRound} onRefresh={refreshAll} currentTab={currentTab} />}

      {/* People Management */}
      {currentTab === 'people' && (
        <div className="bg-white rounded-lg border border-[#E8E7E4] p-5">
          <h3 className="font-semibold text-[#37352F] mb-3">👤 人员管理</h3>
          <div className="flex flex-col gap-3">
            <label className="w-full">
              <input
                type="file"
                accept=".csv"
                onChange={handlePersonnelImport}
                disabled={importingPersonnel}
                className="block w-full text-sm text-[#787774] file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[#F7F6F3] file:text-[#37352F] hover:file:bg-[#EFEFED] cursor-pointer disabled:opacity-50"
              />
            </label>
            {importingPersonnel && <span className="text-sm text-[#9B9A97]">导入中...</span>}
            <div className="flex gap-3 flex-wrap">
              <button onClick={() => handleDownloadTemplate('personnel')} className="px-4 py-2 text-sm text-[#787774] rounded-md border border-[#E8E7E4] bg-white hover:bg-[#F7F6F3] transition">
                下载人员模板
              </button>
              <button onClick={fetchPersonnelOptions} className="px-4 py-2 text-sm text-[#787774] rounded-md border border-[#E8E7E4] bg-white hover:bg-[#F7F6F3] transition">
                刷新名单
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {personnelOptions.map(p => (
              <span key={p.id} className="px-3 py-1 bg-[#F7F6F3] text-[#37352F] rounded-md text-sm border border-[#E8E7E4]">
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Order Management */}
      {currentTab === 'order' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-[#E8E7E4] p-5">
            <h3 className="font-semibold text-[#37352F] mb-3">📤 导入菜单并开启点餐</h3>
            <div className="flex items-center gap-4 mb-3">
              <label className="flex-1">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImport}
                  disabled={importing}
                  className="block w-full text-sm text-[#787774] file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[#F7F6F3] file:text-[#37352F] hover:file:bg-[#EFEFED] cursor-pointer disabled:opacity-50"
                />
              </label>
              {importing && <span className="text-sm text-[#9B9A97]">导入中...</span>}
            </div>
            <p className="text-xs text-[#9B9A97] mb-3">导入会生成本次点餐活动。</p>
            <div className="flex gap-3 flex-wrap">
              <button onClick={() => handleDownloadTemplate('spicy')} className="px-4 py-2 text-sm bg-[#F7F6F3] text-[#787774] rounded-md border border-[#E8E7E4] transition">
                📥 下载模板
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#E8E7E4] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E8E7E4] flex items-center justify-between">
              <h3 className="font-semibold text-[#37352F]">🍽️ 当前点餐菜品</h3>
              <button onClick={fetchMenu} disabled={menuLoading} className="text-sm transition-colors duration-300" style={{ color: styles.accent }}>
                {menuLoading ? '刷新中...' : '↻ 刷新'}
              </button>
            </div>
            {menuList.length === 0 ? (
              <div className="py-12 text-center text-[#787774]">当前没有进行中的点餐</div>
            ) : (
              <div className="divide-y divide-[#E8E7E4]">
                {menuList.map(item => (
                  <div key={item.id} className="px-5 py-3 flex items-center justify-between hover:bg-[#F7F6F3] transition">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#37352F]">{item.name}</span>
                      <span className="text-sm text-[#787774]">{formatSpicyOptions(item.spicy_options)}</span>
                    </div>
                    <button onClick={() => handleDeleteMenu(item.id, item.name)} className="px-3 py-1 text-xs rounded-md text-[#EB5757] hover:bg-white hover:text-[#D94A4A] transition border border-[#E8E7E4]">
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-[#E8E7E4] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E8E7E4] flex items-center justify-between">
              <h3 className="font-semibold text-[#37352F]">📊 当前点餐汇总</h3>
              <button onClick={fetchOrders} disabled={ordersLoading} className="text-sm transition-colors duration-300" style={{ color: styles.accent }}>
                {ordersLoading ? '加载中...' : '↻ 刷新'}
              </button>
            </div>
            {!orders ? (
              <div className="py-12 text-center text-[#787774]">点击刷新加载数据</div>
            ) : orderSummary.length === 0 ? (
              <div className="py-12 text-center text-[#787774]">暂无订单</div>
            ) : (
              <div className="divide-y divide-[#E8E7E4]">
                {orderSummary.map(itemSummary => (
                  <div key={itemSummary.name}>
                    <button
                      onClick={() => toggleExpand(itemSummary.name)}
                      className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#F7F6F3] transition text-left"
                    >
                      <span className="font-medium text-[#37352F]">{itemSummary.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="px-3 py-0.5 rounded-md text-sm font-bold transition-colors duration-300" style={{ backgroundColor: styles.accentLight, color: styles.accent }}>
                          {itemSummary.total} 份
                        </span>
                        <span className="text-[#787774] text-xs">{expandedItems[itemSummary.name] ? '▲' : '▼'}</span>
                      </span>
                    </button>
                    {expandedItems[itemSummary.name] && (
                      <div className="bg-[#F7F6F3] px-5 py-3 border-t border-[#E8E7E4]">
                        {itemSummary.people.map((p, i) => (
                          <div key={i} className="text-sm text-[#787774] py-1">
                            {p.person} · {p.quantity}份 {p.spicy_level > 0 ? spicyLevelLabels[p.spicy_level] : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="px-5 py-4 bg-[#F7F6F3] flex items-center justify-between">
                  <span className="font-bold text-[#37352F]">合计</span>
                  <span className="font-bold text-lg transition-colors duration-300" style={{ color: styles.accent }}>{orderSummary.reduce((sum, i) => sum + i.total, 0)} 份</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-center pb-4">
            <button onClick={() => handleExportCurrent('order')} className={`px-8 py-3 bg-white border-2 font-medium rounded-md transition-colors duration-300`} style={{ borderColor: styles.accent, color: styles.accent }}>
              📄 导出当前点餐 HTML
            </button>
          </div>
        </div>
      )}

      {/* Vote Management */}
      {currentTab === 'vote' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-[#E8E7E4] p-5">
            <h3 className="font-semibold text-[#37352F] mb-4">🗳️ 投票管理</h3>
            <div className="mb-5 p-4 bg-[#F7F6F3] rounded-md">
              <input
                type="text"
                value={voteTitle}
                onChange={e => setVoteTitle(e.target.value)}
                placeholder="投票标题（如：今天想吃什么披萨？）"
                className="w-full px-3 py-2 rounded-md border border-[#E8E7E4] focus:border-current focus:ring-2 outline-none transition mb-3 text-sm"
                style={{ '--tw-ring-color': styles.accentLight, borderColor: styles.accent }}
              />
              <div className="space-y-2 mb-3">
                {votePizzas.map((pizza, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={pizza.name}
                      onChange={e => updatePizzaOption(index, 'name', e.target.value)}
                      placeholder="披萨名称"
                      className="flex-1 px-3 py-2 rounded-md border border-[#E8E7E4] focus:border-current focus:ring-2 outline-none transition text-sm"
                      style={{ '--tw-ring-color': styles.accentLight, borderColor: styles.accent }}
                    />
                    <input
                      type="number"
                      value={pizza.servings}
                      onChange={e => updatePizzaOption(index, 'servings', e.target.value)}
                      min="1"
                      className="w-20 px-3 py-2 rounded-md border border-[#E8E7E4] focus:border-current focus:ring-2 outline-none transition text-sm text-center"
                      style={{ '--tw-ring-color': styles.accentLight, borderColor: styles.accent }}
                    />
                    {votePizzas.length > 1 && (
                      <button onClick={() => removePizzaOption(index)} className="text-[#EB5757] hover:text-[#D94A4A] text-sm transition">
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={addPizzaOption} className="px-4 py-2 text-sm bg-white border border-[#E8E7E4] text-[#787774] hover:bg-[#F7F6F3] rounded-md transition">
                  + 添加选项
                </button>
                <button onClick={handleCreateVote} disabled={creatingVote} className={`px-4 py-2 text-sm text-white rounded-md transition-colors duration-300 disabled:opacity-50 ${styles.accentBg} ${styles.accentHover}`}>
                  {creatingVote ? '创建中...' : '创建投票'}
                </button>
              </div>
            </div>
            {voteSessions.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-[#37352F]">当前投票</h4>
                {voteSessions.map(vs => (
                  <div key={vs.id} className="border border-[#E8E7E4] rounded-md p-4 bg-white">
                    <div className="font-medium text-[#37352F] mb-3">{vs.title}</div>
                    {(vs.pizza_stats || []).map(pizza => (
                      <div key={pizza.id} className="py-2 border-b border-[#E8E7E4] last:border-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[#37352F]">{pizza.name}</span>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-[#787774]">{pizza.vote_count} 票</span>
                            <span className="px-2 py-0.5 rounded-md font-semibold transition-colors duration-300" style={{ backgroundColor: styles.accentLight, color: styles.accent }}>
                              需订 {pizza.need_to_order} 个
                            </span>
                          </div>
                        </div>
                        {pizza.voters?.length > 0 && (
                          <div className="mt-1 text-xs text-[#9B9A97]">{pizza.voters.join('、')}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {voteLoading && <p className="text-sm text-[#9B9A97] text-center mt-2">加载中...</p>}
          </div>

          <div className="flex justify-center pb-4">
            <button onClick={() => handleExportCurrent('vote')} className="px-8 py-3 bg-white border-2 font-medium rounded-md transition-colors duration-300" style={{ borderColor: styles.accent, color: styles.accent }}>
              📄 导出当前投票 HTML
            </button>
          </div>
        </div>
      )}

      {currentTab !== 'people' && (
        <HistoryBlock
          rounds={rounds}
          filteredRounds={[]}
          roundSearch={roundSearch}
          setRoundSearch={setRoundSearch}
          roundModeFilter={currentTab}
          setRoundModeFilter={() => {}}
          fetchRounds={fetchRounds}
          handleViewRound={handleViewRound}
          handleExportRound={handleExportHistory}
          onView={handleViewRound}
          onExport={handleExportHistory}
          onDelete={handleDeleteRound}
          currentTab={currentTab}
        />
      )}
      {currentTab !== 'people' && <RoundDetailModal roundDetail={roundDetail} onClose={() => setRoundDetail(null)} />}
      </div>
    </div>
  )
}