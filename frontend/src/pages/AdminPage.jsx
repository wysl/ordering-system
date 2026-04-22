import { useState, useEffect, useCallback, useRef } from 'react'
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
  importPersonnel,
  getParticipationStatus,
  getVoteSessions,
  endActiveRound,
  getRounds,
  getRoundDetail,
  deleteRound,
  previewDeleteRound,
  bulkExcuse,
  listExcused,
  getStats,
  backupDB,
  restoreDB,
  getActivityLogs,
  getTrashRounds,
  restoreRound,
  purgeRound,
  emptyTrash,
  exportRoundsBatch,
} from '../api'
import { copyText, downloadBlob, getModeStyles } from './adminShared'
import {
  TabSwitch,
  ActivityCard,
  HistoryBlock,
  RoundDetailModal,
  PeopleManagementSection,
  OrderManagementSection,
  VoteManagementSection,
  StatsDashboard,
  DatabaseManagementSection,
} from './AdminSections'

export default function AdminPage({ defaultTab = 'order' }) {
  const currentTab = defaultTab === 'people' ? 'people' : defaultTab === 'vote' ? 'vote' : defaultTab === 'stats' ? 'stats' : 'order'
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
  const [participation, setParticipation] = useState(null)
  const [roundsData, setRoundsData] = useState({ items: [], page: 1, page_size: 5, total: 0, total_pages: 0 })
  const [roundDetail, setRoundDetail] = useState(null)
  const [personnelOptions, setPersonnelOptions] = useState([])
  const [roundSearch, setRoundSearch] = useState('')
  const [roundDate, setRoundDate] = useState('')
  const [historyModeFilter, setHistoryModeFilter] = useState('')
  const [showGuide, setShowGuide] = useState(false)
  const [excusedPersons, setExcusedPersons] = useState([])
  const [statsData, setStatsData] = useState(null)
  const [sseConnected, setSseConnected] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [logs, setLogs] = useState([])
  const [trashRounds, setTrashRounds] = useState([])
  const [selectedRoundIds, setSelectedRoundIds] = useState([])

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

  const fetchRounds = useCallback(async (page = 1) => {
    try {
      setRoundsData((await getRounds({ page, page_size: 5, keyword: roundSearch.trim(), date: roundDate || undefined })).data || { items: [] })
    }
    catch { setRoundsData({ items: [], page: 1, page_size: 5, total: 0, total_pages: 0 }) }
  }, [roundSearch, roundDate])

  const fetchPersonnelOptions = useCallback(async () => {
    try {
      const mode = currentTab === 'vote' ? 'vote' : 'order'
      const [personRes, excuseRes] = await Promise.all([getPersonnel(), listExcused(mode)])
      const persons = personRes.data || []
      const excused = excuseRes.data || []
      setPersonnelOptions(persons.map(p => ({ ...p, excused: excused.some(e => e.id === p.id) })))
      setExcusedPersons(excused)
    }
    catch { setPersonnelOptions([]) }
  }, [currentTab])

  const handleBulkExcuse = async (names) => {
    if (!names?.length) return
    if (!confirm(`确认将 ${names.length} 人标记为已请假？`)) return
    try {
      await bulkExcuse(names, 'excuse', currentTab)
      setSuccessMsg(`已标记 ${names.length} 人为已请假`)
      fetchParticipation()
      fetchPersonnelOptions()
    } catch (e) {
      setErrorMsg(e.response?.data?.error || '操作失败')
    }
  }

  const handleBulkMarkUnexcuse = async () => {
    if (excusedPersons.length === 0) return
    if (!confirm(`确认将 ${excusedPersons.length} 人取消请假状态？`)) return
    try {
      await bulkExcuse(excusedPersons.map(p => p.name), 'unexcuse', currentTab)
      setSuccessMsg('已取消所有请假状态')
      fetchParticipation()
      fetchPersonnelOptions()
    } catch (e) {
      setErrorMsg(e.response?.data?.error || '操作失败')
    }
  }

  const refreshAll = useCallback(() => {
    fetchMenu()
    fetchOrders()
    fetchVotes()
    fetchParticipation()
    fetchRounds()
    fetchPersonnelOptions()
    fetchLogs()
    fetchTrashRounds()
    if (currentTab === 'stats') fetchStats()
  }, [fetchMenu, fetchOrders, fetchVotes, fetchParticipation, fetchRounds, fetchPersonnelOptions, currentTab])

  const fetchStats = useCallback(async () => {
    try { setStatsData((await getStats()).data) }
    catch { setStatsData(null) }
  }, [])

  const fetchLogs = useCallback(async (params = {}) => {
    try { setLogs((await getActivityLogs(params)).data || []) }
    catch { setLogs([]) }
  }, [])

  const fetchTrashRounds = useCallback(async () => {
    try { setTrashRounds((await getTrashRounds()).data || []) }
    catch { setTrashRounds([]) }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('admin_token')
    if (saved) {
      setAdminToken(saved)
      setIsLogin(true)
      refreshAll()
    }
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
    } catch (e) {
      setLoginError(e.response?.data?.error || '登录失败')
    }
  }

  const handleLogout = () => {
    setAdminToken('')
    localStorage.removeItem('admin_token')
    setIsLogin(false)
  }

  // SSE effect for real-time participation status
  useEffect(() => {
    if (!isLogin || currentTab === 'stats') return

    let es
    let reconnectTimer
    const modeParam = currentTab === 'people' ? '' : `?mode=${currentTab}`

    const connect = () => {
      try {
        es = new EventSource(`/api/admin/stream${modeParam}`)
        setSseConnected(true)
        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data)
            setParticipation(prev => ({
              ...prev,
              mode: data.mode,
              round_id: data.round_id,
              title: data.title,
              deadline_at: data.deadline_at,
              total_count: data.total_count,
              done_count: data.done_count,
              pending: data.pending,
              summary: {
                pending_count: data.pending?.length || 0,
                completion_rate: data.completion_rate || 0,
                done_count: data.done_count || 0,
                total_count: data.total_count || 0,
              },
            }))
          } catch {}
        }
        es.onerror = () => {
          setSseConnected(false)
          es?.close()
          reconnectTimer = setTimeout(connect, 5000)
        }
      } catch {
        setSseConnected(false)
      }
    }

    connect()

    return () => {
      es?.close()
      clearTimeout(reconnectTimer)
      setSseConnected(false)
    }
  }, [isLogin, currentTab])

  // Fetch stats when stats tab is shown
  useEffect(() => {
    if (isLogin && currentTab === 'stats') {
      fetchStats()
    }
  }, [isLogin, currentTab, fetchStats])

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
    } catch (err) {
      setErrorMsg(err.response?.data?.error || '导入失败')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
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
    } catch (err) {
      setErrorMsg(err.response?.data?.error || '导入失败')
    } finally {
      setImportingPersonnel(false)
      e.target.value = ''
    }
  }

  const handleDeleteMenu = async (id, name) => {
    if (!confirm(`确认删除「${name}」？`)) return
    try {
      await deleteMenuItem(id)
      refreshAll()
    } catch {
      setErrorMsg('删除失败')
    }
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
    } catch (e) {
      setErrorMsg(e.response?.data?.error || '创建失败')
    } finally {
      setCreatingVote(false)
    }
  }

  const handleEndRound = async () => {
    if (!confirm('确认结束当前活动？')) return
    try {
      await endActiveRound(currentTab === 'people' ? '' : currentTab)
      refreshAll()
    } catch {
      setErrorMsg('结束失败')
    }
  }

  const handleViewRound = async (id) => {
    try {
      setRoundDetail((await getRoundDetail(id)).data)
    } catch {
      setErrorMsg('详情加载失败')
    }
  }

  const handleExportCurrent = async (mode) => {
    try {
      const res = await exportOrders(mode)
      await downloadBlob(new Blob([res.data], { type: res.data?.type || 'text/html;charset=utf-8' }), `${mode === 'vote' ? '投票' : '点餐'}_${new Date().toLocaleDateString()}.html`)
    } catch {
      setErrorMsg('导出失败')
    }
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
    try {
      const preview = (await previewDeleteRound(id)).data
      const impact = preview.impact || {}
      const lines = Object.entries(impact).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${key}: ${value}`)
      if (!confirm(`确认删除历史 #${id}？\n\n影响范围：\n${lines.join('\n') || '无关联数据'}`)) return
      await deleteRound(id)
      setSuccessMsg(`已删除历史 #${id}`)
      fetchRounds(roundsData.page || 1)
    } catch (e) {
      setErrorMsg(e.response?.data?.error || '删除历史失败')
    }
  }

  const handleCopyReminder = async (pending) => {
    const text = `还未参与：${pending.join('、')}`
    try {
      await copyText(text)
      setSuccessMsg('催单名单已复制')
    } catch {
      setErrorMsg('复制失败')
    }
  }

  const handleDownloadTemplate = async (type) => {
    try {
      const res = await downloadTemplate(type)
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = type === 'personnel' ? '人员模板.csv' : '菜单模板.xlsx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setErrorMsg('下载模板失败')
    }
  }

  const handleBackupDB = async () => {
    try {
      const res = await backupDB()
      const blob = new Blob([res.data], { type: 'application/zip' })
      const timestamp = new Date().toLocaleString().replace(/[/:\s]/g, '').replace(/,/g, '')
      await downloadBlob(blob, `ordering_backup_${timestamp}.zip`)
      setSuccessMsg('数据库备份已下载')
    } catch {
      setErrorMsg('备份失败')
    }
  }

  const handleBatchExport = async () => {
    const ids = selectedRoundIds.length ? selectedRoundIds : (roundsData.items || []).filter(r => !r.active).slice(0, 10).map(r => r.id)
    if (!ids.length) return setErrorMsg('暂无可批量导出的历史')
    try {
      const res = await exportRoundsBatch(ids)
      await downloadBlob(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `历史批量导出_${new Date().toLocaleDateString()}.xlsx`)
      setSuccessMsg('批量导出完成')
    } catch {
      setErrorMsg('批量导出失败')
    }
  }

  const handleRestoreRound = async (id) => {
    try {
      await restoreRound(id)
      setSuccessMsg(`已恢复历史 #${id}`)
      fetchTrashRounds()
      fetchRounds(roundsData.page || 1)
      fetchLogs()
    } catch (e) {
      setErrorMsg(e.response?.data?.error || '恢复历史失败')
    }
  }

  const handlePurgeRound = async (id) => {
    if (!confirm(`确认永久删除历史 #${id}？此操作不可恢复。`)) return
    try {
      await purgeRound(id)
      setSuccessMsg(`已永久删除历史 #${id}`)
      fetchTrashRounds()
      fetchLogs()
    } catch (e) {
      setErrorMsg(e.response?.data?.error || '永久删除失败')
    }
  }

  const handleEmptyTrash = async () => {
    if (!confirm('确认清空回收站？此操作不可恢复。')) return
    try {
      await emptyTrash()
      setSuccessMsg('回收站已清空')
      fetchTrashRounds()
      fetchLogs()
    } catch (e) {
      setErrorMsg(e.response?.data?.error || '清空回收站失败')
    }
  }

  const handleToggleRound = (id) => {
    setSelectedRoundIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleSelectPage = () => {
    const pageIds = (roundsData.items || []).filter(r => !r.active).map(r => r.id)
    setSelectedRoundIds(pageIds)
  }

  const handleRestoreDB = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm(`确认恢复数据库？当前数据将被覆盖！\n\n文件名：${file.name}\n\n恢复后请刷新页面。`)) {
      e.target.value = ''
      return
    }
    setRestoring(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const res = await restoreDB(file, true)
      setSuccessMsg('数据库恢复成功，请刷新页面！')
    } catch (err) {
      setErrorMsg(err.response?.data?.error || '恢复失败')
    } finally {
      setRestoring(false)
      e.target.value = ''
    }
  }

  const addPizzaOption = () => setVotePizzas(prev => [...prev, { name: '', servings: 4 }])
  const removePizzaOption = (idx) => setVotePizzas(prev => prev.filter((_, i) => i !== idx))
  const updatePizzaOption = (idx, field, value) => setVotePizzas(prev => prev.map((p, i) => i === idx ? { ...p, [field]: field === 'servings' ? parseInt(value, 10) || 1 : value } : p))
  const toggleExpand = (name) => setExpandedItems(prev => ({ ...prev, [name]: !prev[name] }))

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

        {currentTab !== 'people' && currentTab !== 'stats' && <ActivityCard participation={participation} onEnd={handleEndRound} onRefresh={refreshAll} currentTab={currentTab} onCopyReminder={handleCopyReminder} onBulkExcuse={handleBulkExcuse} onBulkMarkUnexcuse={handleBulkMarkUnexcuse} excusedCount={excusedPersons.length} sseConnected={sseConnected} />}

        {currentTab === 'people' && (
          <PeopleManagementSection
            importingPersonnel={importingPersonnel}
            handlePersonnelImport={handlePersonnelImport}
            handleDownloadTemplate={handleDownloadTemplate}
            fetchPersonnelOptions={fetchPersonnelOptions}
            personnelOptions={personnelOptions}
            excusedPersons={excusedPersons}
            onBulkUnexcuse={handleBulkMarkUnexcuse}
          />
        )}

        {currentTab === 'order' && (
          <OrderManagementSection
            styles={styles}
            importing={importing}
            handleImport={handleImport}
            handleDownloadTemplate={handleDownloadTemplate}
            menuList={menuList}
            fetchMenu={fetchMenu}
            menuLoading={menuLoading}
            handleDeleteMenu={handleDeleteMenu}
            orders={orders}
            ordersLoading={ordersLoading}
            fetchOrders={fetchOrders}
            orderSummary={orderSummary}
            expandedItems={expandedItems}
            toggleExpand={toggleExpand}
            handleExportCurrent={handleExportCurrent}
          />
        )}

        {currentTab === 'vote' && (
          <VoteManagementSection
            styles={styles}
            voteTitle={voteTitle}
            setVoteTitle={setVoteTitle}
            votePizzas={votePizzas}
            updatePizzaOption={updatePizzaOption}
            removePizzaOption={removePizzaOption}
            addPizzaOption={addPizzaOption}
            handleCreateVote={handleCreateVote}
            creatingVote={creatingVote}
            voteSessions={voteSessions}
            voteLoading={voteLoading}
            handleExportCurrent={handleExportCurrent}
          />
        )}

        {currentTab === 'stats' && (
          <StatsDashboard stats={statsData} onRefresh={fetchStats} />
        )}

        {(currentTab === 'stats' || currentTab === 'people') && (
          <HistoryBlock
            roundsData={roundsData}
            roundSearch={roundSearch}
            setRoundSearch={setRoundSearch}
            roundDate={roundDate}
            setRoundDate={setRoundDate}
            fetchRounds={fetchRounds}
            onView={handleViewRound}
            onExport={handleExportHistory}
            onDelete={handleDeleteRound}
            onPageChange={fetchRounds}
            currentTab={currentTab}
            selectedRoundIds={selectedRoundIds}
            onToggleRound={handleToggleRound}
            onSelectPage={handleSelectPage}
            onBatchExportSelected={handleBatchExport}
            modeFilter={historyModeFilter}
            setModeFilter={setHistoryModeFilter}
          />
        )}
        {currentTab !== 'people' && <RoundDetailModal roundDetail={roundDetail} onClose={() => setRoundDetail(null)} />}

        {(currentTab === 'people' || currentTab === 'stats') && (
          <DatabaseManagementSection
            onBackup={handleBackupDB}
            onRestore={handleRestoreDB}
            restoring={restoring}
            logs={logs}
            trashRounds={trashRounds}
            onRestoreRound={handleRestoreRound}
            onPurgeRound={handlePurgeRound}
            onEmptyTrash={handleEmptyTrash}
            onBatchExport={handleBatchExport}
          />
        )}
      </div>
    </div>
  )
}
