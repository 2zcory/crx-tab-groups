import React, { ReactNode } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

import TabListItem from '@/sidepanel/main-views/live/components/TabListItem'
import { useDroppable } from '@dnd-kit/core'
import { useTranslation } from '@/hooks/useTranslation'

interface BentoGroupCardProps {
  id: string
  title: string
  color?: string
  tabs: chrome.tabs.Tab[]
  className?: string
  actions?: ReactNode
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onCloseTabs?: () => void
  onAddTabToRules?: (
    tab: chrome.tabs.Tab,
    sourceGroup?: { title?: string; color?: NStorage.Sync.GroupColor },
  ) => void
}

export const BentoGroupCard: React.FC<BentoGroupCardProps> = ({
  id,
  title,
  color,
  tabs,
  className,
  actions,
  collapsed,
  onToggleCollapsed,
  onCloseTabs,
  onAddTabToRules,
}) => {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  })

  const colorMap: Record<string, string> = {
    grey: 'bg-slate-100/55 border-slate-200/70 dark:bg-slate-800/55 dark:border-slate-700/80',
    blue: 'bg-blue-50/55 border-blue-200/80 dark:bg-blue-950/25 dark:border-blue-900/60',
    red: 'bg-red-50/55 border-red-200/80 dark:bg-red-950/20 dark:border-red-900/55',
    yellow: 'bg-amber-50/60 border-amber-200/80 dark:bg-amber-950/20 dark:border-amber-900/55',
    green:
      'bg-emerald-50/55 border-emerald-200/80 dark:bg-emerald-950/20 dark:border-emerald-900/55',
    pink: 'bg-pink-50/55 border-pink-200/80 dark:bg-pink-950/20 dark:border-pink-900/55',
    purple: 'bg-violet-50/55 border-violet-200/80 dark:bg-violet-950/20 dark:border-violet-900/55',
    cyan: 'bg-cyan-50/55 border-cyan-200/80 dark:bg-cyan-950/20 dark:border-cyan-900/60',
    orange: 'bg-orange-50/55 border-orange-200/80 dark:bg-orange-950/20 dark:border-orange-900/55',
  }

  const cardStyle = color ? colorMap[color] : 'sp-card'

  return (
    <div
      id={id}
      ref={setNodeRef}
      className={cn(
        'p-2.5 rounded-2xl border transition-all duration-300 hover:shadow-md hover:translate-y-[-0.5px]',
        cardStyle,
        !color && 'sp-card-hover',
        isOver &&
          'scale-[1.02] bg-[var(--surface-elevated)] shadow-lg border-[var(--sp-tab-pill-active)] ring-4 ring-[var(--sp-tab-pill-active)]/10',
        className,
      )}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2 px-1">
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2',
            onToggleCollapsed &&
              'cursor-pointer rounded-xl py-1 transition-colors hover:bg-[var(--surface-elevated)]',
          )}
          role={onToggleCollapsed ? 'button' : undefined}
          tabIndex={onToggleCollapsed ? 0 : undefined}
          aria-label={
            onToggleCollapsed ? (collapsed ? t('ariaExpandGroup', { title }) : t('ariaCollapseGroup', { title })) : undefined
          }
          aria-expanded={onToggleCollapsed ? !collapsed : undefined}
          onClick={() => onToggleCollapsed?.()}
          onKeyDown={(event) => {
            if (!onToggleCollapsed) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onToggleCollapsed()
          }}
        >
          {onToggleCollapsed && (
            <span className="sp-copy-muted flex size-4 shrink-0 items-center justify-center rounded-lg">
              {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </span>
          )}
          <div
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              color ? `bg-${color}-500` : 'bg-slate-400',
            )}
          />
          <h3 className="sp-copy-primary min-w-0 flex-1 truncate font-bold text-[13px] tracking-tight">
            {title}
          </h3>
          <span className="sp-chip shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold">
            {tabs.length}
          </span>
        </div>

        {(actions || onCloseTabs) && (
          <div className="flex shrink-0 items-center gap-1 self-start">
            {actions}
            {onCloseTabs && (
              <button
                type="button"
                aria-label={t('ariaCloseAllTabs', { title })}
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-rose-200/70 bg-[var(--surface-elevated)] text-rose-500 transition-all duration-200 hover:bg-rose-500 hover:text-white hover:scale-105 active:scale-95"
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseTabs()
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <div
          className={cn(
            'flex flex-col gap-1 min-h-[40px] transition-all rounded-xl p-1',
            isOver &&
              'bg-[color-mix(in_srgb,var(--sp-tab-pill-active)_5%,var(--surface-muted))] outline-2 outline-dashed outline-[var(--sp-tab-pill-active)]',
          )}
        >
          {tabs.map((tab) => (
            <TabListItem
              key={tab.id}
              tab={tab}
              onAddTabToRules={
                onAddTabToRules
                  ? () =>
                      onAddTabToRules(tab, {
                        title,
                        color: color as NStorage.Sync.GroupColor | undefined,
                      })
                  : undefined
              }
            />
          ))}
          {tabs.length === 0 && (
            <div className="sp-empty-state flex-1 flex items-center justify-center py-4 rounded-lg">
              <p className="text-[10px] font-medium uppercase tracking-widest">{t('dropTabsHere')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
