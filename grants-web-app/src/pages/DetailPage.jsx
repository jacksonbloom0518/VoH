import { useQuery } from '@tanstack/react-query'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Building2, Calendar, DollarSign, MapPin, Mail,
  Phone, User, ExternalLink, Clock, Tag, FileText, AlertTriangle, CheckCircle2
} from 'lucide-react'
import { opportunitiesAPI } from '../lib/api'
import { formatCurrency, formatDate, getDaysUntil, getDeadlineUrgency, getSourceBadgeColor, cn } from '../lib/utils'

export default function DetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: opp, isLoading, error } = useQuery({
    queryKey: ['opportunity', id],
    queryFn: () => opportunitiesAPI.getById(id),
  })

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-6 text-muted-foreground text-lg">Loading opportunity details...</p>
      </div>
    )
  }

  if (error || !opp) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl shadow-apple p-8 text-destructive">
          <p className="font-semibold text-lg">Opportunity not found</p>
          <p className="text-sm mt-3 opacity-90">
            The opportunity you're looking for doesn't exist or has been removed.
          </p>
          <button
            onClick={() => navigate('/search')}
            className="mt-6 text-primary hover:text-primary/90 font-semibold transition-colors"
          >
            ← Back to Search
          </button>
        </div>
      </div>
    )
  }

  const daysUntil = getDaysUntil(opp.response_deadline)
  const urgency = getDeadlineUrgency(daysUntil)

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors font-medium"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Header */}
      <div className="bg-card rounded-2xl shadow-apple-lg p-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <span className={cn('px-4 py-2 rounded-xl text-xs font-semibold capitalize inline-block mb-4', getSourceBadgeColor(opp.source))}>
              {opp.source}
            </span>
            <h1 className="text-4xl font-bold text-foreground leading-tight tracking-tight">
              {opp.title}
            </h1>
          </div>
        </div>

        {/* Key Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          {opp.award_amount && (
            <div className="bg-primary/10 rounded-xl p-6">
              <div className="flex items-center gap-2 text-primary mb-2">
                <DollarSign className="h-5 w-5" />
                <span className="text-sm font-semibold">Award Amount</span>
              </div>
              <p className="text-3xl font-bold text-foreground">
                {formatCurrency(opp.award_amount)}
              </p>
            </div>
          )}

          {opp.response_deadline && (
            <div className={cn(
              'rounded-xl p-6',
              urgency === 'critical' && 'bg-red-50 border-2 border-red-200',
              urgency === 'urgent' && 'bg-orange-50 border-2 border-orange-200',
              urgency === 'normal' && 'bg-accent',
              urgency === 'expired' && 'bg-gray-50'
            )}>
              <div className={cn(
                'flex items-center gap-2 mb-2',
                urgency === 'critical' && 'text-red-600',
                urgency === 'urgent' && 'text-orange-600',
                urgency === 'normal' && 'text-muted-foreground',
                urgency === 'expired' && 'text-gray-400'
              )}>
                {urgency === 'critical' ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <Clock className="h-5 w-5" />
                )}
                <span className="text-sm font-semibold">Deadline</span>
                {urgency === 'critical' && (
                  <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">
                    URGENT
                  </span>
                )}
                {urgency === 'urgent' && (
                  <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-semibold">
                    CLOSING SOON
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold text-foreground">
                {daysUntil !== null && daysUntil >= 0 ? (
                  <>
                    {daysUntil} <span className="text-lg font-normal">days left</span>
                  </>
                ) : (
                  formatDate(opp.response_deadline)
                )}
              </p>
            </div>
          )}

          {opp.posted_date && (
            <div className="bg-accent rounded-xl p-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Calendar className="h-5 w-5" />
                <span className="text-sm font-semibold">Posted</span>
              </div>
              <p className="text-3xl font-bold text-foreground">
                {formatDate(opp.posted_date)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      {opp.summary && (
        <div className="bg-card rounded-2xl shadow-apple p-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center gap-3">
            <FileText className="h-6 w-6" />
            Summary
          </h2>
          <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed text-base">
            {opp.summary}
          </p>
        </div>
      )}

      {/* Requirements */}
      {opp.requirements && (
        <div className="bg-card rounded-2xl shadow-apple p-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            Application Requirements
            <span className="ml-3 px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full">
              AI-Generated
            </span>
          </h2>
          <div className="text-muted-foreground leading-relaxed text-base space-y-3">
            {opp.requirements.split('\n').map((line, idx) => {
              const trimmed = line.trim();
              if (!trimmed) return null;

              // Check if it's a bullet point
              if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                return (
                  <div key={idx} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <p>{trimmed.replace(/^[•\-*]\s*/, '')}</p>
                  </div>
                );
              }

              // Regular paragraph
              return (
                <p key={idx} className="text-sm opacity-80">
                  {trimmed}
                </p>
              );
            })}
          </div>
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground/70 italic">
              These requirements were automatically generated using AI based on available grant documentation.
              Always verify requirements by visiting the official grant source.
            </p>
          </div>
        </div>
      )}

      {/* Agency & Program Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Agency */}
        <div className="bg-card rounded-2xl shadow-apple p-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center gap-3">
            <Building2 className="h-6 w-6" />
            Agency
          </h2>
          <p className="text-muted-foreground text-base">{opp.agency || 'Not specified'}</p>

          {opp.award_number && (
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm text-muted-foreground font-medium">Award Number</p>
              <p className="font-mono text-foreground mt-2 text-base">{opp.award_number}</p>
            </div>
          )}
        </div>

        {/* Codes */}
        <div className="bg-card rounded-2xl shadow-apple p-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center gap-3">
            <Tag className="h-6 w-6" />
            Classifications
          </h2>
          <div className="space-y-4">
            {opp.naics && (
              <div>
                <p className="text-sm text-muted-foreground font-medium">NAICS Code</p>
                <p className="text-foreground font-semibold mt-1">{opp.naics}</p>
              </div>
            )}
            {opp.psc && (
              <div>
                <p className="text-sm text-muted-foreground font-medium">PSC Code</p>
                <p className="text-foreground font-semibold mt-1">{opp.psc}</p>
              </div>
            )}
            {opp.set_aside && (
              <div>
                <p className="text-sm text-muted-foreground font-medium">Set-Aside</p>
                <p className="text-foreground font-semibold mt-1">{opp.set_aside}</p>
              </div>
            )}
            {!opp.naics && !opp.psc && !opp.set_aside && (
              <p className="text-muted-foreground text-sm">No classifications available</p>
            )}
          </div>
        </div>
      </div>

      {/* Place of Performance */}
      {(opp.pop_city || opp.pop_state || opp.pop_country) && (
        <div className="bg-card rounded-2xl shadow-apple p-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center gap-3">
            <MapPin className="h-6 w-6" />
            Place of Performance
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {opp.pop_city && (
              <div>
                <p className="text-sm text-muted-foreground font-medium">City</p>
                <p className="text-foreground font-semibold mt-1">{opp.pop_city}</p>
              </div>
            )}
            {opp.pop_state && (
              <div>
                <p className="text-sm text-muted-foreground font-medium">State</p>
                <p className="text-foreground font-semibold mt-1">{opp.pop_state}</p>
              </div>
            )}
            {opp.pop_zip && (
              <div>
                <p className="text-sm text-muted-foreground font-medium">ZIP Code</p>
                <p className="text-foreground font-semibold mt-1">{opp.pop_zip}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Point of Contact */}
      {(opp.poc_name || opp.poc_email || opp.poc_phone) && (
        <div className="bg-card rounded-2xl shadow-apple p-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center gap-3">
            <User className="h-6 w-6" />
            Point of Contact
          </h2>
          <div className="space-y-4">
            {opp.poc_name && (
              <div className="flex items-center gap-3 text-muted-foreground">
                <User className="h-5 w-5" />
                <span className="text-base">{opp.poc_name}</span>
              </div>
            )}
            {opp.poc_email && (
              <a
                href={`mailto:${opp.poc_email}`}
                className="flex items-center gap-3 text-primary hover:text-primary/90 transition-colors"
              >
                <Mail className="h-5 w-5" />
                <span className="text-base">{opp.poc_email}</span>
              </a>
            )}
            {opp.poc_phone && (
              <a
                href={`tel:${opp.poc_phone}`}
                className="flex items-center gap-3 text-primary hover:text-primary/90 transition-colors"
              >
                <Phone className="h-5 w-5" />
                <span className="text-base">{opp.poc_phone}</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* External Link */}
      {opp.source_record_url && (
        <div className="flex justify-center pt-4">
          <a
            href={opp.source_record_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-semibold hover:bg-primary/90 transition-all duration-200 shadow-apple-lg hover:shadow-apple-xl"
          >
            View on {opp.source}
            <ExternalLink className="h-5 w-5" />
          </a>
        </div>
      )}
    </div>
  )
}

