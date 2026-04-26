import React, { useEffect, useState } from 'react'
import { History, Bookmark, Rocket, ArrowRight } from 'lucide-react'
import AvatarIcon from '@/components/ui/avatar'
import Tooltip from '@/components/ui/tooltip'
import { extractDomainNameFromUrl } from '@/helpers'
import StorageSyncFavIcon from '@/storage/favIcon.sync'

interface StarterSuggestionsProps {
  savedSnapshots: NStorage.Sync.Response.Group[]
  onRestoreSnapshot: (group: NStorage.Sync.Response.Group) => Promise<void>
}

export const StarterSuggestions: React.FC<StarterSuggestionsProps> = ({
  savedSnapshots,
  onRestoreSnapshot,
}) => {
  const [topSites, setTopSites] = useState<chrome.topSites.MostVisitedURL[]>([])
  const [favIcons, setFavIcons] = useState<NStorage.Sync.Schema.FavIcons>({})
  const [recentSessions, setRecentSessions] = useState<chrome.sessions.Session[]>([])

  useEffect(() => {
    // Get Top Sites
    chrome.topSites.get((data) => setTopSites(data.slice(0, 8)))

    // Get FavIcons from storage
    const fetchFavIcons = async () => {
      const data = await StorageSyncFavIcon.get()
      setFavIcons(data)
    }
    fetchFavIcons()

    // Get Recently Closed Sessions
    if (chrome.sessions) {
      chrome.sessions.getRecentlyClosed({ maxResults: 5 }, (sessions) => {
        setRecentSessions(sessions)
      })
    }
  }, [])

  const handleRestoreSession = (session: chrome.sessions.Session) => {
    if (session.tab) {
      chrome.sessions.restore(session.tab.sessionId)
    } else if (session.window) {
      chrome.sessions.restore(session.window.sessionId)
    }
  }

  const getFavIconUrl = (url: string) => {
    const domainName = extractDomainNameFromUrl(url)
    return domainName ? favIcons[domainName]?.url : ''
  }

  return (
    <div className="flex flex-col gap-8 py-10 px-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center mb-2">
        <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">Ready to start?</h1>
        <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-[0.1em] mt-1 font-medium">Pick up where you left off</p>
      </div>

      {/* 1. Resume Last Session */}
      {recentSessions.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <History size={14} className="text-[var(--sp-tab-pill-active)]" />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Recently Closed</h2>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {recentSessions.slice(0, 2).map((session, idx) => {
              const title = session.tab?.title || (session.window?.tabs ? `${session.window.tabs.length} tabs window` : 'Recent Session')
              const url = session.tab?.url || ''
              return (
                <button
                  key={idx}
                  onClick={() => handleRestoreSession(session)}
                  className="group sp-card flex items-center justify-between p-3 rounded-2xl border border-[var(--sp-card-border)] bg-[var(--surface-elevated)] hover:bg-[var(--sp-card-hover)] transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-8 rounded-xl bg-[var(--surface-muted)] flex items-center justify-center shrink-0 border border-[var(--sp-card-border)]">
                      {url ? (
                        <AvatarIcon src={getFavIconUrl(url)} fallbackString={title[0]} className="size-5" />
                      ) : (
                        <History size={16} className="text-[var(--text-muted)]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate pr-2">{title}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Restore this session</p>
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* 2. Jump Back Into Snapshots */}
      {savedSnapshots.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Bookmark size={14} className="text-amber-500" />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Favorite Snapshots</h2>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {savedSnapshots.slice(0, 2).map((group) => (
              <button
                key={group.id}
                onClick={() => onRestoreSnapshot(group)}
                className="group sp-card flex items-center justify-between p-3 rounded-2xl border border-[var(--sp-card-border)] bg-[var(--surface-elevated)] hover:bg-[var(--sp-card-hover)] transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-xl bg-[var(--surface-muted)] flex items-center justify-center shrink-0 border border-[var(--sp-card-border)]" 
                       style={{ borderColor: `var(--group-color-${group.color}-border)` }}>
                    <Bookmark size={16} className={`text-[var(--group-color-${group.color}-text)]`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate pr-2">{group.title}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{group.tabs.length} tabs saved</p>
                  </div>
                </div>
                <ArrowRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 3. Quick Launch Top Sites */}
      {topSites.length > 0 && (
        <section data-live-surface="top-sites">
          <div className="flex items-center gap-2 mb-4 px-1">
            <Rocket size={14} className="text-indigo-500" />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Quick Launch</h2>
          </div>
          <div className="flex flex-wrap gap-4 justify-center px-2">
            {topSites.map((site) => (
              <Tooltip key={site.url}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={() => chrome.tabs.create({ url: site.url })}
                    className="group size-10 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--sp-card-border)] flex items-center justify-center hover:bg-[var(--sp-card-hover)] hover:scale-110 transition-all cursor-pointer shadow-sm"
                  >
                    <AvatarIcon 
                      src={getFavIconUrl(site.url)} 
                      fallbackString={site.title[0]} 
                      className="size-6 grayscale-[0.2] group-hover:grayscale-0" 
                    />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Content>{site.title}</Tooltip.Content>
              </Tooltip>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
