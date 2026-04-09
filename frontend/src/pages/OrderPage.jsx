import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getHomeState, submitOrder, castVote, getPersonnel, getMyOrder } from '../api'

const spicyLevelLabels = ['', '微辣', '中辣', '重辣']

// Helper function to parse spicy options from menu.spicy_options field
function parseSpicyOptions(spicyOptionsStr) {
  if (!spicyOptionsStr || spicyOptionsStr === "") return null; // no spicy
  const parts = spicyOptionsStr.split(",");
  if (parts.length === 1) {
    return { type: "single", value: parseInt(parts[0]) }; // single fixed option
  }
  return { type: "multiple", options: parts.map(p => parseInt(p)) }; // multiple selectable options
}

const modeStyles = {
  order: {
    accent: '#F59E0B',
    accentBg: 'bg-[#F59E0B]',
    accentHover: 'hover:bg-[#D97706]',
    accentLight: 'rgba(245,158,11,0.08)',
    sectionTint: 'bg-[#FFFBF5]',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    borderDefault: 'border-[#E8E7E4]',
    borderHover: 'hover:border-amber-200',
    cardSelected: 'border-2 border-[#F59E0B] bg-[rgba(245,158,11,0.05)]',
    tabActive: 'bg-[#F59E0B] text-white',
    focusRing: 'focus:ring-[rgba(245,158,11,0.3)]',
  },
  vote: {
    accent: '#8B5CF6',
    accentBg: 'bg-[#8B5CF6]',
    accentHover: 'hover:bg-[#7C3AED]',
    accentLight: 'rgba(139,92,246,0.08)',
    sectionTint: 'bg-[#FAF8FF]',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    borderDefault: 'border-[#E8E7E4]',
    borderHover: 'hover:border-violet-200',
    cardSelected: 'border-2 border-[#8B5CF6] bg-[rgba(139,92,246,0.05)]',
    tabActive: 'bg-[#8B5CF6] text-white',
    focusRing: 'focus:ring-[rgba(139,92,246,0.3)]',
  },
  idle: {
    accent: '#9B9A97',
    accentBg: 'bg-[#9B9A97]',
    accentHover: 'hover:bg-[#787774]',
    accentLight: 'rgba(156,163,155,0.08)',
    sectionTint: 'bg-[#F7F6F3]',
    badge: 'bg-gray-50 text-gray-600 border-gray-200',
    borderDefault: 'border-[#E8E7E4]',
    borderHover: 'hover:border-gray-300',
    cardSelected: 'border-2 border-[#9B9A97] bg-[rgba(156,163,155,0.05)]',
    tabActive: 'bg-[#9B9A97] text-white',
    focusRing: 'focus:ring-[rgba(156,163,155,0.3)]',
  }
}

function getModeStyles(homeState) {
  if (homeState.order) return modeStyles.order
  if (homeState.vote) return modeStyles.vote
  return modeStyles.idle
}

function StatusBadge({ mode, styles }) {
  const normalized = mode === 'idle' ? 'idle' : mode.includes('点餐') && mode.includes('投票') ? 'both' : mode.includes('点餐') ? 'order' : mode.includes('投票') ? 'vote' : 'idle'
  const modeSpecificStyles = {
    order: styles.badge,
    vote: styles.badge,
    both: 'bg-[rgba(245,158,11,0.15)] text-amber-700 border-amber-300',
    idle: 'bg-[#F7F6F3] text-[#787774] border-[#E8E7E4]',
  }
  const text = mode === 'idle' ? '空闲中' : mode
  return <span className={`inline-flex items-center px-3 py-1 rounded-md border text-sm font-medium transition-colors duration-300 ${modeSpecificStyles[normalized] || modeSpecificStyles.idle}`}>{text}</span>
}

function PageTabs({ current }) {
  return (
    <div className="inline-flex p-1 rounded-md bg-[#F7F6F3] border border-[#E8E7E4]">
      <Link
        to="/"
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-300 ${
          current === 'order'
            ? 'bg-[#F59E0B] text-white'
            : 'text-[#787774] hover:bg-white hover:text-[#37352F]'
        }`}
      >
        点餐
      </Link>
      <Link
        to="/vote"
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-300 ${
          current === 'vote'
            ? 'bg-[#8B5CF6] text-white'
            : 'text-[#787774] hover:bg-white hover:text-[#37352F]'
        }`}
      >
        投票
      </Link>
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
  const [selectedSpicy, setSelectedSpicy] = useState({}) // per-dish spicy level: { menuId: level }
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

  // Get mode-specific styles
  const styles = getModeStyles(homeState)

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
        if (firstItem.spicy_level) setSelectedSpicy({ [String(firstItem.menu_id)]: firstItem.spicy_level })
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
    setSelectedSpicy({})
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
        const spicyInfo = parseSpicyOptions(selectedDish?.spicy_options)
        const dishSpicyLevel = selectedSpicy[selectedDishId] || (spicyInfo?.type === 'single' ? spicyInfo.value : 0)
        await submitOrder({
          person: selectedPerson.trim(),
          remark: remark.trim(),
          items: [{ menu_id: Number(selectedDishId), quantity: 1, ...(spicyInfo ? { spicy_level: dishSpicyLevel } : {}) }],
        })
        const spicyLabel = spicyInfo && dishSpicyLevel > 0 ? `（${spicyLevelLabels[dishSpicyLevel]}）` : ''
        setSuccessMsg(`${selectedPerson} 已完成本次点餐：${selectedDish?.name || ''}${spicyLabel}${remark.trim() ? `；备注：${remark.trim()}` : ''}`)
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
    return (
      <div className="min-h-screen bg-white flex items-center justify-center py-24 transition-colors duration-300">
        <div className="animate-spin rounded-md h-12 w-12 border-4 border-[#E8E7E4]" style={{ borderTopColor: styles.accent }}></div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-white transition-colors duration-300">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg border border-[#E8E7E4] p-8 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-[#37352F] mb-2">{showingVoteTab ? '投票成功' : '点餐成功'}</h2>
            <p className="text-[#787774] mb-6">{successMsg}</p>
            <div className={`${styles.sectionTint} rounded-md p-4 text-left text-sm text-[#787774] mb-6 transition-colors duration-300`}>
              <div>姓名：<span className="font-semibold text-[#37352F]">{selectedPerson}</span></div>
              <div>当前活动：<span className="font-semibold text-[#37352F]">{homeState.title || (showingVoteTab ? '投票' : '点餐')}</span></div>
              <div>你的选择：<span className="font-semibold text-[#37352F]">{showingVoteTab ? selectedPizza?.name : selectedDish?.name}</span></div>
              {showingOrderTab && remark.trim() && <div>备注：<span className="font-semibold text-[#37352F]">{remark.trim()}</span></div>}
            </div>
            <button
              onClick={() => { setSuccess(false); setSelectedDishId(''); setSelectedPizzaId(''); setRemark(''); setSelectedSpicy({}); fetchHomeState() }}
              className={`px-6 py-3 text-white rounded-md font-medium transition-colors duration-300 ${styles.accentBg} ${styles.accentHover}`}
            >
              返回继续处理
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white transition-colors duration-300">
      <div className="max-w-3xl mx-auto space-y-6 py-6">
      {/* Header Section */}
      <section className={`bg-white rounded-lg border p-6 md:p-8 transition-all duration-300 ${styles.borderDefault} ${styles.borderHover}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-[#787774] mb-2">当前活动</div>
            <h1 className="text-2xl font-bold text-[#37352F] mb-3">{homeState.title || '无'}</h1>
            <p className="text-[#787774] max-w-xl">请选择姓名后完成当前活动。本页会根据后台状态显示当前可执行的流程。</p>
            {homeState.order?.deadline_at && showingOrderTab && (
              <p className="mt-3 text-sm text-amber-600">⏰ 截止时间：{new Date(homeState.order.deadline_at).toLocaleString()}</p>
            )}
            {homeState.vote?.deadline_at && showingVoteTab && (
              <p className="mt-3 text-sm text-violet-600">⏰ 截止时间：{new Date(homeState.vote.deadline_at).toLocaleString()}</p>
            )}
          </div>
          <div className="flex flex-col gap-3 lg:items-end lg:text-right shrink-0">
            <StatusBadge mode={homeState.mode} styles={styles} />
            <PageTabs current={currentTab} />
          </div>
        </div>
      </section>

      {/* Person Selection */}
      <section className={`bg-white rounded-lg border p-6 transition-all duration-300 ${styles.borderDefault} ${canOperate ? styles.borderHover : ''}`}>
        <div className="text-sm font-semibold text-[#787774] mb-3">第一步 · 选择姓名</div>
        <select
          value={selectedPerson}
          onChange={handlePersonChange}
          disabled={submitting}
          className={`w-full px-4 py-3 rounded-md border border-[#E8E7E4] focus:ring-2 outline-none transition-all duration-300 text-[#37352F] bg-white disabled:opacity-50 ${styles.focusRing}`}
          style={selectedPerson ? { borderColor: styles.accent } : {}}
        >
          <option value="" hidden>请选择你的姓名...</option>
          {personnelList.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
        <p className="mt-3 text-xs text-[#9B9A97]">选择后会自动加载你在当前活动中的已有记录（如果存在）。</p>
      </section>

      {/* Order Section */}
      {showingOrderTab && isOrderMode && (
        <section className={`bg-white rounded-lg border p-6 transition-all duration-300 ${styles.borderDefault} ${styles.borderHover}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-[#787774]">第二步 · 选择菜品</div>
              <div className="text-xs text-[#9B9A97] mt-1">使用下拉框选择菜品，随后设置辣度和备注</div>
            </div>
            {selectedDish && (
              <div className="px-3 py-1 rounded-md text-sm font-medium border border-amber-200 bg-amber-50 text-amber-700">
                已选：{selectedDish.name}
              </div>
            )}
          </div>
          <div className={`rounded-md border p-4 transition-all duration-300 ${styles.borderDefault} ${styles.sectionTint}`}>
            <label className="text-sm font-semibold text-[#37352F] mb-2 block">菜品</label>
            <select
              value={selectedDishId}
              onChange={e => setSelectedDishId(e.target.value)}
              className={`w-full px-4 py-3 rounded-md border border-[#E8E7E4] bg-white text-sm outline-none focus:ring-2 transition-all duration-300 ${styles.focusRing}`}
              style={selectedDishId ? { borderColor: styles.accent } : {}}
            >
              <option value="">请选择菜品...</option>
              {menuList.map(item => {
                const spicyInfo = parseSpicyOptions(item.spicy_options)
                const spicyText = spicyInfo ? (
                  spicyInfo.type === 'single'
                    ? `（固定辣度:${spicyLevelLabels[spicyInfo.value]}）`
                    : '（可选辣度）'
                ) : ''
                return <option key={item.id} value={item.id}>{item.name}{spicyText}</option>
              })}
            </select>
          </div>
          {selectedDish && (() => {
            const spicyInfo = parseSpicyOptions(selectedDish.spicy_options)
            if (!spicyInfo) return null
            const currentLevel = selectedSpicy[selectedDishId] || (spicyInfo.type === 'single' ? spicyInfo.value : null)
            return (
              <div className="mt-4 rounded-md bg-white border border-amber-200 px-4 py-3">
                {spicyInfo.type === 'single' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#787774]">辣度</span>
                    <span className="px-2 py-1 rounded-md bg-[#F59E0B] text-white text-sm font-medium">
                      {'🌶️'.repeat(spicyInfo.value)} {spicyLevelLabels[spicyInfo.value]}
                    </span>
                    <span className="text-xs text-[#9B9A97]">（固定辣度:{spicyLevelLabels[spicyInfo.value]}）</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#787774]">辣度</span>
                    <div className="flex gap-1">
                      {spicyInfo.options.map(opt => (
                        <button
                          key={opt}
                          onClick={() => setSelectedSpicy(prev => ({ ...prev, [selectedDishId]: opt }))}
                          className={`px-3 py-1.5 text-sm rounded-md border transition-all duration-200 ${
                            currentLevel === opt
                              ? 'bg-[#F59E0B] text-white border-[#F59E0B]'
                              : 'bg-white text-[#787774] border-[#E8E7E4] hover:border-[#F59E0B]'
                          }`}
                        >
                          {'🌶️'.repeat(opt)} {spicyLevelLabels[opt]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
          <div className={`mt-4 rounded-md border p-4 transition-all duration-300 ${styles.borderDefault} ${styles.sectionTint}`}>
            <div className="text-sm font-semibold text-[#37352F] mb-2">第三步 · 备注（可选）</div>
            <textarea
              value={remark}
              onChange={e => setRemark(e.target.value)}
              rows={3}
              maxLength={120}
              placeholder="例如：少饭、不要葱、打包分开..."
              className={`w-full rounded-md border border-[#E8E7E4] bg-white px-4 py-3 text-sm outline-none focus:ring-2 transition-all duration-300 ${styles.focusRing}`}
              style={remark.trim() ? { borderColor: styles.accent } : {}}
            />
          </div>
        </section>
      )}

      {/* Vote Section */}
      {showingVoteTab && isVoteMode && activeVote && (
        <section className={`bg-white rounded-lg border p-6 transition-all duration-300 ${styles.borderDefault} ${styles.borderHover}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-[#787774]">第三步 · 选择投票项</div>
              <div className="text-xs text-[#9B9A97] mt-1">每人只能选 1 项，确认后计入当前活动</div>
            </div>
            {selectedPizza && (
              <div className="px-3 py-1 rounded-md text-sm font-medium border border-violet-200 bg-violet-50 text-violet-700">
                已选：{selectedPizza.name}
              </div>
            )}
          </div>
          <div className="space-y-3">
            {(activeVote.pizzas || []).map(pizza => {
              const isSelected = String(selectedPizzaId) === String(pizza.id)
              return (
                <div
                  key={pizza.id}
                  onClick={() => setSelectedPizzaId(isSelected ? '' : String(pizza.id))}
                  className={`rounded-lg border p-5 transition-all duration-300 cursor-pointer ${
                    isSelected
                      ? styles.cardSelected
                      : `${styles.borderDefault} hover:border-violet-200 bg-white`
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-[#37352F] text-lg">{pizza.name}</div>
                      <div className="mt-1 text-xs text-[#9B9A97]">建议分食人数：{pizza.servings} 人</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 rounded-md bg-[#F7F6F3] text-[#787774] text-xs">{pizza.servings}人/个</span>
                      <div className={`w-8 h-8 rounded-md border-2 flex items-center justify-center transition-all duration-300 ${
                        isSelected
                          ? 'text-white'
                          : 'border-[#E8E7E4] text-transparent'
                      }`}
                      style={isSelected ? { borderColor: styles.accent, backgroundColor: styles.accent } : {}}
                      >✓</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Empty State */}
      {!canOperate && (
        <section className={`bg-white rounded-lg border p-10 text-center text-[#787774] transition-all duration-300 ${styles.borderDefault}`}>
          <div className="text-4xl mb-3">🕐</div>
          <div className="text-lg font-semibold text-[#37352F] mb-1">{showingOrderTab ? '当前没有进行中的点餐' : '当前没有进行中的投票'}</div>
          <p>{showingOrderTab ? '如需参与投票，请切换到"投票"标签页。' : '如需点餐，请切换到"点餐"标签页。'}</p>
        </section>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-white border border-[#EB5757] text-[#EB5757] rounded-md text-sm text-center">
          ⚠️ {error}
        </div>
      )}

      {/* Submit Bar */}
      {canOperate && (
        <section className="sticky bottom-4 z-10">
          <div className={`bg-white border rounded-lg p-4 flex flex-col md:flex-row gap-4 md:items-center md:justify-between transition-all duration-300 ${styles.borderDefault}`}>
            <div className="text-sm text-[#787774]">
              {selectedPerson ? <>当前操作人：<span className="font-semibold text-[#37352F]">{selectedPerson}</span></> : '请先选择姓名'}
              {showingOrderTab && selectedDish && <> · 菜品：<span className="font-semibold text-[#37352F]">{selectedDish.name}</span></>}
              {showingVoteTab && selectedPizza && <> · 选项：<span className="font-semibold text-[#37352F]">{selectedPizza.name}</span></>}
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting || (!selectedDishId && !selectedPizzaId)}
              className={`w-full md:w-auto min-w-[180px] px-6 py-3 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-300 ${styles.accentBg} ${styles.accentHover}`}
            >
              {submitting ? '提交中...' : showingVoteTab ? '确认投票' : selectedDish ? '确认点餐' : '请选择后提交'}
            </button>
          </div>
        </section>
      )}
      </div>
    </div>
  )
}