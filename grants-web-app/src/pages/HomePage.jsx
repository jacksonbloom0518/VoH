import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Search, TrendingUp, Database, ArrowRight, Download, CheckCircle, AlertCircle, X } from 'lucide-react'
import { opportunitiesAPI } from '../lib/api'
import { formatCurrency } from '../lib/utils'

export default function HomePage() {
  const [location, setLocation] = useState('Jacksonville, FL')
  const [emailRecipients, setEmailRecipients] = useState([])
  const [emailInput, setEmailInput] = useState('')
  const [lastSentRecipients, setLastSentRecipients] = useState([])

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['stats'],
    queryFn: opportunitiesAPI.getStats,
  })

  const fetchGrantsMutation = useMutation({
    mutationFn: opportunitiesAPI.fetchGrantsGov,
    onSuccess: (data) => {
      console.log('Successfully fetched grants:', data)
      // Refetch stats to update the display
      refetch()
    },
    onError: (error) => {
      console.error('Error fetching grants:', error)
    },
  })

  const addEmailRecipient = () => {
    const trimmedEmail = emailInput.trim().toLowerCase()
    if (trimmedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      if (!emailRecipients.includes(trimmedEmail)) {
        setEmailRecipients([...emailRecipients, trimmedEmail])
      }
      setEmailInput('')
    }
  }

  const removeEmailRecipient = (email) => {
    setEmailRecipients(emailRecipients.filter(e => e !== email))
  }

  const handleEmailInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addEmailRecipient()
    }
  }

  const sendEmailMutation = useMutation({
    mutationFn: ({ recipients }) => {
      return opportunitiesAPI.sendEmail({ recipients, limit: 10 });
    },
    onMutate: (variables) => {
      // capture recipients so we can show who the email was sent to even after clearing the input
      setLastSentRecipients(variables?.recipients || [])
    },
    onSuccess: (data) => {
      console.log('Email sent:', data);
      setEmailRecipients([])
      setEmailInput('')
    },
    onError: (error) => {
      console.error('Error sending email:', error);
    }
  })

  const scrapeLocalMutation = useMutation({
    mutationFn: opportunitiesAPI.scrapeLocalGrants,
    onSuccess: (data) => {
      console.log('Successfully scraped local grants:', data)
      // Refetch stats to update the display
      refetch()
    },
    onError: (error) => {
      console.error('Error scraping local grants:', error)
    },
  })

  const scrapeOVWMutation = useMutation({
    mutationFn: opportunitiesAPI.scrapeOVWGrants,
    onSuccess: (data) => {
      console.log('Successfully scraped OVW grants:', data)
      // Refetch stats to update the display
      refetch()
    },
    onError: (error) => {
      console.error('Error scraping OVW grants:', error)
    },
  })

  const scrapeACFMutation = useMutation({
    mutationFn: opportunitiesAPI.scrapeACFGrants,
    onSuccess: (data) => {
      console.log('Successfully scraped ACF grants:', data)
      // Refetch stats to update the display
      refetch()
    },
    onError: (error) => {
      console.error('Error scraping ACF grants:', error)
    },
  })

  const fetchForecastsMutation = useMutation({
    mutationFn: opportunitiesAPI.fetchGrantsForecasts,
    onSuccess: (data) => {
      console.log('Successfully fetched grant forecasts:', data)
      // Refetch stats to update the display
      refetch()
    },
    onError: (error) => {
      console.error('Error fetching grant forecasts:', error)
    },
  })

  const fetchHUDMutation = useMutation({
    mutationFn: opportunitiesAPI.fetchHUDGrants,
    onSuccess: (data) => {
      console.log('Successfully fetched HUD grants:', data)
      // Refetch stats to update the display
      refetch()
    },
    onError: (error) => {
      console.error('Error fetching HUD grants:', error)
    },
  })

  const fetchSAMHSAMutation = useMutation({
    mutationFn: opportunitiesAPI.fetchSAMHSAGrants,
    onSuccess: (data) => {
      console.log('Successfully fetched SAMHSA grants:', data)
      // Refetch stats to update the display
      refetch()
    },
    onError: (error) => {
      console.error('Error fetching SAMHSA grants:', error)
    },
  })

  const scrapeFloridaDCFMutation = useMutation({
    mutationFn: opportunitiesAPI.scrapeFloridaDCF,
    onSuccess: (data) => {
      console.log('Successfully scraped Florida DCF grants:', data)
      // Refetch stats to update the display
      refetch()
    },
    onError: (error) => {
      console.error('Error scraping Florida DCF grants:', error)
    },
  })

  const scrapeJaxFoundationMutation = useMutation({
    mutationFn: opportunitiesAPI.scrapeJaxFoundation,
    onSuccess: (data) => {
      console.log('Successfully scraped Jacksonville Foundation grants:', data)
      // Refetch stats to update the display
      refetch()
    },
    onError: (error) => {
      console.error('Error scraping Jacksonville Foundation grants:', error)
    },
  })

  const fetchUSASpendingMutation = useMutation({
    mutationFn: opportunitiesAPI.fetchUSASpending,
    onSuccess: (data) => {
      console.log('Successfully fetched USASpending data:', data)
      // Refetch stats to update the display
      refetch()
    },
    onError: (error) => {
      console.error('Error fetching USASpending data:', error)
    },
  })

  const fetchSAMMutation = useMutation({
    mutationFn: opportunitiesAPI.fetchSAM,
    onSuccess: (data) => {
      console.log('Successfully fetched SAM.gov data:', data)
      // Refetch stats to update the display
      refetch()
    },
    onError: (error) => {
      console.error('Error fetching SAM.gov data:', error)
    },
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

      {/* Fetch Button Section */}
      <section className="bg-card rounded-2xl shadow-apple p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Fetch Latest Grants
            </h3>
            <p className="text-muted-foreground">
              Pull the latest opportunities from Grants.gov API (Categories: ISS, HL, ED, LJL, HU)
            </p>
          </div>
          <button
            onClick={() => fetchGrantsMutation.mutate()}
            disabled={fetchGrantsMutation.isPending}
            className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-all duration-200 shadow-apple hover:shadow-apple-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetchGrantsMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground mr-2" />
                Fetching...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Get Grants.gov Opportunities
              </>
            )}
          </button>
        </div>

        {/* Success/Error Messages */}
        {fetchGrantsMutation.isSuccess && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-green-700">Success!</div>
              <div className="text-sm text-green-600 mt-1">
                {fetchGrantsMutation.data?.message || 'Successfully fetched opportunities from Grants.gov'}
              </div>
              {fetchGrantsMutation.data?.opportunities && fetchGrantsMutation.data.opportunities.length > 0 && (
                <ul className="mt-2 text-sm text-green-600 space-y-1">
                  {fetchGrantsMutation.data.opportunities.map((opp, idx) => (
                    <li key={idx}>• {opp.title}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {fetchGrantsMutation.isError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700">Error</div>
              <div className="text-sm text-red-600 mt-1">
                {fetchGrantsMutation.error?.response?.data?.message ||
                 fetchGrantsMutation.error?.message ||
                 'Failed to fetch opportunities. Please try again.'}
              </div>
            </div>
          </div>
        )}

        {/* Email results section */}
        <div className="mt-8 p-6 bg-purple-50 dark:bg-purple-950/20 rounded-2xl border border-purple-200 dark:border-purple-800 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Email Recipients
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={handleEmailInputKeyDown}
                className="flex-1 px-4 py-2 bg-background border border-border rounded-xl focus:ring-2 focus:ring-secondary focus:border-secondary transition-all"
                placeholder="Enter email address"
              />
              <button
                onClick={addEmailRecipient}
                disabled={!emailInput.trim()}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-xl font-semibold hover:bg-secondary/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>

          {/* Email Recipients List */}
          {emailRecipients.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {emailRecipients.length} recipient{emailRecipients.length !== 1 ? 's' : ''} added
              </p>
              <div className="flex flex-wrap gap-2">
                {emailRecipients.map((email) => (
                  <div
                    key={email}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-secondary/20 border border-secondary/30 rounded-lg"
                  >
                    <span className="text-sm text-foreground">{email}</span>
                    <button
                      onClick={() => removeEmailRecipient(email)}
                      className="inline-flex items-center justify-center h-5 w-5 hover:bg-secondary/40 rounded transition-colors"
                      aria-label={`Remove ${email}`}
                    >
                      <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Send Email Button */}
          {emailRecipients.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => sendEmailMutation.mutate({ recipients: emailRecipients })}
                disabled={sendEmailMutation.isPending}
                className="w-full inline-flex items-center justify-center px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-all duration-200 shadow-apple hover:shadow-apple-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendEmailMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                    Sending...
                  </>
                ) : (
                  <>Send Email to {emailRecipients.length} Recipient{emailRecipients.length !== 1 ? 's' : ''}</>
                )}
              </button>
            </div>
          )}
        </div>

        {sendEmailMutation.isSuccess && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-700">
            Email sent to: {lastSentRecipients && lastSentRecipients.length > 0 ? lastSentRecipients.join(', ') : (sendEmailMutation.data?.message || 'Success')}
          </div>
        )}

        {sendEmailMutation.isError && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-700">
            Error sending email: {sendEmailMutation.error?.response?.data?.error || sendEmailMutation.error?.message}
          </div>
        )}
      </section>

      {/* Grant Forecasts Button Section */}
      <section className="bg-card rounded-2xl shadow-apple p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Fetch Grant Forecasts
            </h3>
            <p className="text-muted-foreground">
              Pull upcoming forecasted grant opportunities from Grants.gov - grants that haven't opened yet but are planned for future release
            </p>
          </div>
          <button
            onClick={() => fetchForecastsMutation.mutate()}
            disabled={fetchForecastsMutation.isPending}
            className="inline-flex items-center px-6 py-3 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700 transition-all duration-200 shadow-apple hover:shadow-apple-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetchForecastsMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                Fetching...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Fetch Forecasts
              </>
            )}
          </button>
        </div>

        {/* Success/Error Messages */}
        {fetchForecastsMutation.isSuccess && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-green-700">Success!</div>
              <div className="text-sm text-green-600 mt-1">
                {fetchForecastsMutation.data?.message || 'Successfully fetched grant forecasts'}
              </div>
              {fetchForecastsMutation.data?.opportunities && fetchForecastsMutation.data.opportunities.length > 0 && (
                <ul className="mt-2 text-sm text-green-600 space-y-1">
                  {fetchForecastsMutation.data.opportunities.slice(0, 5).map((opp, idx) => (
                    <li key={idx}>• {opp.title} ({opp.agency})</li>
                  ))}
                  {fetchForecastsMutation.data.opportunities.length > 5 && (
                    <li className="font-semibold">...and {fetchForecastsMutation.data.opportunities.length - 5} more</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}

        {fetchForecastsMutation.isError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700">Error</div>
              <div className="text-sm text-red-600 mt-1">
                {fetchForecastsMutation.error?.response?.data?.message ||
                 fetchForecastsMutation.error?.message ||
                 'Failed to fetch grant forecasts. Please try again.'}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* OVW Grants Button Section */}
      <section className="bg-card rounded-2xl shadow-apple p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Fetch DOJ Office on Violence Against Women (OVW) Grants
            </h3>
            <p className="text-muted-foreground">
              Scrape current funding opportunities from the DOJ Office on Violence Against Women - the primary federal funder for trafficking and domestic violence victim services
            </p>
          </div>
          <button
            onClick={() => scrapeOVWMutation.mutate({ limit: 20, location })}
            disabled={scrapeOVWMutation.isPending}
            className="inline-flex items-center px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-all duration-200 shadow-apple hover:shadow-apple-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scrapeOVWMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                Fetching...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Fetch OVW Grants
              </>
            )}
          </button>
        </div>

        {/* Success/Error Messages */}
        {scrapeOVWMutation.isSuccess && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-green-700">Success!</div>
              <div className="text-sm text-green-600 mt-1">
                {scrapeOVWMutation.data?.message || 'Successfully fetched OVW grant opportunities'}
              </div>
              {scrapeOVWMutation.data?.grants && scrapeOVWMutation.data.grants.length > 0 && (
                <ul className="mt-2 text-sm text-green-600 space-y-1">
                  {scrapeOVWMutation.data.grants.map((grant, idx) => (
                    <li key={idx}>• {grant.title} ({grant.source})</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {scrapeOVWMutation.isError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700">Error</div>
              <div className="text-sm text-red-600 mt-1">
                {scrapeOVWMutation.error?.response?.data?.message ||
                 scrapeOVWMutation.error?.message ||
                 'Failed to fetch OVW grants. Please try again.'}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ACF Grants Button Section */}
      <section className="bg-card rounded-2xl shadow-apple p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Fetch HHS ACF OFVPS Grants
            </h3>
            <p className="text-muted-foreground">
              Scrape current funding opportunities from HHS Administration for Children and Families - Office of Family Violence Prevention and Services for domestic violence shelters and services
            </p>
          </div>
          <button
            onClick={() => scrapeACFMutation.mutate({ limit: 20, location })}
            disabled={scrapeACFMutation.isPending}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all duration-200 shadow-apple hover:shadow-apple-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scrapeACFMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                Fetching...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Fetch ACF Grants
              </>
            )}
          </button>
        </div>

        {/* Success/Error Messages */}
        {scrapeACFMutation.isSuccess && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-green-700">Success!</div>
              <div className="text-sm text-green-600 mt-1">
                {scrapeACFMutation.data?.message || 'Successfully fetched ACF grant opportunities'}
              </div>
              {scrapeACFMutation.data?.grants && scrapeACFMutation.data.grants.length > 0 && (
                <ul className="mt-2 text-sm text-green-600 space-y-1">
                  {scrapeACFMutation.data.grants.map((grant, idx) => (
                    <li key={idx}>• {grant.title} ({grant.source})</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {scrapeACFMutation.isError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700">Error</div>
              <div className="text-sm text-red-600 mt-1">
                {scrapeACFMutation.error?.response?.data?.message ||
                 scrapeACFMutation.error?.message ||
                 'Failed to fetch ACF grants. Please try again.'}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* HUD Grants Button Section */}
      <section className="bg-card rounded-2xl shadow-apple p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Fetch HUD Housing Grants
            </h3>
            <p className="text-muted-foreground">
              Pull housing and transitional housing grants from HUD (Department of Housing and Urban Development) for domestic violence and trafficking victims
            </p>
          </div>
          <button
            onClick={() => fetchHUDMutation.mutate()}
            disabled={fetchHUDMutation.isPending}
            className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-all duration-200 shadow-apple hover:shadow-apple-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetchHUDMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                Fetching...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Fetch HUD Grants
              </>
            )}
          </button>
        </div>

        {/* Success/Error Messages */}
        {fetchHUDMutation.isSuccess && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-green-700">Success!</div>
              <div className="text-sm text-green-600 mt-1">
                {fetchHUDMutation.data?.message || 'Successfully fetched HUD grant opportunities'}
              </div>
              {fetchHUDMutation.data?.opportunities && fetchHUDMutation.data.opportunities.length > 0 && (
                <ul className="mt-2 text-sm text-green-600 space-y-1">
                  {fetchHUDMutation.data.opportunities.slice(0, 5).map((opp, idx) => (
                    <li key={idx}>• {opp.title}</li>
                  ))}
                  {fetchHUDMutation.data.opportunities.length > 5 && (
                    <li className="font-semibold">...and {fetchHUDMutation.data.opportunities.length - 5} more</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}

        {fetchHUDMutation.isError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700">Error</div>
              <div className="text-sm text-red-600 mt-1">
                {fetchHUDMutation.error?.response?.data?.message ||
                 fetchHUDMutation.error?.message ||
                 'Failed to fetch HUD grants. Please try again.'}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SAMHSA Grants Button Section */}
      <section className="bg-card rounded-2xl shadow-apple p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Fetch SAMHSA Mental Health Grants
            </h3>
            <p className="text-muted-foreground">
              Pull behavioral health and trauma-informed grants from SAMHSA (Substance Abuse and Mental Health Services Administration) for victims of violence and trafficking
            </p>
          </div>
          <button
            onClick={() => fetchSAMHSAMutation.mutate()}
            disabled={fetchSAMHSAMutation.isPending}
            className="inline-flex items-center px-6 py-3 bg-teal-600 text-white rounded-xl font-semibold hover:bg-teal-700 transition-all duration-200 shadow-apple hover:shadow-apple-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetchSAMHSAMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                Fetching...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Fetch SAMHSA Grants
              </>
            )}
          </button>
        </div>

        {/* Success/Error Messages */}
        {fetchSAMHSAMutation.isSuccess && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-green-700">Success!</div>
              <div className="text-sm text-green-600 mt-1">
                {fetchSAMHSAMutation.data?.message || 'Successfully fetched SAMHSA grant opportunities'}
              </div>
              {fetchSAMHSAMutation.data?.opportunities && fetchSAMHSAMutation.data.opportunities.length > 0 && (
                <ul className="mt-2 text-sm text-green-600 space-y-1">
                  {fetchSAMHSAMutation.data.opportunities.slice(0, 5).map((opp, idx) => (
                    <li key={idx}>• {opp.title}</li>
                  ))}
                  {fetchSAMHSAMutation.data.opportunities.length > 5 && (
                    <li className="font-semibold">...and {fetchSAMHSAMutation.data.opportunities.length - 5} more</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}

        {fetchSAMHSAMutation.isError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700">Error</div>
              <div className="text-sm text-red-600 mt-1">
                {fetchSAMHSAMutation.error?.response?.data?.message ||
                 fetchSAMHSAMutation.error?.message ||
                 'Failed to fetch SAMHSA grants. Please try again.'}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Florida DCF Grants Button Section */}
      <section className="bg-card rounded-2xl shadow-apple p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Fetch Florida DCF Domestic Violence Grants
            </h3>
            <p className="text-muted-foreground">
              Scrape current funding opportunities from Florida Department of Children and Families - Office of Domestic Violence for state-level DV grants
            </p>
          </div>
          <button
            onClick={() => scrapeFloridaDCFMutation.mutate({ limit: 20, location })}
            disabled={scrapeFloridaDCFMutation.isPending}
            className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all duration-200 shadow-apple hover:shadow-apple-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scrapeFloridaDCFMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                Fetching...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Fetch Florida DCF Grants
              </>
            )}
          </button>
        </div>

        {/* Success/Error Messages */}
        {scrapeFloridaDCFMutation.isSuccess && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-green-700">Success!</div>
              <div className="text-sm text-green-600 mt-1">
                {scrapeFloridaDCFMutation.data?.message || 'Successfully fetched Florida DCF grant opportunities'}
              </div>
              {scrapeFloridaDCFMutation.data?.grants && scrapeFloridaDCFMutation.data.grants.length > 0 && (
                <ul className="mt-2 text-sm text-green-600 space-y-1">
                  {scrapeFloridaDCFMutation.data.grants.map((grant, idx) => (
                    <li key={idx}>• {grant.title} ({grant.source})</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {scrapeFloridaDCFMutation.isError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700">Error</div>
              <div className="text-sm text-red-600 mt-1">
                {scrapeFloridaDCFMutation.error?.response?.data?.message ||
                 scrapeFloridaDCFMutation.error?.message ||
                 'Failed to fetch Florida DCF grants. Please try again.'}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Jacksonville Foundation Grants Button Section */}
      <section className="bg-card rounded-2xl shadow-apple p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Fetch Jacksonville Foundation Grants
            </h3>
            <p className="text-muted-foreground">
              Scrape current funding opportunities from Community Foundation for Northeast Florida including Women's Giving Alliance grants for local nonprofits
            </p>
          </div>
          <button
            onClick={() => scrapeJaxFoundationMutation.mutate({ limit: 10, location })}
            disabled={scrapeJaxFoundationMutation.isPending}
            className="inline-flex items-center px-6 py-3 bg-pink-600 text-white rounded-xl font-semibold hover:bg-pink-700 transition-all duration-200 shadow-apple hover:shadow-apple-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scrapeJaxFoundationMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                Fetching...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Fetch Foundation Grants
              </>
            )}
          </button>
        </div>

        {/* Success/Error Messages */}
        {scrapeJaxFoundationMutation.isSuccess && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-green-700">Success!</div>
              <div className="text-sm text-green-600 mt-1">
                {scrapeJaxFoundationMutation.data?.message || 'Successfully fetched foundation grant opportunities'}
              </div>
              {scrapeJaxFoundationMutation.data?.grants && scrapeJaxFoundationMutation.data.grants.length > 0 && (
                <ul className="mt-2 text-sm text-green-600 space-y-1">
                  {scrapeJaxFoundationMutation.data.grants.map((grant, idx) => (
                    <li key={idx}>• {grant.title} ({grant.source})</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {scrapeJaxFoundationMutation.isError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700">Error</div>
              <div className="text-sm text-red-600 mt-1">
                {scrapeJaxFoundationMutation.error?.response?.data?.message ||
                 scrapeJaxFoundationMutation.error?.message ||
                 'Failed to fetch foundation grants. Please try again.'}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* USASpending.gov Button Section */}
      <section className="bg-card rounded-2xl shadow-apple p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Fetch USASpending.gov Grant Awards
            </h3>
            <p className="text-muted-foreground">
              Pull historical grant award data from USASpending.gov - last 18 months of federal grants related to domestic violence, trafficking, and victim services
            </p>
          </div>
          <button
            onClick={() => fetchUSASpendingMutation.mutate()}
            disabled={fetchUSASpendingMutation.isPending}
            className="inline-flex items-center px-6 py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 transition-all duration-200 shadow-apple hover:shadow-apple-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetchUSASpendingMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                Fetching...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Fetch USASpending Awards
              </>
            )}
          </button>
        </div>

        {/* Success/Error Messages */}
        {fetchUSASpendingMutation.isSuccess && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-green-700">Success!</div>
              <div className="text-sm text-green-600 mt-1">
                {fetchUSASpendingMutation.data?.message || 'Successfully fetched USASpending award data'}
              </div>
              {fetchUSASpendingMutation.data?.opportunities && fetchUSASpendingMutation.data.opportunities.length > 0 && (
                <ul className="mt-2 text-sm text-green-600 space-y-1">
                  {fetchUSASpendingMutation.data.opportunities.slice(0, 5).map((opp, idx) => (
                    <li key={idx}>• {opp.title}</li>
                  ))}
                  {fetchUSASpendingMutation.data.opportunities.length > 5 && (
                    <li className="font-semibold">...and {fetchUSASpendingMutation.data.opportunities.length - 5} more</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}

        {fetchUSASpendingMutation.isError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700">Error</div>
              <div className="text-sm text-red-600 mt-1">
                {fetchUSASpendingMutation.error?.response?.data?.message ||
                 fetchUSASpendingMutation.error?.message ||
                 'Failed to fetch USASpending data. Please try again.'}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SAM.gov Button Section */}
      <section className="bg-card rounded-2xl shadow-apple p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Fetch SAM.gov Contract Opportunities
            </h3>
            <p className="text-muted-foreground">
              Pull contract and assistance opportunities from SAM.gov (System for Award Management) - last 18 months of opportunities related to victim services and trafficking
            </p>
          </div>
          <button
            onClick={() => fetchSAMMutation.mutate()}
            disabled={fetchSAMMutation.isPending}
            className="inline-flex items-center px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all duration-200 shadow-apple hover:shadow-apple-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetchSAMMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                Fetching...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Fetch SAM.gov Opportunities
              </>
            )}
          </button>
        </div>

        {/* Success/Error Messages */}
        {fetchSAMMutation.isSuccess && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-green-700">Success!</div>
              <div className="text-sm text-green-600 mt-1">
                {fetchSAMMutation.data?.message || 'Successfully fetched SAM.gov opportunities'}
              </div>
              {fetchSAMMutation.data?.opportunities && fetchSAMMutation.data.opportunities.length > 0 && (
                <ul className="mt-2 text-sm text-green-600 space-y-1">
                  {fetchSAMMutation.data.opportunities.slice(0, 5).map((opp, idx) => (
                    <li key={idx}>• {opp.title}</li>
                  ))}
                  {fetchSAMMutation.data.opportunities.length > 5 && (
                    <li className="font-semibold">...and {fetchSAMMutation.data.opportunities.length - 5} more</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}

        {fetchSAMMutation.isError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700">Error</div>
              <div className="text-sm text-red-600 mt-1">
                {fetchSAMMutation.error?.response?.data?.message ||
                 fetchSAMMutation.error?.message ||
                 'Failed to fetch SAM.gov data. Please try again.'}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Local Scraper Button Section */}
      <section className="bg-card rounded-2xl shadow-apple p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Search Local Jacksonville Grants
            </h3>
            <p className="text-muted-foreground">
              Web scrape local sources for grant opportunities in Jacksonville and Northeast Florida
            </p>
          </div>
          <button
            onClick={() => scrapeLocalMutation.mutate({ limit: 2, location })}
            disabled={scrapeLocalMutation.isPending}
            className="inline-flex items-center px-6 py-3 bg-secondary text-secondary-foreground rounded-xl font-semibold hover:bg-secondary/90 transition-all duration-200 shadow-apple hover:shadow-apple-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scrapeLocalMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-secondary-foreground mr-2" />
                Searching...
              </>
            ) : (
              <>
                <Search className="mr-2 h-5 w-5" />
                Search Local Grants
              </>
            )}
          </button>
        </div>
        <label className="mt-4 block text-sm text-muted-foreground">
          Location focus
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full md:w-80 px-4 py-2 bg-background border border-border rounded-xl focus:ring-2 focus:ring-secondary focus:border-secondary transition-all"
            placeholder="City, State or ZIP"
            aria-label="Location to focus scraping"
          />
        </label>

        {/* Success/Error Messages */}
        {scrapeLocalMutation.isSuccess && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-green-700">Success!</div>
              <div className="text-sm text-green-600 mt-1">
                {scrapeLocalMutation.data?.message || 'Successfully scraped local grant opportunities'}
              </div>
              {scrapeLocalMutation.data?.grants && scrapeLocalMutation.data.grants.length > 0 && (
                <ul className="mt-2 text-sm text-green-600 space-y-1">
                  {scrapeLocalMutation.data.grants.map((grant, idx) => (
                    <li key={idx}>• {grant.title} ({grant.source})</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {scrapeLocalMutation.isError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700">Error</div>
              <div className="text-sm text-red-600 mt-1">
                {scrapeLocalMutation.error?.response?.data?.message ||
                 scrapeLocalMutation.error?.message ||
                 'Failed to scrape local grants. Please try again.'}
              </div>
            </div>
          </div>
        )}
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

