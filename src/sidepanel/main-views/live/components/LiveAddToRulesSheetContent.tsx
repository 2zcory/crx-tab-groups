import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  AddToRulesDraft,
  AutoGroupScanStatus,
  COLOR_MAP,
  COLORS,
  NEW_RULE_DESTINATION_ID,
  getAddToRulesPatternSuggestions,
} from '../add-to-rules'

interface LiveAddToRulesSheetContentProps {
  draft: AddToRulesDraft
  autoGroupRules: NStorage.Sync.Schema.AutoGroupRule[]
  status: AutoGroupScanStatus
  onUpdateDraft: (patch: Partial<AddToRulesDraft>) => void
  onCancel: () => void
  onSubmit: () => void
}

export const LiveAddToRulesSheetContent = ({
  draft,
  autoGroupRules,
  status,
  onUpdateDraft,
  onCancel,
  onSubmit,
}: LiveAddToRulesSheetContentProps) => {
  const suggestions = getAddToRulesPatternSuggestions(draft)

  return (
    <div className="flex flex-col gap-4" data-live-surface="add-to-rules">
      <div className="min-w-0">
        <p className="sp-copy-primary truncate text-[12px] font-bold">
          {draft.tabTitle || draft.hostname}
        </p>
        <p className="sp-copy-muted mt-1 break-all text-[11px] [overflow-wrap:anywhere]">
          {draft.url}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="sp-label ml-1 text-[10px] font-bold uppercase">Pattern</label>
        <input
          data-bottom-sheet-autofocus
          className="sp-input-shell sp-input w-full rounded-xl border-none px-3 py-2 text-[12px] font-medium outline-none"
          value={draft.patternDraft}
          onChange={(event) => onUpdateDraft({ patternDraft: event.target.value })}
        />
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.value}
              type="button"
              className={cn(
                'rounded-full px-2 py-1 text-[10px] font-bold ring-1 transition-colors',
                draft.patternDraft === suggestion.value
                  ? 'bg-[var(--sp-tab-pill-active)] text-[var(--primary-foreground)] ring-[var(--sp-tab-pill-active)]'
                  : 'sp-chip hover:bg-[var(--surface-muted)]',
              )}
              onClick={() => onUpdateDraft({ patternDraft: suggestion.value })}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="sp-label ml-1 text-[10px] font-bold uppercase">Destination</label>
        <select
          className="sp-input-shell sp-input w-full rounded-xl border-none px-3 py-2 text-[12px] font-bold outline-none"
          value={draft.destinationRuleId}
          onChange={(event) => onUpdateDraft({ destinationRuleId: event.target.value })}
        >
          <option value={NEW_RULE_DESTINATION_ID}>Create new rule</option>
          {autoGroupRules.map((rule) => (
            <option key={rule.id} value={rule.id}>
              {rule.title} - priority {rule.order}
            </option>
          ))}
        </select>
      </div>

      {draft.destinationRuleId === NEW_RULE_DESTINATION_ID && (
        <div className="sp-subtle-surface flex flex-col gap-2 rounded-xl p-2">
          <input
            className="sp-input-shell sp-input w-full rounded-lg border-none px-2.5 py-2 text-[12px] font-bold outline-none"
            value={draft.newRuleTitle}
            onChange={(event) => onUpdateDraft({ newRuleTitle: event.target.value })}
            placeholder="New rule title"
          />
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={cn(
                  'size-4 rounded-full transition-transform hover:scale-110',
                  COLOR_MAP[color],
                  draft.newRuleColor === color &&
                    'scale-110 ring-2 ring-[var(--sp-tab-pill-active)] ring-offset-1',
                )}
                onClick={() => onUpdateDraft({ newRuleColor: color })}
              />
            ))}
          </div>
        </div>
      )}

      {status.message && (
        <div
          className={cn(
            'rounded-xl border px-3 py-2 text-[11px] font-bold leading-4',
            status.tone === 'success' && 'border-emerald-200 bg-emerald-50/95 text-emerald-700',
            status.tone === 'warning' && 'border-amber-200 bg-amber-50/95 text-amber-700',
            status.tone === 'error' && 'border-rose-200 bg-rose-50/95 text-rose-700',
            status.tone === 'idle' &&
              'border-[var(--sp-card-border)] bg-[color:color-mix(in_srgb,var(--surface-muted)_94%,transparent)] text-[var(--text-secondary)]',
          )}
          role="status"
          aria-live="polite"
        >
          {status.message}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          className="sp-secondary-action h-8 flex-1 rounded-xl text-[11px] font-bold shadow-none"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="sp-primary-action h-8 flex-1 rounded-xl text-[11px] font-bold"
          onClick={onSubmit}
        >
          Add Pattern
        </Button>
      </div>
    </div>
  )
}
