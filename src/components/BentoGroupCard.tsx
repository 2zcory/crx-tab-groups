import React, { ReactNode } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

import TabListItem from '@/sidepanel/main-views/live/components/TabListItem'
import { useDroppable } from '@dnd-kit/core'

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
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  })

  // Map Chrome colors to Tailwind colors
  const colorMap: Record<string, string> = {
    grey: 'bg-gray-100/50 border-gray-200',
    blue: 'bg-blue-50/50 border-blue-200',
    red: 'bg-red-50/50 border-red-200',
    yellow: 'bg-yellow-50/50 border-yellow-200',
    green: 'bg-green-50/50 border-green-200',
    pink: 'bg-pink-50/50 border-pink-200',
    purple: 'bg-purple-50/50 border-purple-200',
    cyan: 'bg-cyan-50/50 border-cyan-200',
    orange: 'bg-orange-50/50 border-orange-200',
  }

  const cardStyle = color ? colorMap[color] : 'bg-white border-slate-200'

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'p-2.5 rounded-2xl border transition-all duration-300',
        cardStyle,
        isOver && 'ring-2 ring-slate-400 ring-offset-2 scale-[1.01] bg-white shadow-md',
        className,
      )}
    >
      <div className="flex items-center justify-between mb-1.5 px-1 gap-2">
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2',
            onToggleCollapsed &&
              'cursor-pointer rounded-xl py-1 transition-colors hover:bg-white/40',
          )}
          role={onToggleCollapsed ? 'button' : undefined}
          tabIndex={onToggleCollapsed ? 0 : undefined}
          aria-label={
            onToggleCollapsed ? `${collapsed ? 'Expand' : 'Collapse'} ${title}` : undefined
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
            <span className="flex size-4 shrink-0 items-center justify-center rounded-lg text-slate-500">
              {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </span>
          )}
          <div className={cn('w-2 h-2 rounded-full', color ? `bg-${color}-500` : 'bg-slate-400')} />
          <h3 className="font-bold text-[12px] truncate max-w-[180px] text-slate-800 uppercase tracking-tight">
            {title}
          </h3>
          <span className="text-[9px] bg-white/60 px-1.5 py-0.5 rounded-full border border-black/5 font-bold text-slate-500">
            {tabs.length}
          </span>
        </div>

        {(actions || onCloseTabs) && (
          <div className="flex items-center gap-1">
            {actions}
            {onCloseTabs && (
              <button
                type="button"
                aria-label={`Close all tabs in ${title}`}
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-rose-100 bg-white/70 text-rose-500 transition-colors hover:bg-rose-500 hover:text-white"
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
            isOver && 'bg-slate-100/50 outline-2 outline-dashed outline-slate-300',
          )}
        >
          {tabs.map((tab) => (
            <TabListItem key={tab.id} tab={tab} />
          ))}
          {tabs.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-4 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
                Drop tabs here
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
