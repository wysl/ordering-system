import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import OrderPage from './pages/OrderPage.jsx'
import AdminPage from './pages/AdminPage.jsx'

function NavLink({ to, children }) {
  const location = useLocation()
  const active = location.pathname === to
  return (
    <Link to={to} className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${active ? 'bg-amber-500 text-white shadow-sm' : 'bg-white/70 text-slate-600 hover:bg-white'}`}>
      {children}
    </Link>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed,_#f8fafc_45%,_#eef2ff)] text-slate-800">
      <header className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/70 bg-white/90 border-b border-white/60 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-200">🍽️</div>
            <div>
              <div className="text-lg font-bold bg-gradient-to-r from-amber-600 to-orange-500 bg-clip-text text-transparent">HappySystem</div>
              <div className="text-xs text-slate-400">更顺手的点餐 / 投票轮次系统</div>
            </div>
          </Link>
          <nav className="flex gap-2 items-center">
            <NavLink to="/">首页</NavLink>
            <NavLink to="/admin/people">后台管理</NavLink>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<OrderPage defaultTab="order" />} />
          <Route path="/vote" element={<OrderPage defaultTab="vote" />} />
          <Route path="/admin/people" element={<AdminPage defaultTab="people" />} />
          <Route path="/admin" element={<AdminPage defaultTab="order" />} />
          <Route path="/admin/vote" element={<AdminPage defaultTab="vote" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="text-center py-8 text-slate-400 text-xs">
        HappySystem © {new Date().getFullYear()} · 面向真实轮次管理优化
      </footer>
    </div>
  )
}
