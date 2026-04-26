import React, { useEffect, useState } from 'react'
import { History, Bookmark, Rocket, ArrowRight, RefreshCw, Layers } from 'lucide-react'
import AvatarIcon from '@/components/ui/avatar'
import Tooltip from '@/components/ui/tooltip'
import { extractDomainNameFromUrl } from '@/helpers'
import StorageSyncFavIcon from '@/storage/favIcon.sync'

interface SessionSnapshot {
  timestamp: string
  windowCount: number
  tabCount: number
  windows: {
    id: number
    tabs: {
      url: string
      title: string
      favIconUrl?: string
      pinned: boolean
      groupId: number
    }[]
    groups: {
      id: number
      title?: string
      color: chrome.tabGroups.Color
      collapsed: boolean
    }[]
  }[]
}

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
  const [lastKnownSession, setLastKnownSession] = useState<SessionSnapshot | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)

  useEffect(() => {
    // Get Top Sites
    chrome.topSites.get((data) => setTopSites(data.slice(0, 8)))

    // Get FavIcons from storage
    const fetchFavIcons = async () => {
      const data = await StorageSyncFavIcon.get()
      setFavIcons(data)
    }
    fetchFavIcons()

    // Get Recently Closed Sessions (Native Chrome feature)
    if (chrome.sessions) {
      chrome.sessions.getRecentlyClosed({ maxResults: 5 }, (sessions) => {
        setRecentSessions(sessions)
      })
    }

    // Get Last Known Good Session (Our persistent feature)
    chrome.storage.local.get('last_known_good_session', (data) => {
      const session = data.last_known_good_session as SessionSnapshot | undefined
      if (session) {
        setLastKnownSession(session)
      }
    })
  }, [])

  const handleRestoreSession = (session: chrome.sessions.Session) => {
    if (session.tab) {
      chrome.sessions.restore(session.tab.sessionId)
    } else if (session.window) {
      chrome.sessions.restore(session.window.sessionId)
    }
  }

  const handleFullSessionRecovery = async () => {
    if (!lastKnownSession || isRestoring) return
    setIsRestoring(true)

    try {
      for (const winData of lastKnownSession.windows) {
        // 1. Create a new window for each saved window
        const newWindow = await chrome.windows.create({ focused: false })
        const newWindowId = newWindow?.id

        if (typeof newWindowId !== 'number') continue

        // 2. Track group mapping (Old Group ID -> New Group ID)
        const groupMapping: Record<number, number> = {}

        // 3. Create all tabs in this window
        for (const tabData of winData.tabs) {
          const createdTab = await chrome.tabs.create({
            windowId: newWindowId,
            url: tabData.url,
            pinned: tabData.pinned,
            active: false,
          })

          // 4. If tab was in a group, handle it
          if (tabData.groupId !== -1) {
            if (groupMapping[tabData.groupId]) {
              // Add to existing group
              await chrome.tabs.group({
                tabIds: [createdTab.id!],
                groupId: groupMapping[tabData.groupId],
              })
            } else {
              // Create new group
              const newGroupId = await chrome.tabs.group({
                tabIds: [createdTab.id!],
              })
              groupMapping[tabData.groupId] = newGroupId

              // Apply group styling
              const savedGroup = winData.groups.find((g) => g.id === tabData.groupId)
              if (savedGroup) {
                await chrome.tabGroups.update(newGroupId, {
                  title: savedGroup.title,
                  color: savedGroup.color,
                  collapsed: savedGroup.collapsed,
                })
              }
            }
          }
        }

        // 5. Remove the initial blank tab that Chrome created with the window
        const initialTabs = await chrome.tabs.query({ windowId: newWindowId })
        const blankTab = initialTabs.find((t) => t.url === 'about:blank' || t.pendingUrl === 'about:blank' || t.url?.startsWith('chrome://newtab'))
        if (blankTab && initialTabs.length > 1) {
          await chrome.tabs.remove(blankTab.id!)
        }
      }

      // Success - clear the recovery state to avoid double restore
      await chrome.storage.local.remove('last_known_good_session')
      setLastKnownSession(null)
    } catch (e) {
      console.error('[Recovery] Failed to reconstruct session:', e)
    } finally {
      setIsRestoring(false)
    }
  }

  const getFavIconUrl = (url: string) => {
    const domainName = extractDomainNameFromUrl(url)
    return domainName ? favIcons[domainName]?.url : ''
  }

  const getTimeAgo = (isoString: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(isoString).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  return (
    <div className="flex flex-col gap-8 py-10 px-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center mb-2">
        <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">Ready to start?</h1>
        <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-[0.1em] mt-1 font-medium">Pick up where you left off</p>
      </div>

      {/* 0. HERO: Full Session Recovery */}
      {lastKnownSession && (
        <section className="animate-in zoom-in-95 duration-500 delay-200">
          <div className="sp-card bg-indigo-500/10 border-indigo-500/20 rounded-3xl p-5 border flex flex-col gap-4 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                <Layers size={80} className="text-indigo-500" />
             </div>
             <div className="relative z-10">
                <div className="flex items-center gap-2 mb-1">
                   <div className="size-2 rounded-full bg-indigo-500 animate-pulse" />
                   <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Recovery Available</span>
                </div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Resume your previous session?</h2>
                <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                   Restore **{lastKnownSession.tabCount} tabs** across **{lastKnownSession.windowCount} windows** from {getTimeAgo(lastKnownSession.timestamp)}.
                </p>
             </div>
             <button
                disabled={isRestoring}
                onClick={handleFullSessionRecovery}
                className="relative z-10 w-full py-2.5 rounded-xl bg-indigo-500 text-white text-[11px] font-bold flex items-center justify-center gap-2 hover:bg-indigo-600 transition-all cursor-pointer shadow-lg shadow-indigo-500/20 active:scale-[0.98] disabled:opacity-50"
             >
                {isRestoring ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {isRestoring ? 'Restoring Session...' : 'Restore Everything'}
             </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-8">
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
                        <p className="text-[10px] text-[var(--text-muted)]">Restore this item</p>
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
    </div>
  )
}
