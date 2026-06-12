import { Info } from 'lucide-react'
import Tooltip from '@/components/ui/tooltip'

interface RulesStatusBarProps {
  rules: NStorage.Sync.Schema.AutoGroupRule[]
}

export function RulesStatusBar({ rules }: RulesStatusBarProps) {
  const totalCount = rules.length
  const activeCount = rules.filter((r) => r.isActive).length
  const pausedCount = totalCount - activeCount

  return (
    <section className="flex items-center justify-between gap-3 border-t p-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-[var(--sp-statusbar-border)] bg-[var(--sp-statusbar-bg)]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Rules Engine
          </p>
          <Tooltip>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full border text-[var(--text-muted)] transition-colors border-[var(--sp-card-border)] bg-[var(--surface)] hover:bg-[var(--sp-card-hover)]"
              >
                <Info size={12} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content
              side="top"
              sideOffset={8}
              className="max-w-56 rounded-xl px-3 py-2 text-[11px] shadow-lg bg-[var(--sp-tab-pill-active)] text-[var(--primary-foreground)]"
            >
              Rules are matched in order from top to bottom. Drag rule cards to prioritize.
            </Tooltip.Content>
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-1.5">
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold border-[var(--sp-card-border)] bg-[var(--surface)] text-[var(--text-secondary)]">
          {totalCount} rules
        </span>
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold border-[var(--sp-card-border)] bg-[var(--surface)] text-emerald-500">
          {activeCount} active
        </span>
        {pausedCount > 0 && (
          <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold border-[var(--sp-card-border)] bg-[var(--surface)] text-[var(--text-muted)]">
            {pausedCount} paused
          </span>
        )}
      </div>
    </section>
  )
}
