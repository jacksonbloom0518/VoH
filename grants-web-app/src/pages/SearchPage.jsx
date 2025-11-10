import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, Filter, Calendar, DollarSign, MapPin, Building2, ExternalLink, Clock, AlertTriangle } from 'lucide-react'
import { opportunitiesAPI } from '../lib/api'
import { formatCurrency, formatDate, getDaysUntil, getDeadlineUrgency, getSourceBadgeColor, cn } from '../lib/utils'

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    source: searchParams.get('source') || '',
    agency: searchParams.get('agency') || '',
    state: searchParams.get('state') || '',
    minAmount: searchParams.get('minAmount') || '',
    maxAmount: searchParams.get('maxAmount') || '',
  })

  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const { data, isLoading, error } = useQuery({
    queryKey: ['opportunities', { ...filters, page, limit }],
    queryFn: () => opportunitiesAPI.search({ ...filters, page, limit }),
  })

  const { data: filterOptions } = useQuery({
    queryKey: ['filters'],
    queryFn: opportunitiesAPI.getFilters,
  })

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    const newParams = new URLSearchParams(searchParams)
    if (value) {
      newParams.set(key, value)
    } else {
      newParams.delete(key)
    }
    newParams.set('page', '1')
    setSearchParams(newParams)
  }

  const handlePageChange = (newPage) => {
    const newParams = new URLSearchParams(searchParams)
    newParams.set('page', newPage.toString())
    setSearchParams(newParams)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-foreground tracking-tight">Search Grant Opportunities</h1>
        <p className="text-muted-foreground mt-3 text-lg">
          Find funding for survivor support services
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-card rounded-2xl shadow-apple p-8">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by title, agency, or keywords..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <button
            onClick={() => {
              setFilters({
                search: '',
                source: '',
                agency: '',
                state: '',
                minAmount: '',
                maxAmount: '',
              })
              setSearchParams({})
            }}
            className="px-6 py-3.5 text-muted-foreground hover:text-foreground font-medium rounded-xl hover:bg-accent transition-all"
          >
            Clear
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-6">
          <select
            value={filters.source}
            onChange={(e) => handleFilterChange('source', e.target.value)}
            className="px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all text-foreground"
          >
            <option value="">All Sources</option>
            {filterOptions?.sources?.map(source => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>

          <select
            value={filters.agency}
            onChange={(e) => handleFilterChange('agency', e.target.value)}
            className="px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all text-foreground"
          >
            <option value="">All Agencies</option>
            {filterOptions?.agencies?.slice(0, 20).map(agency => (
              <option key={agency} value={agency}>{agency}</option>
            ))}
          </select>

          <select
            value={filters.state}
            onChange={(e) => handleFilterChange('state', e.target.value)}
            className="px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all text-foreground"
          >
            <option value="">All States</option>
            {filterOptions?.states?.map(state => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>

          <input
            type="number"
            placeholder="Min Amount"
            value={filters.minAmount}
            onChange={(e) => handleFilterChange('minAmount', e.target.value)}
            className="px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all text-foreground placeholder:text-muted-foreground"
          />

          <input
            type="number"
            placeholder="Max Amount"
            value={filters.maxAmount}
            onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
            className="px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Results */}
      {isLoading && (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="mt-6 text-muted-foreground text-lg">Loading opportunities...</p>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-6 text-destructive shadow-apple">
          <p className="font-semibold">Error loading opportunities</p>
          <p className="text-sm mt-2 opacity-90">{error.message}</p>
        </div>
      )}

      {data && (
        <>
          {/* Results Header */}
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-lg">
              Showing {data.data.length} of {data.pagination.total} results
            </p>
            <div className="text-sm text-muted-foreground">
              Page {data.pagination.page} of {data.pagination.pages}
            </div>
          </div>

          {/* Results Grid */}
          {data.data.length === 0 ? (
            <div className="bg-card rounded-2xl shadow-apple p-16 text-center">
              <Filter className="h-16 w-16 text-muted-foreground mx-auto mb-6 opacity-50" />
              <h3 className="text-xl font-semibold text-foreground mb-3">
                No opportunities found
              </h3>
              <p className="text-muted-foreground text-lg">
                Try adjusting your filters or search terms
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.data.map((opp) => {
                const daysUntil = getDaysUntil(opp.response_deadline)
                const urgency = getDeadlineUrgency(daysUntil)

                return (
                  <Link
                    key={opp.id}
                    to={`/opportunity/${opp.id}`}
                    className="block bg-card rounded-2xl shadow-apple p-8 hover:shadow-apple-lg hover:scale-[1.01] transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex-1 min-w-0">
                        {/* Title and Source Badge */}
                        <div className="flex items-start gap-4 mb-4">
                          <h3 className="text-xl font-semibold text-foreground flex-1 leading-snug">
                            {opp.title}
                          </h3>
                          <span className={cn('px-3.5 py-1.5 rounded-full text-xs font-semibold capitalize', getSourceBadgeColor(opp.source))}>
                            {opp.source}
                          </span>
                        </div>

                        {/* Summary */}
                        <p className="text-muted-foreground mb-6 line-clamp-2 leading-relaxed">
                          {opp.summary}
                        </p>

                        {/* Metadata Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Building2 className="h-4 w-4" />
                            <span className="truncate">{opp.agency || 'N/A'}</span>
                          </div>

                          {opp.award_amount && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <DollarSign className="h-4 w-4" />
                              <span className="font-medium">{formatCurrency(opp.award_amount)}</span>
                            </div>
                          )}

                          {opp.pop_state && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <MapPin className="h-4 w-4" />
                              <span>{opp.pop_city && `${opp.pop_city}, `}{opp.pop_state}</span>
                            </div>
                          )}

                          {opp.response_deadline && (
                            <div className="flex items-center gap-2">
                              {urgency === 'critical' && (
                                <>
                                  <AlertTriangle className="h-4 w-4 text-red-600" />
                                  <span className="text-red-600 font-bold">
                                    {daysUntil}d left
                                  </span>
                                  <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-semibold">
                                    URGENT
                                  </span>
                                </>
                              )}
                              {urgency === 'urgent' && (
                                <>
                                  <Clock className="h-4 w-4 text-orange-600" />
                                  <span className="text-orange-600 font-semibold">
                                    {daysUntil}d left
                                  </span>
                                  <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-semibold">
                                    CLOSING SOON
                                  </span>
                                </>
                              )}
                              {urgency === 'normal' && (
                                <>
                                  <Clock className="h-4 w-4" />
                                  <span className="text-muted-foreground">
                                    {daysUntil}d left
                                  </span>
                                </>
                              )}
                              {urgency === 'expired' && (
                                <>
                                  <Clock className="h-4 w-4 text-gray-400" />
                                  <span className="text-gray-400">
                                    {formatDate(opp.response_deadline)}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <ExternalLink className="h-5 w-5 text-muted-foreground flex-shrink-0 opacity-50" />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {data.pagination.pages > 1 && (
            <div className="flex justify-center gap-3">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                className="px-5 py-3 bg-card border border-border rounded-xl hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium shadow-apple"
              >
                Previous
              </button>

              {[...Array(Math.min(data.pagination.pages, 5))].map((_, i) => {
                const pageNum = i + 1
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={cn(
                      'px-5 py-3 rounded-xl font-medium transition-all',
                      page === pageNum
                        ? 'bg-primary text-primary-foreground shadow-apple-lg'
                        : 'bg-card border border-border hover:bg-accent shadow-apple'
                    )}
                  >
                    {pageNum}
                  </button>
                )
              })}

              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === data.pagination.pages}
                className="px-5 py-3 bg-card border border-border rounded-xl hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium shadow-apple"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

