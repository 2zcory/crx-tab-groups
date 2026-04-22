import { Pin, PinOff, RefreshCw, X, ZapOff } from 'lucide-react'
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
      className={cn('cursor-pointer hover:bg-black/5 size-5 shrink-0 rounded-md', className)}
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
}

function TabListItem({ tab, isOverlay }: IProps) {
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
        // Normal: Clean, semi-transparent white that blends with the tinted group background
        !isOverlay &&
          'bg-white/50 border-white/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:bg-white/80 hover:border-white hover:shadow-[0_2px_6px_-1px_rgba(0,0,0,0.04)] cursor-default',
        // Active: Pure white, elevated with a crisp, soft shadow
        tab.active &&
          !isOverlay &&
          'bg-white border-white shadow-[0_4px_12px_-3px_rgba(0,0,0,0.08),0_2px_4px_-2px_rgba(0,0,0,0.04)] ring-1 ring-slate-200/50',
        isDragging && !isOverlay && 'opacity-30',
        // Dragging (Overlay): Highest elevation
        isOverlay &&
          'bg-white border-slate-200 shadow-2xl scale-[1.03] cursor-grabbing z-[1000]',
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
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-slate-900 rounded-full" />
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
          <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5 shadow-sm">
            <ZapOff size={7} className="text-slate-400" />
          </div>
        )}
      </div>

      <div className="ml-2.5 overflow-hidden pointer-events-none flex flex-col justify-center">
        <div className="w-full overflow-hidden" ref={textRef}>
          <div
            className={cn(
              'text-[11px] leading-tight transition-colors whitespace-nowrap marquee-target',
              {
                'font-bold text-slate-900 active-marquee':
                  tab.active && isOverflowing && !isOverlay,
                'text-slate-700': !tab.active || isOverlay,
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
            <span className="text-[9px] font-medium text-slate-400 truncate max-w-[100px]">
              {domain}
            </span>
          )}
          {domain && <span className="size-0.5 rounded-full bg-slate-300" />}
          <span className="text-[9px] text-slate-300 font-medium">
            {formatTimeAgo((tab as any).lastAccessed || (tab as any).lastOpened)}
          </span>
        </div>
      </div>

      {!isOverlay && (
        <div className="flex items-center gap-0.5 ml-1">
          <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5 bg-white/95 backdrop-blur-sm border border-black/5 shadow-sm rounded-lg p-0.5 animate-in fade-in zoom-in-95 duration-150">
            <ButtonIcon onClick={togglePin} title={tab.pinned ? 'Unpin tab' : 'Pin tab'}>
              {tab.pinned ? (
                <PinOff size={11} className="text-slate-600" />
              ) : (
                <Pin size={11} className="text-slate-600" />
              )}
            </ButtonIcon>
            <ButtonIcon onClick={handleReloadTab} title="Reload tab">
              <RefreshCw size={11} className="text-slate-600" />
            </ButtonIcon>
            <div className="w-px h-2.5 bg-black/5 mx-0.5" />
            <ButtonIcon
              onClick={handleCloseTab}
              title="Close tab"
              className="hover:bg-red-50 hover:text-red-600"
            >
              <X size={11} className="text-slate-600 group-hover:text-red-600" />
            </ButtonIcon>
          </div>
        </div>
      )}
    </div>
  )
}

export default TabListItem
