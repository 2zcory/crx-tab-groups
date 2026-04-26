import { ListPlus, Pin, PinOff, RefreshCw, X, ZapOff } from 'lucide-react'
import { Button } from '../../../../components/ui/button'
import { KeyboardEventHandler, MouseEventHandler, useEffect, useRef, useState } from 'react'
import AvatarIcon from '../../../../components/ui/avatar'
import { cn } from '@/lib/utils'
import { formatTimeAgo, extractDomainNameFromUrl } from '@/helpers'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface IButtonIconProps extends React.ComponentPropsWithoutRef<'button'> {}

function ButtonIcon({ children, className, onClick, ...props }: IButtonIconProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        'sp-icon-button cursor-pointer size-5 shrink-0 rounded-md hover:bg-[var(--surface-muted)]',
        className,
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </Button>
  )
}

interface IProps {
  tab: chrome.tabs.Tab
  isOverlay?: boolean
  onAddTabToRules?: () => void
}

function TabListItem({ tab, isOverlay, onAddTabToRules }: IProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id!,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 100 : undefined,
  }

  const textRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [scrollDistance, setScrollDistance] = useState(0)

  useEffect(() => {
    if (textRef.current) {
      const { scrollWidth, clientWidth } = textRef.current
      const overflowing = scrollWidth > clientWidth
      setIsOverflowing(overflowing)
      if (overflowing) {
        setScrollDistance(scrollWidth - clientWidth)
      }
    }
  }, [tab.title])

  const handleActiveTab: MouseEventHandler<HTMLDivElement> = (e) => {
    if (isDragging || isOverlay) return
    e.stopPropagation()
    if (tab.id) {
      void chrome.tabs.update(tab.id, { active: true })
      void chrome.windows.update(tab.windowId, { focused: true })
    }
  }

  const handleCloseTab: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation()
    tab.id && chrome.tabs.remove(tab.id)
  }

  const togglePin: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation()
    const params: chrome.tabs.UpdateProperties = { pinned: true }
    if (tab.pinned) params.pinned = false
    tab.id && chrome.tabs.update(tab.id, params)
  }

  const handleReloadTab: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation()
    tab.id && chrome.tabs.reload(tab.id)
  }

  const handleCreateQuickRule: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation()
    onAddTabToRules?.()
  }

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    if (tab.id) {
      void chrome.tabs.update(tab.id, { active: true })
      void chrome.windows.update(tab.windowId, { focused: true })
    }
  }

  const domain = tab.url ? extractDomainNameFromUrl(tab.url) : null
  const isLoading = tab.status === 'loading'
  const isDiscarded = (tab as any).discarded

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group relative select-none overflow-hidden',
        'grid grid-cols-[auto_1fr_auto] items-center',
        'py-2 pl-3 pr-2 rounded-xl transition-all duration-300 outline-none border',
        !isOverlay && 'sp-tab-card cursor-default',
        tab.active && !isOverlay && 'sp-tab-card-active ring-1 ring-[color:var(--sp-card-border)]',
        isDragging && !isOverlay && 'opacity-30',
        isOverlay && 'sp-tab-card-overlay scale-[1.03] cursor-grabbing z-[1000]',
      )}
      role="button"
      tabIndex={isOverlay ? -1 : 0}
      onClick={handleActiveTab}
      onKeyDown={handleKeyDown}
    >
      {/* Loading Indicator */}
      {isLoading && !isOverlay && (
        <div className="absolute bottom-0 left-0 h-[1px] bg-emerald-500/40 w-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 animate-[loading-bar_1.5s_infinite_ease-in-out]"
            style={{ width: '30%' }}
          />
        </div>
      )}

      {/* Active Marker */}
      {tab.active && !isOverlay && (
        <div className="sp-active-marker absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full" />
      )}

      <div className="relative">
        <AvatarIcon
          src={tab.favIconUrl}
          fallbackString={(tab.title?.[0] || '').toUpperCase()}
          className={cn(
            'size-4 shrink-0 transition-transform duration-200 group-hover:scale-105',
            { 'ring-1 ring-black/5': tab.active && !isOverlay },
            isDiscarded && 'grayscale opacity-50',
          )}
        />
        {isDiscarded && !isOverlay && (
          <div className="sp-discarded-badge absolute -bottom-0.5 -right-0.5 rounded-full p-0.5">
            <ZapOff size={7} className="sp-copy-muted" />
          </div>
        )}
      </div>

      <div className="ml-2.5 overflow-hidden pointer-events-none flex flex-col justify-center">
        <div className="w-full overflow-hidden" ref={textRef}>
          <div
            className={cn(
              'text-[11px] leading-tight transition-colors whitespace-nowrap marquee-target',
              {
                'sp-copy-primary font-bold active-marquee':
                  tab.active && isOverflowing && !isOverlay,
                'sp-copy-secondary': !tab.active || isOverlay,
                'hidden-marquee': !isOverflowing || isOverlay,
              },
            )}
            style={{
              ['--marquee-duration' as string]: `${Math.max(4, (tab.title?.length || 0) / 5)}s`,
              ['--scroll-dist' as string]: `-${scrollDistance + 10}px`,
            }}
          >
            {tab.title}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {domain && (
            <span className="sp-copy-muted text-[9px] font-medium truncate max-w-[100px]">
              {domain}
            </span>
          )}
          {domain && <span className="sp-domain-dot size-0.5 rounded-full" />}
          <span className="text-[9px] font-medium text-[color:color-mix(in_srgb,var(--text-muted)_72%,transparent)]">
            {formatTimeAgo((tab as any).lastAccessed || (tab as any).lastOpened)}
          </span>
        </div>
      </div>

      {!isOverlay && (
        <div className="flex items-center gap-0.5 ml-1">
          <div className="sp-action-rail hidden group-hover:flex group-focus-within:flex items-center gap-0.5 rounded-lg p-0.5 animate-in fade-in zoom-in-95 duration-150">
            {onAddTabToRules && (
              <>
                <ButtonIcon onClick={handleCreateQuickRule} title="Add to Rules">
                  <ListPlus size={11} className="sp-copy-secondary" />
                </ButtonIcon>
                <div className="sp-action-divider mx-0.5" />
              </>
            )}
            <ButtonIcon onClick={togglePin} title={tab.pinned ? 'Unpin tab' : 'Pin tab'}>
              {tab.pinned ? (
                <PinOff size={11} className="sp-copy-secondary" />
              ) : (
                <Pin size={11} className="sp-copy-secondary" />
              )}
            </ButtonIcon>
            <ButtonIcon onClick={handleReloadTab} title="Reload tab">
              <RefreshCw size={11} className="sp-copy-secondary" />
            </ButtonIcon>
            <div className="sp-action-divider mx-0.5" />
            <ButtonIcon
              onClick={handleCloseTab}
              title="Close tab"
              className="hover:bg-red-50 hover:text-red-600"
            >
              <X size={11} className="sp-copy-secondary group-hover:text-red-600" />
            </ButtonIcon>
          </div>
        </div>
      )}
    </div>
  )
}

export default TabListItem
