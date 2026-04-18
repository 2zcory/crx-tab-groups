import React from 'react'
import { cn } from '@/lib/utils'

import TabListItem from '@/sidepanel/main-views/live/components/TabListItem'

interface BentoGroupCardProps {
  title: string
  color?: string
  tabs: chrome.tabs.Tab[]
  className?: string
}

export const BentoGroupCard: React.FC<BentoGroupCardProps> = ({
  title,
  color,
  tabs,
  className
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
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <div className={cn("w-2.5 h-2.5 rounded-full", color ? `bg-${color}-500` : "bg-slate-400")} />
          <h3 className="font-semibold text-[13px] truncate max-w-[180px] text-slate-800">{title}</h3>
          <span className="text-[10px] bg-white/60 px-1.5 py-0.5 rounded-full border border-black/5 font-medium text-slate-600">
            {tabs.length}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {tabs.map((tab) => (
          <TabListItem 
            key={tab.id} 
            tab={tab} 
          />
        ))}
      </div>
    </div>
  )
}
