import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, TrendingUp, Database, ArrowRight } from 'lucide-react'
import { opportunitiesAPI } from '../lib/api'
import { formatCurrency } from '../lib/utils'

export default function HomePage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: opportunitiesAPI.getStats,
  })

  const features = [
    {
      icon: Search,
      title: 'Multi-Source Search',
      description: 'Search across Grants.gov, SAM.gov, and USAspending in one place',
    },
    {
      icon: TrendingUp,
      title: 'Smart Filtering',
      description: 'Filter by agency, amount, deadline, location, and more',
    },
    {
      icon: Database,
      title: 'Comprehensive Data',
      description: 'Access historical awards and active opportunities',
    },
  ]

  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="text-center space-y-8 py-16">
        <h2 className="text-5xl md:text-6xl font-bold text-foreground tracking-tight leading-tight">
          Find Grant Opportunities for
          <span className="block text-primary mt-3">
            Women Survivors of Sex Trafficking
          </span>
        </h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Search and discover funding opportunities across federal grant programs
          to support survivor services, housing, counseling, and advocacy.
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <Link
            to="/search"
            className="inline-flex items-center px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-semibold hover:bg-primary/90 transition-all duration-200 shadow-apple-lg hover:shadow-apple-xl"
          >
            Search Opportunities
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Stats Section */}
      {!isLoading && stats && (
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-card rounded-2xl shadow-apple p-8 hover:shadow-apple-lg transition-shadow duration-200">
            <div className="text-4xl font-bold text-foreground">
              {stats.total.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              Total Opportunities
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-apple p-8 hover:shadow-apple-lg transition-shadow duration-200">
            <div className="text-4xl font-bold text-foreground">
              {stats.recentCount.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              Added Last 30 Days
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-apple p-8 hover:shadow-apple-lg transition-shadow duration-200">
            <div className="text-4xl font-bold text-foreground">
              {stats.bySource?.length || 0}
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              Data Sources
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-apple p-8 hover:shadow-apple-lg transition-shadow duration-200">
            <div className="text-4xl font-bold text-foreground">
              {formatCurrency(stats.avgAmount)}
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              Avg Award Amount
            </div>
          </div>
        </section>
      )}

      {/* Features Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {features.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="bg-card rounded-2xl shadow-apple p-8 hover:shadow-apple-lg transition-all duration-200"
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed">{description}</p>
          </div>
        ))}
      </section>

      {/* CTA Section */}
      <section className="bg-accent rounded-2xl shadow-apple p-12 text-center">
        <h3 className="text-3xl font-bold text-foreground mb-4">
          Ready to find funding opportunities?
        </h3>
        <p className="text-muted-foreground mb-8 max-w-2xl mx-auto text-lg leading-relaxed">
          Start searching our comprehensive database of federal grant programs,
          contract opportunities, and awarded grants relevant to survivor support services.
        </p>
        <Link
          to="/search"
          className="inline-flex items-center px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-semibold hover:bg-primary/90 transition-all duration-200 shadow-apple-lg hover:shadow-apple-xl"
        >
          Get Started
          <ArrowRight className="ml-2 h-5 w-5" />
        </Link>
      </section>
    </div>
  )
}

