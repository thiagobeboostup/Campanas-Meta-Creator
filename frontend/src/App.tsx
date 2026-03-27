import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ErrorBoundary, ToastProvider } from './components/Toast'
import { api } from './api/client'
import type { AuthStatus } from './types/campaign'

// Pages
import AuthPage from './pages/AuthPage'
import AccountSelectionPage from './pages/AccountSelectionPage'
import CampaignActionPage from './pages/CampaignActionPage'
import StrategyUploadPage from './pages/StrategyUploadPage'
import CreativePreviewPage from './pages/CreativePreviewPage'
import CampaignWizard from './pages/CampaignWizard'
import PreviewPage from './pages/PreviewPage'
import DeployPage from './pages/DeployPage'
import ManagePage from './pages/ManagePage'

const navItems = [
  { path: '/campaign-action', label: 'Nueva Campana' },
  { path: '/', label: 'Proyectos' },
  { path: '/select-account', label: 'Cuenta' },
]

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: auth, isLoading } = useQuery<AuthStatus>({
    queryKey: ['auth-status'],
    queryFn: () => api.get('/auth/status'),
    retry: false,
  })

  if (isLoading) return <div className="text-center py-16 text-gray-500">Cargando...</div>
  if (!auth?.meta_connected) return <Navigate to="/auth" replace />

  return <>{children}</>
}

function AccountGuard({ children }: { children: React.ReactNode }) {
  const { data: auth, isLoading } = useQuery<AuthStatus>({
    queryKey: ['auth-status'],
    queryFn: () => api.get('/auth/status'),
    retry: false,
  })

  if (isLoading) return <div className="text-center py-16 text-gray-500">Cargando...</div>
  if (!auth?.meta_connected) return <Navigate to="/auth" replace />
  if (!auth?.meta_ad_account_id) return <Navigate to="/select-account" replace />

  return <>{children}</>
}

export default function App() {
  const location = useLocation()

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="min-h-screen bg-gray-50">
          {/* Header */}
          <header className="bg-white border-b border-gray-200 px-6 py-3">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link to="/" className="text-xl font-bold text-gray-900 hover:text-blue-700">
                  Meta Ads Builder
                </Link>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">v2.0</span>
              </div>
              <nav className="flex gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      location.pathname === item.path
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          {/* Main content */}
          <main className="max-w-7xl mx-auto px-6 py-8">
            <Routes>
              {/* Public: Auth */}
              <Route path="/auth" element={<AuthPage />} />

              {/* Needs auth: Account selection */}
              <Route path="/select-account" element={
                <AuthGuard><AccountSelectionPage /></AuthGuard>
              } />

              {/* Needs auth + account: Main flow */}
              <Route path="/campaign-action" element={
                <AccountGuard><CampaignActionPage /></AccountGuard>
              } />
              <Route path="/" element={
                <AccountGuard><CampaignWizard /></AccountGuard>
              } />
              <Route path="/project/:id/strategy" element={
                <AccountGuard><StrategyUploadPage /></AccountGuard>
              } />
              <Route path="/project/:id/creatives" element={
                <AccountGuard><CreativePreviewPage /></AccountGuard>
              } />
              <Route path="/project/:id/preview" element={
                <AccountGuard><PreviewPage /></AccountGuard>
              } />
              <Route path="/project/:id/deploy" element={
                <AccountGuard><DeployPage /></AccountGuard>
              } />
              <Route path="/project/:id/manage" element={
                <AccountGuard><ManagePage /></AccountGuard>
              } />
            </Routes>
          </main>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  )
}
