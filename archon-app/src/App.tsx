import React, { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  CreditCard,
  Settings,
  History,
  LogOut,
  GitBranch,
  Zap,
  Box,
  BarChart3,
  ChevronRight,
  ShieldCheck,
  TrendingUp,
  Github
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getStats } from './lib/api'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [token, setToken] = useState(localStorage.getItem('archon_token'))
  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState<any>(null)

  // Handle OAuth Callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const urlToken = urlParams.get('token')
    if (urlToken) {
      localStorage.setItem('archon_token', urlToken)
      setToken(urlToken)
      window.history.replaceState({}, document.title, "/")
    }
  }, [])

  // Fetch Data
  useEffect(() => {
    if (token) {
      setIsLoading(true)
      getStats()
        .then(res => {
          setData(res)
          setIsLoading(false)
        })
        .catch(err => {
          console.error("Failed to fetch stats", err)
          if (err.response?.status === 401) {
            handleLogout()
          }
          setIsLoading(false)
        })
    }
  }, [token])

  const handleLogout = () => {
    localStorage.removeItem('archon_token')
    setToken(null)
    setData(null)
  }

  const handleUpgrade = async (planId: string) => {
    if (!data?.org?.id) return
    try {
      setIsLoading(true)
      const { createCheckoutSession } = await import('./lib/api')
      const url = await createCheckoutSession(planId, data.org.id)
      window.location.href = url
    } catch (err) {
      console.error("Failed to create checkout session", err)
      setIsLoading(false)
    }
  }

  const handleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/auth/github`
  }

  if (!token) {
    return (
      <div className="login-container">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card login-card"
        >
          <div className="logo-icon big">A</div>
          <h1>Welcome to Archon</h1>
          <p>The SaaS managed AI agent for GitHub.</p>
          <button className="glow-btn login-btn" onClick={handleLogin}>
            <Github size={20} />
            <span>Sign in with GitHub</span>
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-icon">A</div>
          <span className="logo-text">Archon</span>
        </div>

        <nav className="nav-menu">
          <NavItem
            icon={<LayoutDashboard size={20} />}
            label="Overview"
            active={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
          />
          <NavItem
            icon={<BarChart3 size={20} />}
            label="Usage Metrics"
            active={activeTab === 'usage'}
            onClick={() => setActiveTab('usage')}
          />
          <NavItem
            icon={<CreditCard size={20} />}
            label="Billing"
            active={activeTab === 'billing'}
            onClick={() => setActiveTab('billing')}
          />
          <NavItem
            icon={<History size={20} />}
            label="Event Logs"
            active={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
          />
          <NavItem
            icon={<Settings size={20} />}
            label="Settings"
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
          />
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <img src={`https://github.com/${data?.org?.githubLogin || 'ghost'}.png`} alt="User" />
            <div className="user-info">
              <p className="username">{data?.org?.githubLogin || 'Loading...'}</p>
              <p className="plan-badge">{data?.org?.plan?.toUpperCase() || 'FREE'} PLAN</p>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="top-header">
          <div className="breadcrumb">
            <span>Home</span>
            <ChevronRight size={14} />
            <span className="current">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</span>
          </div>

          <div className="header-actions">
            {isLoading && <span className="loading-indicator">Syncing...</span>}
            <div className="search-bar">
              <input type="text" placeholder="Search logs..." />
            </div>
            <a href="https://github.com/apps/archon-pro" target="_blank" rel="noopener noreferrer">
              <button className="glow-btn">Install App</button>
            </a>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="dashboard-view"
            >
              <div className="stats-grid">
                <StatCard
                  icon={<Zap className="icon-orange" />}
                  title="Total Requests"
                  value={data?.usage?.length || "0"}
                  trend="+100%"
                />
                <StatCard
                  icon={<Box className="icon-purple" />}
                  title="Active Repos"
                  value="1"
                  trend="New"
                />
                <StatCard
                  icon={<ShieldCheck className="icon-green" />}
                  title="Success Rate"
                  value="100%"
                  trend="Stable"
                />
                <StatCard
                  icon={<TrendingUp className="icon-blue" />}
                  title="Plan Status"
                  value={data?.org?.plan || "Free"}
                  trend="Active"
                />
              </div>

              <div className="content-row">
                <div className="glass-card main-chart">
                  <div className="card-header">
                    <h3>Usage Over Time</h3>
                    <select>
                      <option>Last 7 days</option>
                      <option>Last 30 days</option>
                    </select>
                  </div>
                  <div className="chart-placeholder">
                    {/* Visualizing a chart with CSS */}
                    <div className="chart-bars">
                      {[40, 70, 45, 90, 65, 80, 55].map((h, i) => (
                        <div key={i} className="chart-bar-container">
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${h}%` }}
                            transition={{ duration: 1, delay: i * 0.1 }}
                            className="chart-bar"
                          ></motion.div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="glass-card recent-activity">
                  <div className="card-header">
                    <h3>Recent Activity</h3>
                    <button className="text-btn">View All</button>
                  </div>
                  <div className="activity-list">
                    {data?.usage && data.usage.length > 0 ? (
                      data.usage.map((item: any, i: number) => (
                        <ActivityItem
                          key={i}
                          repo={item.repo}
                          action={item.model}
                          time={new Date(item.createdAt).toLocaleTimeString()}
                          status="success"
                        />
                      ))
                    ) : (
                      <p className="empty-msg">No activity yet. Comment /archon on any repo!</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'billing' && (
            <motion.div
              key="billing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="billing-view"
            >
              <div className="billing-header">
                <h2>Billing & Plans</h2>
                <p>Manage your subscription and usage credits</p>
              </div>

              <div className="plans-grid">
                <PlanCard
                  name="Pro"
                  price="$19"
                  planId="pro"
                  features={["500 Requests/mo", "Claude 3.5 Sonnet", "Private Repos", "Priority Support"]}
                  current={data?.org?.plan === 'pro'}
                  onUpgrade={() => handleUpgrade('pro')}
                />
                <PlanCard
                  name="Team"
                  price="$49"
                  planId="team"
                  features={["2000 Requests/mo", "Custom Model Routing", "Team Management", "SLA"]}
                  highlight
                  current={data?.org?.plan === 'team'}
                  onUpgrade={() => handleUpgrade('team')}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

function NavItem({ icon, label, active, onClick }: any) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {active && <motion.div layoutId="nav-active" className="nav-indicator" />}
    </button>
  )
}

function StatCard({ icon, title, value, trend }: any) {
  return (
    <div className="glass-card stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <p className="stat-title">{title}</p>
        <h2 className="stat-value">{value}</h2>
        <span className={`stat-trend ${trend.startsWith('+') ? 'up' : ''}`}>{trend}</span>
      </div>
    </div>
  )
}

function ActivityItem({ repo, action, time, status }: any) {
  return (
    <div className="activity-item">
      <div className={`status-dot ${status}`}></div>
      <div className="activity-info">
        <p className="activity-repo">{repo}</p>
        <p className="activity-action">{action}</p>
      </div>
      <span className="activity-time">{time}</span>
    </div>
  )
}

function PlanCard({ name, price, features, current, highlight, onUpgrade }: any) {
  return (
    <div className={`glass-card plan-card ${highlight ? 'highlight' : ''} ${current ? 'current' : ''}`}>
      <h3>{name}</h3>
      <div className="plan-price">
        <span className="amount">{price}</span>
        <span className="period">/mo</span>
      </div>
      <ul className="plan-features">
        {features.map((f: string, i: number) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
      <button
        className={`plan-btn ${highlight ? 'glow-btn' : ''}`}
        onClick={onUpgrade}
        disabled={current}
      >
        {current ? 'Current Plan' : 'Upgrade Now'}
      </button>
    </div>
  )
}

export default App
