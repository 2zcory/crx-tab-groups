import React, { ReactNode } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

import TabListItem from '@/sidepanel/main-views/live/components/TabListItem'

interface BentoGroupCardProps {
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
  title,
  color,
  tabs,
  className,
  actions,
  collapsed,
  onToggleCollapsed,
  onCloseTabs
}) => {
  // Map Chrome colors to Tailwind colors
  const colorMap: Record<string, string> = {
    grey: 'bg-gray-100 border-gray-200',
    blue: 'bg-blue-50 border-blue-200',
    red: 'bg-red-50 border-red-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    green: 'bg-green-50 border-green-200',
    pink: 'bg-pink-50 border-pink-200',
    purple: 'bg-purple-50 border-purple-200',
    cyan: 'bg-cyan-50 border-cyan-200',
    orange: 'bg-orange-50 border-orange-200',
  }

  const cardStyle = color ? colorMap[color] : 'bg-white border-slate-200'

  return (
    <div className={cn(
      "p-3 rounded-2xl border transition-all hover:shadow-sm",
      cardStyle,
      className
    )}>
      <div className="flex items-center justify-between mb-2 px-1 gap-2">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            onToggleCollapsed && "cursor-pointer rounded-xl py-1 transition-colors hover:bg-white/40"
          )}
          role={onToggleCollapsed ? "button" : undefined}
          tabIndex={onToggleCollapsed ? 0 : undefined}
          aria-label={onToggleCollapsed ? `${collapsed ? "Expand" : "Collapse"} ${title}` : undefined}
          aria-expanded={onToggleCollapsed ? !collapsed : undefined}
          onClick={() => {
            onToggleCollapsed?.()
          }}
          onKeyDown={(event) => {
            if (!onToggleCollapsed) return
            if (event.key !== "Enter" && event.key !== " ") return
            event.preventDefault()
            onToggleCollapsed()
          }}
        >
          {onToggleCollapsed && (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-lg text-slate-500">
              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </span>
          )}
          <div className={cn("w-2.5 h-2.5 rounded-full", color ? `bg-${color}-500` : "bg-slate-400")} />
          <h3 className="font-semibold text-[13px] truncate max-w-[180px] text-slate-800">{title}</h3>
          <span className="text-[10px] bg-white/60 px-1.5 py-0.5 rounded-full border border-black/5 font-medium text-slate-600">
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
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-rose-100 bg-white/70 text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                onClick={(event) => {
                  onCloseTabs()
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="flex flex-col gap-1">
          {tabs.map((tab) => (
            <TabListItem
              key={tab.id}
              tab={tab}
            />
          ))}
        </div>
      )}
    </div>
  )
}
