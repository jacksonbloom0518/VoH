import { Outlet, Link, useLocation } from 'react-router-dom'
import { Search, Home } from 'lucide-react'
import logo from '../assets/VOH-words-copy.webp'

export default function Layout() {
  const location = useLocation()

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/search', label: 'Search Grants', icon: Search },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-xl border-b border-border sticky top-0 z-50 shadow-apple">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-3">
              <img src={logo} alt="Villages of Hope" className="h-28 w-auto object-contain mr-4" />
              <div>
                <h1 className="text-xl font-semibold text-foreground tracking-tight">
                  Grant Opportunities
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Villages of Hope
                </p>
              </div>
            </Link>

            <nav className="flex space-x-2">
              {navItems.map(({ path, label, icon: Icon }) => {
                const isActive = location.pathname === path
                return (
                  <Link
                    key={path}
                    to={path}
                    className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl transition-all duration-200 font-medium text-sm ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-apple'
                        : 'text-foreground hover:bg-accent'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-6 py-12">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border mt-auto">
        <div className="container mx-auto px-6 py-8">
          <div className="text-center text-sm text-muted-foreground">
            <p>
              Data sources: Grants.gov, SAM.gov, USAspending.gov
            </p>
            <p className="mt-2 text-xs">
              Last updated: {new Date().toLocaleDateString()}
            </p>
            <p className="mt-4 text-xs text-muted-foreground/80 leading-relaxed">
              Developed in partnership with the <span className="font-medium">UF AIS Consulting Team</span>. We are honored to support your mission and deeply grateful for the vital work you do.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

