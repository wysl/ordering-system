import { useState } from 'react'
import { Link } from 'react-router-dom'
import { copyText, modeStyles, getModeStyles, spicyLevelLabels, formatSpicyOptions, percentage } from './adminShared'
import { getStats, getStatsMonthShops, getStatsMonthDishes } from '../api'

export function TabSwitch({ current }) {
  return (
    <div className="inline-flex p-1 rounded-md bg-[#F7F6F3] border border-[#E8E7E4]">
      <Link to="/admin/people" className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-300 ${current === 'people' ? modeStyles.people.tabActive : 'text-[#787774] hover:bg-white hover:text-[#37352F]'}`}>人员管理</Link>
      <Link to="/admin" className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-300 ${current === 'order' ? modeStyles.order.tabActive : 'text-[#787774] hover:bg-white hover:text-[#37352F]'}`}>点餐</Link>
      <Link to="/admin/vote" className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-300 ${current === 'vote' ? modeStyles.vote.tabActive : 'text-[#787774] hover:bg-white hover:text-[#37352F]'}`}>投票</Link>
      <Link to="/admin/stats" className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-300 ${current === 'stats' ? 'bg-[#2EAADC] text-white' : 'text-[#787774] hover:bg-white hover:text-[#37352F]'}`}>📊 统计</Link>
    </div>
  )
}

export function ActivityCard({ participation, onEnd, onRefresh, currentTab, onCopyReminder, onBulkExcuse, onBulkMarkUnexcuse, excusedCount, sseConnected }) {
  if (!participation) return null
  const styles = getModeStyles(currentTab)
  const modeClass = participation.mode === 'order' ? modeStyles.order.badge : participation.mode === 'vote' ? modeStyles.vote.badge : 'bg-[#F7F6F3] text-[#787774] border-[#E8E7E4]'
  const modeText = participation.mode === 'order' ? '点餐进行中' : participation.mode === 'vote' ? '投票进行中' : '空闲中'
  const endText = participation.mode === 'order' ? '结束本次点单' : participation.mode === 'vote' ? '结束本次投票' : '结束当前活动'
  const summary = participation.summary || {}
  const percent = percentage(summary.done_count || participation.done_count || 0, summary.total_count || participation.total_count || 0)
  const pending = participation.pending || []

  return (
    <div className="rounded-lg border border-[#E8E7E4] bg-white p-6 space-y-5">
      {/* Top row: summary + pending panel */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="text-sm text-[#787774]">当前活动</div>
            {sseConnected && <span className="text-xs px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#DC2626] font-medium">🔴 LIVE</span>}
          </div>
          <h2 className="text-xl font-bold text-[#37352F] mb-3">
            {participation.mode === 'idle'
              ? (currentTab === 'vote' ? '当前未有投票活动' : '当前未有点餐活动')
              : (participation.title || `#${participation.round_id || ''}`)}
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className={`px-3 py-1 rounded-md text-sm border transition-colors duration-300 ${modeClass}`}>{modeText}</span>
            <span className="px-3 py-1 rounded-md text-sm border border-[#E8E7E4] transition-colors duration-300" style={{ backgroundColor: styles.accentLight, color: styles.accent }}>完成率 {percent}%</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCell label="总人数" value={summary.total_count ?? participation.total_count ?? 0} />
            <SummaryCell label="已参与" value={summary.done_count ?? participation.done_count ?? 0} accent={styles.accent} />
            <SummaryCell label="未参与" value={summary.pending_count ?? Math.max((participation.total_count || 0) - (participation.done_count || 0), 0)} warn />
            {excusedCount > 0 && <SummaryCell label="已请假" value={`${excusedCount}人`} />}
          </div>
        </div>
        {/* Pending people panel */}
        <div className="rounded-lg border border-[#E8E7E4] bg-[#FAFAF9] p-4">
          <div className="text-sm font-semibold text-[#37352F] mb-2">未参与名单</div>
          <div className="w-full h-2 rounded-md bg-[#F1F1EF] overflow-hidden mb-3"><div className="h-full transition-colors duration-300" style={{ width: `${percent}%`, backgroundColor: styles.accent }} /></div>
          {pending.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-auto pr-1">
                {pending.map(name => <span key={name} className="px-3 py-1 bg-[#FFF4E5] text-[#9A6700] rounded-md text-sm border border-[#F3D9A4]">{name}</span>)}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => onCopyReminder?.(pending)} className="px-3 py-2 rounded-md text-sm bg-white border border-[#E8E7E4] hover:bg-[#F7F6F3] transition">📋 复制催单</button>
                  <button onClick={() => onBulkExcuse?.(pending)} className="px-3 py-2 rounded-md text-sm bg-white border border-[#E8E7E4] hover:bg-[#F7F6F3] transition text-[#787774]">🙋 批量请假</button>
                </div>
              </div>
            </>
          ) : <div className="text-sm text-[#4EAD5B]">全部已参与，状态很好。</div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button onClick={onEnd} className={`px-4 py-2 rounded-md text-white hover:opacity-90 transition-colors duration-300 text-sm ${styles.accentBg}`}>{endText}</button>
        <button onClick={onRefresh} className="px-4 py-2 rounded-md border border-[#E8E7E4] bg-white hover:bg-[#F7F6F3] transition text-sm text-[#787774]">刷新状态</button>
      </div>
    </div>
  )
}

function SummaryCell({ label, value, accent, warn }) {
  return (
    <div className={`rounded-md border p-3 ${warn ? 'bg-[#FFF7ED] border-[#FED7AA]' : 'bg-white border-[#E8E7E4]'}`}>
      <div className="text-xs text-[#9B9A97] mb-1">{label}</div>
      <div className="text-lg font-semibold" style={{ color: accent || (warn ? '#C2410C' : '#37352F') }}>{value}</div>
    </div>
  )
}

export function HistoryBlock({ roundsData, currentTab, roundSearch, setRoundSearch, roundDate, setRoundDate, fetchRounds, onView, onExport, onDelete, onPageChange, selectedRoundIds = [], onToggleRound, onSelectPage, onBatchExportSelected, modeFilter = '', setModeFilter }) {
  const styles = getModeStyles(currentTab)
  const items = (roundsData?.items || []).filter(round => {
    if (currentTab === 'people') return true
    if (currentTab === 'stats') return !modeFilter || round.mode === modeFilter
    return round.mode === currentTab
  })
  return (
    <div className="bg-white rounded-lg border border-[#E8E7E4] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E8E7E4] flex items-center justify-between">
        <h3 className="font-semibold text-[#37352F]">🕘 历史轮次</h3>
        <div className="flex items-center gap-2">
          <button onClick={onSelectPage} className="text-xs px-3 py-1.5 rounded-md border border-[#E8E7E4] bg-white hover:bg-[#F7F6F3] transition text-[#787774]">本页全选</button>
          <button onClick={onBatchExportSelected} disabled={!selectedRoundIds.length} className="text-xs px-3 py-1.5 rounded-md border border-[#E8E7E4] bg-white hover:bg-[#F7F6F3] transition disabled:opacity-40 text-[#787774]">导出选中({selectedRoundIds.length})</button>
          <button onClick={() => fetchRounds(1)} className="text-sm transition-colors duration-300" style={{ color: styles.accent }}>↻ 刷新</button>
        </div>
      </div>
      <div className="px-5 py-4 border-b border-[#E8E7E4] grid gap-3 md:grid-cols-[1fr_180px_160px_auto]">
        <input value={roundSearch} onChange={e => setRoundSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchRounds(1)} placeholder="搜索标题或轮次ID" className="w-full px-4 py-3 rounded-md border border-[#E8E7E4] text-sm focus:border-current outline-none transition-colors duration-300" style={{ borderColor: styles.accent }} />
        <input type="date" value={roundDate} onChange={e => setRoundDate(e.target.value)} className="w-full px-4 py-3 rounded-md border border-[#E8E7E4] text-sm outline-none" />
        {currentTab === 'stats' ? <select value={modeFilter} onChange={e => setModeFilter?.(e.target.value)} className="w-full px-4 py-3 rounded-md border border-[#E8E7E4] text-sm outline-none bg-white"><option value="">全部轮次</option><option value="order">只看点餐</option><option value="vote">只看投票</option></select> : <div />}
        <button onClick={() => fetchRounds(1)} className={`px-4 py-3 rounded-md text-white text-sm ${styles.accentBg}`}>筛选</button>
      </div>
      {items.length === 0 ? <div className="py-10 text-center text-[#787774]">暂无匹配历史</div> : <div className="divide-y divide-[#E8E7E4]">{items.filter(round => !round.active).map(round => {
        const roundStyles = getModeStyles(round.mode)
        return <div key={round.id} className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-[#F7F6F3] transition">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <input type="checkbox" checked={selectedRoundIds.includes(round.id)} onChange={() => onToggleRound?.(round.id)} className="mt-1" />
            <div className="flex-1 min-w-0">
            <div className="font-medium text-[#37352F] truncate">{round.title || `#${round.id}`}<span className="text-xs text-[#9B9A97] ml-2">#{round.id}</span></div>
            <div className="text-xs text-[#9B9A97] mt-1">{new Date(round.created_at).toLocaleString()}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-1 rounded-md text-xs border ${roundStyles.tag}`}>{round.mode === 'order' ? '点餐' : '投票'}</span>
            <span className="text-sm text-[#787774]">{round.count}人</span>
            <button onClick={() => onView(round.id)} className="px-2 py-1 text-xs rounded border border-[#E8E7E4] hover:bg-[#F7F6F3] transition" style={{ color: styles.accent }}>详情</button>
            {round.mode === currentTab && <button onClick={() => onExport(round.id)} className="px-2 py-1 text-xs rounded border border-[#E8E7E4] hover:bg-[#F7F6F3] transition" style={{ color: styles.accent }}>导出</button>}
            <button onClick={() => onDelete(round.id)} className="px-2 py-1 text-xs rounded text-[#EB5757] hover:text-[#D94A4A] transition">删除</button>
          </div>
        </div>
      })}</div>}
      {(roundsData?.total_pages || 0) > 1 && <div className="px-5 py-4 border-t border-[#E8E7E4] flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[#787774]">
        <span>第 {roundsData.page}/{roundsData.total_pages} 页 · 共 {roundsData.total} 条</span>
        <div className="flex gap-2">
          <button disabled={roundsData.page <= 1} onClick={() => onPageChange(roundsData.page - 1)} className="px-3 py-1.5 rounded-md border border-[#E8E7E4] disabled:opacity-40 hover:bg-[#F7F6F3] transition">上一页</button>
          <button disabled={roundsData.page >= roundsData.total_pages} onClick={() => onPageChange(roundsData.page + 1)} className="px-3 py-1.5 rounded-md border border-[#E8E7E4] disabled:opacity-40 hover:bg-[#F7F6F3] transition">下一页</button>
        </div>
      </div>}
    </div>
  )
}

export function RoundDetailModal({ roundDetail, onClose }) {
  if (!roundDetail) return null
  const round = roundDetail.round
  const isOrder = round?.mode === 'order'

  // Build aggregation stats
  const aggStats = buildAggregationStats(roundDetail)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[#37352F] text-lg">📚 {round?.title || `#${round?.id}`}</h3>
        <button onClick={onClose} className="text-sm text-[#787774] hover:text-[#37352F] px-3 py-1.5 rounded-md hover:bg-[#F7F6F3] transition">关闭</button>
      </div>

      {/* Aggregation Stats */}
      {aggStats && (
        <div className="rounded-lg border border-[#E8E7E4] p-4 bg-[#FAFAF9]">
          <h4 className="text-sm font-semibold text-[#37352F] mb-3">{isOrder ? '🍽️ 菜品热度榜' : '🗳️ 投票分布'}</h4>
          {isOrder ? <DishBarChart items={aggStats.dishes} accent="#F59E0B" /> : <VoteBarChart items={aggStats.votes} accent="#8B5CF6" />}
        </div>
      )}

      {/* Detail list */}
      <div className="rounded-lg border border-[#E8E7E4] overflow-hidden max-h-80 overflow-y-auto">
        {isOrder ? (
          (roundDetail.orders || []).length === 0 ? <div className="py-8 text-center text-[#787774]">暂无订单</div> :
          (roundDetail.orders || []).map(order => (
            <div key={order.id} className="px-4 py-3 border-b border-[#E8E7E4] last:border-0 hover:bg-[#F7F6F3] transition">
              <div className="font-medium text-[#37352F] text-sm">{order.person}</div>
              <div className="mt-1 text-xs text-[#787774] space-y-0.5">
                {(order.items || []).map((item, idx) => <div key={idx}>{item.menu?.name} × {item.quantity} {item.spicy_level > 0 ? `· ${spicyLevelLabels[item.spicy_level]}` : ''}</div>)}
              </div>
            </div>
          ))
        ) : (
          (roundDetail.vote_sessions || []).length === 0 ? <div className="py-8 text-center text-[#787774]">暂无投票</div> :
          (roundDetail.vote_sessions || []).map(vs => (
            <div key={vs.id} className="px-4 py-3 border-b border-[#E8E7E4] last:border-0 hover:bg-[#F7F6F3] transition">
              <div className="font-medium text-[#37352F] text-sm mb-2">{vs.title}</div>
              {(vs.votes || []).map((v, idx) => <div key={idx} className="text-xs text-[#787774] py-0.5">{v.person} → {v.pizza?.name || `选项#${v.pizza_id}`}</div>)}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function buildAggregationStats(roundDetail) {
  const round = roundDetail.round
  if (!round) return null
  if (round.mode === 'order') {
    const counts = {}
    ;(roundDetail.orders || []).forEach(order => {
      ;(order.items || []).forEach(item => {
        const name = item.menu?.name || '未知'
        if (!counts[name]) counts[name] = 0
        counts[name] += item.quantity
      })
    })
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const max = sorted[0]?.[1] || 1
    return { dishes: sorted.map(([name, count]) => ({ name, count, pct: Math.round((count / max) * 100) })) }
  } else {
    const counts = {}
    ;(roundDetail.vote_sessions || []).forEach(vs => {
      ;(vs.votes || []).forEach(v => {
        const name = v.pizza?.name || `选项#${v.pizza_id}`
        if (!counts[name]) counts[name] = 0
        counts[name]++
      })
    })
    const total = Object.values(counts).reduce((s, c) => s + c, 0)
    const max = Object.values(counts)[0] || 1
    return { votes: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count, pct: Math.round((count / max) * 100), share: total > 0 ? Math.round((count / total) * 100) : 0 })) }
  }
}

function DishBarChart({ items, accent }) {
  if (!items || items.length === 0) return <div className="text-sm text-[#787774]">暂无数据</div>
  return (
    <div className="space-y-2">
      {items.slice(0, 8).map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-[#787774] w-4 text-right shrink-0">{i + 1}</span>
          <span className="text-sm text-[#37352F] w-28 truncate shrink-0">{item.name}</span>
          <div className="flex-1 h-5 bg-[#F1F1EF] rounded-md overflow-hidden min-w-24">
            <div className="h-full rounded-md transition-all duration-500 flex items-center justify-end pr-2" style={{ width: `${item.pct}%`, backgroundColor: accent, opacity: 0.7 + (item.pct / 100) * 0.3 }}>
              {item.pct > 30 && <span className="text-xs text-white font-semibold whitespace-nowrap">{item.count}份</span>}
            </div>
          </div>
          {item.pct <= 30 && <span className="text-xs text-[#787774] whitespace-nowrap">{item.count}份</span>}
        </div>
      ))}
    </div>
  )
}

function VoteBarChart({ items, accent }) {
  if (!items || items.length === 0) return <div className="text-sm text-[#787774]">暂无数据</div>
  return (
    <div className="space-y-2">
      {items.slice(0, 8).map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-[#787774] w-4 text-right shrink-0">{i + 1}</span>
          <span className="text-sm text-[#37352F] w-28 truncate shrink-0">{item.name}</span>
          <div className="flex-1 h-5 bg-[#F1F1EF] rounded-md overflow-hidden min-w-24">
            <div className="h-full rounded-md transition-all duration-500 flex items-center justify-end pr-2" style={{ width: `${item.pct}%`, backgroundColor: accent, opacity: 0.7 + (item.pct / 100) * 0.3 }}>
              {item.pct > 30 && <span className="text-xs text-white font-semibold whitespace-nowrap">{item.count}票</span>}
            </div>
          </div>
          {item.pct <= 30 && <span className="text-xs text-[#787774] whitespace-nowrap">{item.count}票 ({item.share}%)</span>}
        </div>
      ))}
    </div>
  )
}

export function PeopleManagementSection({ importingPersonnel, handlePersonnelImport, handleDownloadTemplate, fetchPersonnelOptions, personnelOptions, onBulkUnexcuse, excusedPersons }) {
  return <div className="bg-white rounded-lg border border-[#E8E7E4] p-5 space-y-5"><h3 className="font-semibold text-[#37352F]">👤 人员管理</h3><div className="flex flex-col gap-3"><label className="w-full"><input type="file" accept=".csv" onChange={handlePersonnelImport} disabled={importingPersonnel} className="block w-full text-sm text-[#787774] file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[#F7F6F3] file:text-[#37352F] hover:file:bg-[#EFEFED] cursor-pointer disabled:opacity-50" /></label>{importingPersonnel && <span className="text-sm text-[#9B9A97]">导入中...</span>}<div className="flex gap-3 flex-wrap"><button onClick={() => handleDownloadTemplate('personnel')} className="px-4 py-2 text-sm text-[#787774] rounded-md border border-[#E8E7E4] bg-white hover:bg-[#F7F6F3] transition">下载人员模板</button><button onClick={fetchPersonnelOptions} className="px-4 py-2 text-sm text-[#787774] rounded-md border border-[#E8E7E4] bg-white hover:bg-[#F7F6F3] transition">刷新名单</button></div></div><div className="flex flex-wrap gap-2">{personnelOptions.map(p => <span key={p.id} className={`px-3 py-1 rounded-md text-sm border ${p.excused ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : 'bg-[#F7F6F3] text-[#37352F] border-[#E8E7E4]'}`}>{p.name}{p.excused ? ' 🙋' : ''}</span>)}</div>{excusedPersons?.length > 0 && <div className="pt-4 border-t border-[#E8E7E4]"><h4 className="text-sm font-semibold text-[#37352F] mb-2">🙋 已请假人员</h4><div className="flex flex-wrap gap-2 mb-3">{excusedPersons.map(p => <span key={p.id} className="px-3 py-1 bg-[#FFF7ED] text-[#C2410C] rounded-md text-sm border border-[#FED7AA]">{p.name}</span>)}</div><button onClick={onBulkUnexcuse} className="px-4 py-2 text-sm rounded-md border border-[#E8E7E4] bg-white hover:bg-[#F7F6F3] transition text-[#787774]">取消所有请假状态</button></div>}</div>
}

export function OrderManagementSection({ styles, importing, handleImport, handleDownloadTemplate, menuList, fetchMenu, menuLoading, handleDeleteMenu, orders, ordersLoading, fetchOrders, orderSummary, expandedItems, toggleExpand, handleExportCurrent }) {
  return <div className="space-y-6"><div className="bg-white rounded-lg border border-[#E8E7E4] p-5"><h3 className="font-semibold text-[#37352F] mb-3">📤 导入菜单并开启点餐</h3><div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-3"><label className="flex-1"><input type="file" accept=".csv,.xlsx" onChange={handleImport} disabled={importing} className="block w-full text-sm text-[#787774] file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[#F7F6F3] file:text-[#37352F] hover:file:bg-[#EFEFED] cursor-pointer disabled:opacity-50" /></label>{importing && <span className="text-sm text-[#9B9A97] shrink-0">导入中...</span>}</div><p className="text-xs text-[#9B9A97] mb-3">支持 CSV / XLSX；A1 填店名/本轮标题，A2 开始填菜品，B2 开始可选填辣度。</p><div className="flex gap-3 flex-wrap"><button onClick={() => handleDownloadTemplate('spicy')} className="px-4 py-2 text-sm bg-[#F7F6F3] text-[#787774] rounded-md border border-[#E8E7E4] transition">📥 下载模板</button></div></div><div className="bg-white rounded-lg border border-[#E8E7E4] overflow-hidden"><div className="px-5 py-4 border-b border-[#E8E7E4] flex items-center justify-between"><h3 className="font-semibold text-[#37352F]">🍽️ 当前点餐菜品</h3><button onClick={fetchMenu} disabled={menuLoading} className="text-sm transition-colors duration-300" style={{ color: styles.accent }}>{menuLoading ? '刷新中...' : '↻ 刷新'}</button></div>{menuList.length === 0 ? <div className="py-12 text-center text-[#787774]">当前没有进行中的点餐</div> : <div className="divide-y divide-[#E8E7E4]">{menuList.map(item => <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#F7F6F3] transition"><div className="flex items-center gap-2 min-w-0"><span className="font-medium text-[#37352F] truncate">{item.name}</span><span className="text-sm text-[#787774] shrink-0">{formatSpicyOptions(item.spicy_options)}</span></div><button onClick={() => handleDeleteMenu(item.id, item.name)} className="px-3 py-1.5 text-xs rounded-md text-[#EB5757] hover:bg-white hover:text-[#D94A4A] transition border border-[#E8E7E4] shrink-0">删除</button></div>)}</div>}</div><div className="bg-white rounded-lg border border-[#E8E7E4] overflow-hidden"><div className="px-5 py-4 border-b border-[#E8E7E4] flex items-center justify-between"><h3 className="font-semibold text-[#37352F]">📊 当前点餐汇总</h3><button onClick={fetchOrders} disabled={ordersLoading} className="text-sm transition-colors duration-300" style={{ color: styles.accent }}>{ordersLoading ? '加载中...' : '↻ 刷新'}</button></div>{!orders ? <div className="py-12 text-center text-[#787774]">点击刷新加载数据</div> : orderSummary.length === 0 ? <div className="py-12 text-center text-[#787774]">暂无订单</div> : <div className="divide-y divide-[#E8E7E4]">{orderSummary.map(itemSummary => <div key={itemSummary.name}><button onClick={() => toggleExpand(itemSummary.name)} className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#F7F6F3] transition text-left"><span className="font-medium text-[#37352F] truncate">{itemSummary.name}</span><span className="flex items-center gap-3 shrink-0"><span className="px-3 py-0.5 rounded-md text-sm font-bold transition-colors duration-300" style={{ backgroundColor: styles.accentLight, color: styles.accent }}>{itemSummary.total} 份</span><span className="text-[#787774] text-xs">{expandedItems[itemSummary.name] ? '▲' : '▼'}</span></span></button>{expandedItems[itemSummary.name] && <div className="bg-[#F7F6F3] px-5 py-3 border-t border-[#E8E7E4]">{itemSummary.people.map((p, i) => <div key={i} className="text-sm text-[#787774] py-1">{p.person} · {p.quantity}份 {p.spicy_level > 0 ? spicyLevelLabels[p.spicy_level] : ''}</div>)}</div>}</div>)}<div className="px-5 py-4 bg-[#F7F6F3] flex items-center justify-between"><span className="font-bold text-[#37352F]">合计</span><span className="font-bold text-lg transition-colors duration-300" style={{ color: styles.accent }}>{orderSummary.reduce((sum, i) => sum + i.total, 0)} 份</span></div></div>}</div><div className="flex justify-center pb-4"><button onClick={() => handleExportCurrent('order')} className="w-full sm:w-auto px-8 py-3 bg-white border-2 font-medium rounded-md transition-colors duration-300" style={{ borderColor: styles.accent, color: styles.accent }}>📄 导出当前点餐 HTML</button></div></div>
}

export function VoteManagementSection({ styles, voteTitle, setVoteTitle, votePizzas, updatePizzaOption, removePizzaOption, addPizzaOption, handleCreateVote, creatingVote, voteSessions, voteLoading, handleExportCurrent }) {
  return <div className="space-y-6"><div className="bg-white rounded-lg border border-[#E8E7E4] p-5"><h3 className="font-semibold text-[#37352F] mb-4">🗳️ 投票管理</h3><div className="mb-5 p-4 bg-[#F7F6F3] rounded-md"><input type="text" value={voteTitle} onChange={e => setVoteTitle(e.target.value)} placeholder="投票标题（如：今天想吃什么披萨？）" className="w-full px-3 py-2 rounded-md border border-[#E8E7E4] focus:border-current focus:ring-2 outline-none transition mb-3 text-sm" style={{ '--tw-ring-color': styles.accentLight, borderColor: styles.accent }} /><div className="space-y-2 mb-3">{votePizzas.map((pizza, index) => <div key={index} className="flex items-center gap-2"><input type="text" value={pizza.name} onChange={e => updatePizzaOption(index, 'name', e.target.value)} placeholder="披萨名称" className="flex-1 px-3 py-2 rounded-md border border-[#E8E7E4] focus:border-current focus:ring-2 outline-none transition text-sm" style={{ '--tw-ring-color': styles.accentLight, borderColor: styles.accent }} /><input type="number" value={pizza.servings} onChange={e => updatePizzaOption(index, 'servings', e.target.value)} min="1" className="w-20 px-3 py-2 rounded-md border border-[#E8E7E4] focus:border-current focus:ring-2 outline-none transition text-sm text-center" style={{ '--tw-ring-color': styles.accentLight, borderColor: styles.accent }} />{votePizzas.length > 1 && <button onClick={() => removePizzaOption(index)} className="text-[#EB5757] hover:text-[#D94A4A] text-sm transition shrink-0">✕</button>}</div>)}</div><div className="flex gap-3 flex-wrap"><button onClick={addPizzaOption} className="px-4 py-2 text-sm bg-white border border-[#E8E7E4] text-[#787774] hover:bg-[#F7F6F3] rounded-md transition">+ 添加选项</button><button onClick={handleCreateVote} disabled={creatingVote} className={`px-4 py-2 text-sm text-white rounded-md transition-colors duration-300 disabled:opacity-50 ${styles.accentBg} ${styles.accentHover}`}>{creatingVote ? '创建中...' : '创建投票'}</button></div></div>{voteSessions.length > 0 && <div className="space-y-4"><h4 className="text-sm font-semibold text-[#37352F]">当前投票</h4>{voteSessions.map(vs => <div key={vs.id} className="border border-[#E8E7E4] rounded-md p-4 bg-white"><div className="font-medium text-[#37352F] mb-3">{vs.title}</div>{(vs.pizza_stats || []).map(pizza => <div key={pizza.id} className="py-2 border-b border-[#E8E7E4] last:border-0"><div className="flex items-center justify-between gap-3"><span className="font-medium text-[#37352F] truncate">{pizza.name}</span><div className="flex items-center gap-4 text-sm shrink-0"><span className="text-[#787774]">{pizza.vote_count} 票</span><span className="px-2 py-0.5 rounded-md font-semibold transition-colors duration-300" style={{ backgroundColor: styles.accentLight, color: styles.accent }}>需订 {pizza.need_to_order} 个</span></div></div>{pizza.voters?.length > 0 && <div className="mt-1 text-xs text-[#9B9A97]">{pizza.voters.join('、')}</div>}</div>)}</div>)}</div>}{voteLoading && <p className="text-sm text-[#9B9A97] text-center mt-2">加载中...</p>}</div><div className="flex justify-center pb-4"><button onClick={() => handleExportCurrent('vote')} className="w-full sm:w-auto px-8 py-3 bg-white border-2 font-medium rounded-md transition-colors duration-300" style={{ borderColor: styles.accent, color: styles.accent }}>📄 导出当前投票 HTML</button></div></div>
}

export function StatsDashboard({ stats, onRefresh }) {
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [shops, setShops] = useState([])
  const [dishes, setDishes] = useState([])
  const [loading, setLoading] = useState(false)

  const availableMonths = stats?.available_months || []

  const handleMonthClick = async (month) => {
    setLoading(true)
    setSelectedMonth(month)
    try {
      const [shopsRes, dishesRes] = await Promise.all([
        getStatsMonthShops(month),
        getStatsMonthDishes(month)
      ])
      setShops(shopsRes.data?.shops || [])
      setDishes(dishesRes.data?.dishes || [])
    } catch {
      setShops([])
      setDishes([])
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    setSelectedMonth(null)
    setShops([])
    setDishes([])
  }

  if (!stats) {
    return (
      <div className="bg-white rounded-lg border border-[#E8E7E4] p-8 text-center">
        <p className="text-[#787774]">点击刷新加载统计数据</p>
        <button onClick={onRefresh} className="mt-4 px-4 py-2 bg-[#2EAADC] text-white rounded-md text-sm">↻ 加载</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-[#E8E7E4] p-5">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div>
            <h3 className="font-semibold text-[#37352F]">📊 统计总览</h3>
            <p className="text-sm text-[#787774] mt-1">核心数据集中展示。</p>
          </div>
          <button onClick={onRefresh} className="px-4 py-2 bg-[#F7F6F3] text-[#787774] rounded-md border border-[#E8E7E4] text-sm hover:bg-[#EFEFED] transition">↻ 刷新</button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatMiniCard label="总轮次" value={stats.total_rounds || 0} color="#2EAADC" />
          <StatMiniCard label="总订单" value={stats.total_orders || 0} color="#F59E0B" />
          <StatMiniCard label="参与率" value={`${stats.participation_rate || 0}%`} color="#4EAD5B" />
          <StatMiniCard label="请假人数" value={stats.excused_count || 0} color="#8B5CF6" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        {/* 左框：年月日历 / 店铺列表 */}
        <div className="bg-white rounded-lg border border-[#E8E7E4] p-5">
          <div className="flex items-center justify-between mb-4">
            {selectedMonth ? (
              <button onClick={handleBack} className="flex items-center gap-2 text-sm text-[#787774] hover:text-[#37352F] transition">
                <span>←</span>
                <span>返回月份选择</span>
              </button>
            ) : (
              <h3 className="font-semibold text-[#37352F]">📅 点餐趋势</h3>
            )}
          </div>

          {!selectedMonth ? (
            // 日历表：显示可选年月
            <div className="space-y-3">
              {availableMonths.length === 0 ? (
                <div className="text-sm text-[#9B9A97] text-center py-8">暂无点餐记录</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {availableMonths.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => handleMonthClick(m.month)}
                      className="px-3 py-2 rounded-md border border-[#E8E7E4] bg-[#F7F6F3] hover:bg-[#EFEFED] text-sm font-medium text-[#37352F] transition"
                    >
                      {m.month}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-[#9B9A97] mt-2">选择月份查看当月点餐详情</p>
            </div>
          ) : loading ? (
            <div className="text-sm text-[#9B9A97] text-center py-8">加载中...</div>
          ) : (
            // 店铺列表
            <div className="space-y-3">
              <div className="text-sm text-[#787774] mb-2">{selectedMonth} 点餐记录</div>
              {shops.length === 0 ? (
                <div className="text-sm text-[#9B9A97] text-center py-4">该月暂无点餐记录</div>
              ) : (
                <div className="divide-y divide-[#E8E7E4]">
                  {shops.map((shop, i) => (
                    <div key={i} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#37352F] truncate">{shop.title || `#${shop.round_id}`}</div>
                        <div className="text-xs text-[#9B9A97] mt-1">{shop.created_at}</div>
                      </div>
                      <span className="px-2 py-1 rounded-md text-xs font-medium bg-[#F59E0B] text-white shrink-0">
                        {shop.order_count} 次
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右框：热门菜品 */}
        <div className="bg-white rounded-lg border border-[#E8E7E4] p-5">
          <h3 className="font-semibold text-[#37352F] mb-4">🍽️ 热门菜品</h3>
          {!selectedMonth ? (
            <div className="text-sm text-[#9B9A97] text-center py-8">选择左侧月份后显示菜品排行</div>
          ) : loading ? (
            <div className="text-sm text-[#9B9A97] text-center py-8">加载中...</div>
          ) : dishes.length === 0 ? (
            <div className="text-sm text-[#9B9A97] text-center py-8">该月暂无菜品数据</div>
          ) : (
            <div className="space-y-3">
              {dishes.slice(0, 10).map((dish, i) => (
                <DishRankItem key={i} rank={i + 1} name={dish.name} count={dish.count} max={dishes[0]?.count || 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DishRankItem({ rank, name, count, max }) {
  const pct = (count / max) * 100
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-sm text-[#37352F]">
          <span className="text-[#9B9A97] mr-2 w-4 inline-block text-right">#{rank}</span>
          <span className="break-all">{name || '未命名项'}</span>
        </div>
        <span className="text-xs text-[#787774] shrink-0">{count}份</span>
      </div>
      <div className="h-2 bg-[#F1F1EF] rounded-md overflow-hidden">
        <div className="h-full rounded-md transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: '#F59E0B' }} />
      </div>
    </div>
  )
}

function StatMiniCard({ label, value, color }) {
  return <div className="rounded-lg border border-[#E8E7E4] bg-[#FAFAF9] p-4"><div className="text-sm text-[#787774] mb-1">{label}</div><div className="text-2xl font-bold" style={{ color }}>{value}</div></div>
}

export function DatabaseManagementSection({ onBackup, onRestore, restoring, logs = [], trashRounds = [], onRestoreRound, onPurgeRound, onEmptyTrash, onBatchExport }) {
  const [logType, setLogType] = useState('')
  const filteredLogs = logs.filter(log => !logType || log.type === logType)
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-[#E8E7E4] p-5">
        <h3 className="font-semibold text-[#37352F] mb-4">💾 数据库管理</h3>
        <div className="flex flex-wrap gap-3">
          <button onClick={onBackup} className="px-4 py-2 bg-[#2EAADC] text-white rounded-md text-sm hover:opacity-90 transition">
            📥 备份数据库
          </button>
          <label className="px-4 py-2 bg-[#F7F6F3] text-[#787774] rounded-md text-sm border border-[#E8E7E4] hover:bg-[#EFEFED] transition cursor-pointer disabled:opacity-50">
            {restoring ? '恢复中...' : '📤 恢复数据库'}
            <input type="file" accept=".db,.sqlite,.sqlite3" onChange={onRestore} disabled={restoring} className="hidden" />
          </label>
          <button onClick={onBatchExport} className="px-4 py-2 bg-white text-[#787774] rounded-md text-sm border border-[#E8E7E4] hover:bg-[#F7F6F3] transition">
            📊 批量导出历史
          </button>
        </div>
        <p className="text-xs text-[#9B9A97] mt-3">备份将下载完整的 SQLite 数据库文件。恢复操作会覆盖当前数据，请谨慎操作。</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-white rounded-lg border border-[#E8E7E4] p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-semibold text-[#37352F]">🧾 实时操作日志</h3>
            <select value={logType} onChange={e => setLogType(e.target.value)} className="px-3 py-1.5 rounded-md border border-[#E8E7E4] bg-white text-sm text-[#787774]">
              <option value="">全部类型</option>
              <option value="round_deleted">删除</option>
              <option value="round_restored">恢复</option>
              <option value="round_purged">永久删除</option>
              <option value="trash_emptied">清空回收站</option>
            </select>
          </div>
          {filteredLogs.length === 0 ? <div className="text-sm text-[#9B9A97]">暂无操作日志</div> : <div className="space-y-3 max-h-64 overflow-auto">{filteredLogs.map(log => <div key={log.id} className="border-b border-[#F1F1EF] pb-2 last:border-0"><div className="text-xs uppercase tracking-wide text-[#9B9A97] mb-1">{log.type}</div><div className="text-sm text-[#37352F]">{log.message}</div><div className="text-xs text-[#9B9A97] mt-1">{new Date(log.created_at).toLocaleString()}</div></div>)}</div>}
        </div>

        <div className="bg-white rounded-lg border border-[#E8E7E4] p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-semibold text-[#37352F]">🗑️ 回收站</h3>
            <button onClick={onEmptyTrash} disabled={!trashRounds.length} className="px-3 py-1.5 rounded-md border border-[#E8E7E4] bg-white hover:bg-[#F7F6F3] text-sm text-[#EB5757] disabled:opacity-40">清空回收站</button>
          </div>
          {trashRounds.length === 0 ? <div className="text-sm text-[#9B9A97]">回收站为空</div> : <div className="space-y-3 max-h-64 overflow-auto">{trashRounds.map(round => <div key={round.id} className="flex items-center justify-between gap-3 border-b border-[#F1F1EF] pb-2 last:border-0"><div><div className="text-sm text-[#37352F]">{round.title || `#${round.id}`}</div><div className="text-xs text-[#9B9A97]">{round.mode} · 删除于 {round.deleted_at ? new Date(round.deleted_at).toLocaleString() : '-'}</div></div><div className="flex gap-2"><button onClick={() => onRestoreRound(round.id)} className="px-3 py-1.5 rounded-md border border-[#E8E7E4] bg-white hover:bg-[#F7F6F3] text-sm text-[#787774]">恢复</button><button onClick={() => onPurgeRound(round.id)} className="px-3 py-1.5 rounded-md border border-[#E8E7E4] bg-white hover:bg-[#F7F6F3] text-sm text-[#EB5757]">永久删除</button></div></div>)}</div>}
        </div>
      </div>
    </div>
  )
}
