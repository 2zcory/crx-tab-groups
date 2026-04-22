import { Info, Sparkles } from 'lucide-react'
import Tooltip from '@/components/ui/tooltip'
import { useLiveBrowserState } from '@/hooks/useLiveBrowserState'

export function LiveStatusBar() {
  const { windows, totalTabsCount } = useLiveBrowserState()

  const runAutoGroupScan = () => {
    chrome.runtime.sendMessage({ action: 'run_auto_group_scan' })
  }

  return (
    <section className="flex items-center justify-between gap-3 border-t border-slate-100 bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Live Browser
          </p>
          <Tooltip>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full border border-black/5 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100"
              >
                <Info size={12} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content
              side="top"
              sideOffset={8}
              className="max-w-56 rounded-xl bg-slate-900 px-3 py-2 text-[11px] text-slate-50 shadow-lg"
            >
              Manage tabs and groups across all open windows.
            </Tooltip.Content>
          </Tooltip>

          <Tooltip>
            <Tooltip.Trigger asChild>
              <button
                onClick={runAutoGroupScan}
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100"
              >
                <Sparkles size={11} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content
              side="top"
              sideOffset={8}
              className="rounded-xl bg-slate-900 px-3 py-2 text-[11px] text-white shadow-lg"
            >
              Apply Auto-Group Rules Across Browser
            </Tooltip.Content>
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-1.5">
        <span className="rounded-full border border-black/5 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
          {totalTabsCount} tabs
        </span>
        <span className="rounded-full border border-black/5 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
          {windows.length} windows
        </span>
      </div>
    </section>
  )
}
