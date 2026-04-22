import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import OrderPage from './pages/OrderPage.jsx'
import AdminPage from './pages/AdminPage.jsx'

function NavLink({ to, children }) {
  const location = useLocation()
  const active = location.pathname === to
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
        active
          ? 'bg-[#2EAADC] text-white'
          : 'text-[#787774] hover:bg-[#F7F6F3] hover:text-[#37352F]'
      }`}
    >
      {children}
    </Link>
  )
}

export default function App() {
  return (
    <div className="min-h-screen text-[#37352F]">
      <header className="sticky top-0 z-20 bg-white border-b border-[#E8E7E4]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg bg-[#2EAADC] text-white flex items-center justify-center">
              🍽️
            </div>
            <div>
              <div className="text-lg font-bold text-[#37352F]">HappySystem</div>
              <div className="text-xs text-[#787774]">更顺手的点餐 / 投票轮次系统</div>
            </div>
          </Link>
          <nav className="flex gap-2 items-center bg-[#F7F6F3] p-1 rounded-md">
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
          <Route path="/admin/stats" element={<AdminPage defaultTab="stats" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="text-center py-8 text-[#787774] text-xs border-t border-[#E8E7E4] bg-white">
        HappySystem © {new Date().getFullYear()} · 面向真实轮次管理优化
      </footer>
    </div>
  )
}