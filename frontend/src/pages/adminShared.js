export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const ta = document.createElement('textarea')
  ta.value = text
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  ta.remove()
  return Promise.resolve()
}

export function percentage(done, total) {
  if (!total) return 0
  return Math.round((done / total) * 100)
}

export const spicyLevelLabels = ['', '微辣', '中辣', '重辣']

export function parseSpicyOptions(spicyOptionsStr) {
  if (!spicyOptionsStr || spicyOptionsStr === '') return null
  const parts = spicyOptionsStr.split(',')
  if (parts.length === 1) {
    return { type: 'single', value: parseInt(parts[0], 10) }
  }
  return { type: 'multiple', options: parts.map(p => parseInt(p, 10)) }
}

export function formatSpicyOptions(spicyOptionsStr) {
  const info = parseSpicyOptions(spicyOptionsStr)
  if (!info) return '无辣'
  if (info.type === 'single') return spicyLevelLabels[info.value] || '无辣'
  return info.options.map(opt => spicyLevelLabels[opt] || '').filter(Boolean).join('/')
}

export function sanitizeDownloadFilename(name, fallback = '导出文件') {
  const trimmed = String(name || '').trim()
  const safe = trimmed.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ')
  return safe || fallback
}

export async function downloadBlob(blob, filename) {
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

export const modeStyles = {
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

export function getModeStyles(tab) {
  return modeStyles[tab] || modeStyles.people
}
