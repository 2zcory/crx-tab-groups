import { Button } from '@/components/ui/button'
import {
  describeRulePattern,
  getAutoGroupRulePatterns,
  normalizeAutoGroupPattern,
  sortAutoGroupRules,
  validateAutoGroupRulePattern,
} from '@/helpers'
import { cn } from '@/lib/utils'
import StorageSyncAutoGroup from '@/storage/autoGroup.sync'
import {
  Plus,
  Trash2,
  X,
  Play,
  Pause,
  Globe,
  Pencil,
  Check,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Bug,
  RefreshCw,
  Eraser,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import Tooltip from '@/components/ui/tooltip'

const COLORS: NStorage.Sync.GroupColor[] = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
]

const COLOR_MAP: Record<string, string> = {
  grey: 'bg-slate-400',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  pink: 'bg-pink-500',
  purple: 'bg-purple-500',
  cyan: 'bg-cyan-500',
  orange: 'bg-orange-500',
}

function AutomationManagement() {
  const [rules, setRules] = useState<NStorage.Sync.Schema.AutoGroupRule[]>([])
  const [ownershipEntries, setOwnershipEntries] = useState<
    NStorage.Local.AutoGroupOwnershipEntry[]
  >([])
  const [auditEntries, setAuditEntries] = useState<NStorage.Local.AutoGroupAuditEntry[]>([])
  const [showDebugState, setShowDebugState] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [newRule, setNewRule] = useState({
    title: '',
    color: 'blue' as NStorage.Sync.GroupColor,
    patternDraft: '',
    urlPatterns: [] as string[],
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [editingPatternDraft, setEditingPatternDraft] = useState('')
  const [editingPatterns, setEditingPatterns] = useState<string[]>([])

  const triggerAutoGroupScan = () => {
    chrome.runtime.sendMessage({ action: 'run_auto_group_scan' })
  }

  useEffect(() => {
    fetchRules()
    void fetchDebugState()

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: chrome.storage.AreaName,
    ) => {
      if (areaName === 'local' && (changes.autoGroupOwnership || changes.autoGroupAudit)) {
        void fetchDebugState()
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  const fetchRules = async () => {
    const data = await StorageSyncAutoGroup.getList()
    setRules(sortAutoGroupRules(data))
  }

  const fetchDebugState = async () => {
    return await new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ action: 'get_auto_group_debug_state' }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          resolve()
          return
        }

        setOwnershipEntries((response.ownership || []) as NStorage.Local.AutoGroupOwnershipEntry[])
        setAuditEntries((response.audit || []) as NStorage.Local.AutoGroupAuditEntry[])
        resolve()
      })
    })
  }

  const clearAuditEntries = async () => {
    await new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ action: 'clear_auto_group_audit' }, () => resolve())
    })

    await fetchDebugState()
  }

  const handleAddRule = async () => {
    const title = newRule.title.trim()
    const normalizedPatterns = Array.from(
      new Set(
        newRule.urlPatterns.map((pattern) => normalizeAutoGroupPattern(pattern)).filter(Boolean),
      ),
    )

    if (!title) {
      setFormError('Group title is required.')
      return
    }

    if (normalizedPatterns.length === 0) {
      setFormError('At least one pattern is required.')
      return
    }

    for (const pattern of normalizedPatterns) {
      const validation = validateAutoGroupRulePattern(pattern)
      if (!validation.isValid) {
        setFormError(validation.error || 'Pattern is invalid.')
        return
      }
    }

    const duplicateExactRule = rules.some((rule) => {
      const existingPatterns = getAutoGroupRulePatterns(rule).map((pattern) =>
        pattern.toLowerCase(),
      )
      return (
        rule.title.trim().toLowerCase() === title.toLowerCase() &&
        existingPatterns.length === normalizedPatterns.length &&
        existingPatterns.every(
          (pattern, index) =>
            pattern === normalizedPatterns.map((item) => item.toLowerCase())[index],
        )
      )
    })

    if (duplicateExactRule) {
      setFormError('An identical rule already exists.')
      return
    }

    const conflictingGroupIdentity = rules.some(
      (rule) =>
        rule.title.trim().toLowerCase() === title.toLowerCase() && rule.color !== newRule.color,
    )

    if (conflictingGroupIdentity) {
      setFormError('Rules with the same title should use the same color.')
      return
    }

    const rule: NStorage.Sync.Schema.AutoGroupRule = {
      id: crypto.randomUUID(),
      title,
      color: newRule.color,
      order: rules.length + 1,
      urlPatterns: normalizedPatterns,
      isActive: true,
      createdAt: new Date().toISOString(),
    }

    await StorageSyncAutoGroup.create(rule)
    triggerAutoGroupScan()
    setIsAdding(false)
    setNewRule({ title: '', color: 'blue', patternDraft: '', urlPatterns: [] })
    setFormError(null)
    void fetchRules()
  }

  const toggleRule = async (rule: NStorage.Sync.Schema.AutoGroupRule) => {
    await StorageSyncAutoGroup.update({ ...rule, isActive: !rule.isActive })
    void fetchRules()
  }

  const deleteRule = async (id: string) => {
    await StorageSyncAutoGroup.deleteById(id)
    void fetchRules()
  }

  const moveRule = async (ruleId: string, direction: 'up' | 'down') => {
    const currentIndex = rules.findIndex((rule) => rule.id === ruleId)

    if (currentIndex === -1) return

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

    if (targetIndex < 0 || targetIndex >= rules.length) return

    const nextRules = [...rules]
    const [movedRule] = nextRules.splice(currentIndex, 1)
    nextRules.splice(targetIndex, 0, movedRule)

    const orderedRules = nextRules.map((rule, index) => ({
      ...rule,
      order: index + 1,
    }))

    await StorageSyncAutoGroup.replaceAll(orderedRules)
    setRules(orderedRules)
    triggerAutoGroupScan()
  }

  const moveRuleToEdge = async (ruleId: string, edge: 'top' | 'bottom') => {
    const currentIndex = rules.findIndex((rule) => rule.id === ruleId)

    if (currentIndex === -1) return

    const nextRules = [...rules]
    const [movedRule] = nextRules.splice(currentIndex, 1)

    if (edge === 'top') {
      nextRules.unshift(movedRule)
    } else {
      nextRules.push(movedRule)
    }

    const orderedRules = nextRules.map((rule, index) => ({
      ...rule,
      order: index + 1,
    }))

    await StorageSyncAutoGroup.replaceAll(orderedRules)
    setRules(orderedRules)
    triggerAutoGroupScan()
  }

  const startPatternEditing = (rule: NStorage.Sync.Schema.AutoGroupRule) => {
    setEditingRuleId(rule.id)
    setEditingPatternDraft('')
    setEditingPatterns(getAutoGroupRulePatterns(rule))
  }

  const cancelPatternEditing = () => {
    setEditingRuleId(null)
    setEditingPatternDraft('')
    setEditingPatterns([])
  }

  const addPatternToDraftList = () => {
    const validation = validateAutoGroupRulePattern(editingPatternDraft)
    if (!validation.isValid) {
      setFormError(validation.error || 'Pattern is invalid.')
      return
    }

    const duplicate = editingPatterns.some(
      (pattern) => pattern.toLowerCase() === validation.normalizedPattern.toLowerCase(),
    )
    if (duplicate) {
      setFormError('Pattern already exists in this rule.')
      return
    }

    setEditingPatterns((current) => [...current, validation.normalizedPattern])
    setEditingPatternDraft('')
    setFormError(null)
  }

  const removePatternFromDraftList = (patternToRemove: string) => {
    setEditingPatterns((current) => current.filter((pattern) => pattern !== patternToRemove))
  }

  const saveEditedPatterns = async (rule: NStorage.Sync.Schema.AutoGroupRule) => {
    const normalizedPatterns = Array.from(
      new Set(editingPatterns.map((pattern) => normalizeAutoGroupPattern(pattern)).filter(Boolean)),
    )

    if (normalizedPatterns.length === 0) {
      setFormError('At least one pattern is required.')
      return
    }

    await StorageSyncAutoGroup.update({
      ...rule,
      urlPatterns: normalizedPatterns,
    })

    triggerAutoGroupScan()

    cancelPatternEditing()
    setFormError(null)
    void fetchRules()
  }

  const patternDraftValidation = validateAutoGroupRulePattern(newRule.patternDraft)
  const patternKind = describeRulePattern(newRule.patternDraft)

  return (
    <div className="flex flex-col gap-4 p-2 pb-6">
      <section className="sp-card flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5">
        <div>
          <p className="sp-label text-[11px] font-bold uppercase tracking-[0.18em]">
            Auto-Grouping Rules
          </p>
        </div>
        <Button
          size="sm"
          className="sp-primary-action h-7 rounded-full px-3 text-[10px] font-bold"
          onClick={() => {
            setFormError(null)
            setIsAdding(true)
          }}
        >
          <Plus size={12} className="mr-1" /> New Rule
        </Button>
      </section>

      <section className="sp-card rounded-2xl">
        <button
          type="button"
          onClick={() => setShowDebugState((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="sp-chip-muted inline-flex size-6 items-center justify-center rounded-full">
              <Bug size={12} />
            </span>
            <div>
              <p className="sp-label text-[11px] font-bold uppercase tracking-[0.18em]">
                Rules Debug State
              </p>
              <p className="sp-copy-muted text-[11px]">
                {ownershipEntries.length} ownership hints, {auditEntries.length} recent audit events
              </p>
            </div>
          </div>
          <span className="sp-copy-muted text-[10px] font-bold uppercase tracking-wider">
            {showDebugState ? 'Hide' : 'Show'}
          </span>
        </button>

        {showDebugState && (
          <div className="flex flex-col gap-3 border-t border-[var(--sp-footer-border)] px-3 py-3">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="sp-secondary-action inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold"
                onClick={() => void fetchDebugState()}
              >
                <RefreshCw size={10} />
                Refresh
              </button>
              <button
                type="button"
                className="sp-danger-action inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold"
                onClick={() => void clearAuditEntries()}
              >
                <Eraser size={10} />
                Clear Audit
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <p className="sp-label text-[10px] font-bold uppercase tracking-wider">
                Ownership
              </p>
              {ownershipEntries.length === 0 ? (
                <div className="sp-outline-dashed sp-copy-muted rounded-xl px-3 py-3 text-[11px]">
                  No persisted ownership hints yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {ownershipEntries.map((entry) => (
                    <div
                      key={`${entry.windowId}-${entry.ruleId}`}
                      className="sp-subtle-surface rounded-xl px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn('size-2 rounded-full', COLOR_MAP[entry.color])} />
                        <span className="sp-copy-primary text-[11px] font-bold">{entry.title}</span>
                        <span className="sp-chip rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                          window {entry.windowId}
                        </span>
                        <span className="sp-chip rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                          group {entry.groupId}
                        </span>
                      </div>
                      <p className="sp-copy-muted mt-1 text-[10px]">
                        rule {entry.ruleId} • updated {new Date(entry.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="sp-label text-[10px] font-bold uppercase tracking-wider">
                Recent Audit
              </p>
              {auditEntries.length === 0 ? (
                <div className="sp-outline-dashed sp-copy-muted rounded-xl px-3 py-3 text-[11px]">
                  No audit events yet.
                </div>
              ) : (
                <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
                  {auditEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="sp-soft-surface rounded-xl px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="sp-chip-muted rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                          {entry.outcome}
                        </span>
                        {entry.ruleTitle && (
                          <span className="sp-copy-primary text-[11px] font-bold">
                            {entry.ruleTitle}
                          </span>
                        )}
                        <span className="sp-copy-muted text-[10px]">
                          {new Date(entry.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="sp-copy-secondary mt-1 text-[11px]">{entry.reason}</p>
                      <div className="sp-copy-muted mt-1 flex flex-wrap gap-1.5 text-[10px]">
                        {entry.matchedPattern && <span>pattern: {entry.matchedPattern}</span>}
                        {typeof entry.windowId === 'number' && (
                          <span>window: {entry.windowId}</span>
                        )}
                        {typeof entry.groupId === 'number' && <span>group: {entry.groupId}</span>}
                        {typeof entry.tabId === 'number' && <span>tab: {entry.tabId}</span>}
                      </div>
                      {entry.url && (
                        <p className="sp-copy-muted mt-1 truncate text-[10px]">{entry.url}</p>
                      )}
                      {entry.message && (
                        <p className="mt-1 text-[10px] text-rose-500">{entry.message}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {isAdding && (
        <div className="sp-card flex flex-col gap-3 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <h3 className="sp-label text-xs font-bold uppercase tracking-wider">
              Create New Rule
            </h3>
            <button
              onClick={() => {
                setIsAdding(false)
                setFormError(null)
              }}
              className="sp-icon-button"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="sp-label ml-1 text-[10px] font-bold uppercase">
                Group Identity
              </label>
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  placeholder="Group Title (e.g. Work)"
                  className="sp-input-shell sp-input flex-1 rounded-xl border-none px-3 py-2 text-xs font-medium outline-none"
                  value={newRule.title}
                  onChange={(e) => setNewRule({ ...newRule, title: e.target.value })}
                />
                <div className="flex flex-wrap gap-1 max-w-[120px]">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className={cn(
                        'size-4 rounded-full transition-transform hover:scale-110',
                        COLOR_MAP[c],
                        newRule.color === c &&
                          'ring-2 ring-[var(--sp-tab-pill-active)] ring-offset-1 scale-110',
                      )}
                      onClick={() => setNewRule({ ...newRule, color: c })}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="sp-label ml-1 text-[10px] font-bold uppercase">
                URL Pattern
              </label>
              <div className="flex items-center gap-2">
                <div className="sp-input-shell flex flex-1 items-center gap-2 rounded-xl px-3 py-2">
                  <Globe size={12} className="sp-copy-muted" />
                  <input
                    placeholder="e.g. youtube.com"
                    className="sp-input w-full border-none bg-transparent text-xs font-medium outline-none"
                    value={newRule.patternDraft}
                    onChange={(e) => setNewRule({ ...newRule, patternDraft: e.target.value })}
                  />
                  <button
                    type="button"
                    className="sp-primary-action rounded-lg px-2 py-1 text-[10px] font-bold"
                    onClick={() => {
                      const validation = validateAutoGroupRulePattern(newRule.patternDraft)
                      if (!validation.isValid) {
                        setFormError(validation.error || 'Pattern is invalid.')
                        return
                      }

                      const duplicate = newRule.urlPatterns.some(
                        (pattern) =>
                          pattern.toLowerCase() === validation.normalizedPattern.toLowerCase(),
                      )
                      if (duplicate) {
                        setFormError('Pattern already exists in this rule.')
                        return
                      }

                      setNewRule((current) => ({
                        ...current,
                        patternDraft: '',
                        urlPatterns: [...current.urlPatterns, validation.normalizedPattern],
                      }))
                      setFormError(null)
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
              <p className="sp-copy-muted ml-1 text-[10px]">
                Plain host matches subdomains. Use <code className="font-mono">*</code> for glob or{' '}
                <code className="font-mono">re:</code> for explicit regex.
              </p>
              <div className="ml-1 flex items-center gap-2">
                <span className="sp-chip-muted rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  {patternKind}
                </span>
                {!patternDraftValidation.isValid && newRule.patternDraft.trim() && (
                  <span className="text-[10px] font-medium text-rose-500">
                    {patternDraftValidation.error}
                  </span>
                )}
              </div>
              {newRule.urlPatterns.length > 0 && (
                <div className="ml-1 flex flex-wrap gap-1.5">
                  {newRule.urlPatterns.map((pattern) => (
                    <span
                      key={pattern}
                      className="sp-chip inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
                    >
                      <span>{pattern}</span>
                      <button
                        type="button"
                        className="sp-copy-muted hover:text-rose-500"
                        onClick={() =>
                          setNewRule((current) => ({
                            ...current,
                            urlPatterns: current.urlPatterns.filter((item) => item !== pattern),
                          }))
                        }
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="sp-copy-muted ml-1 text-[10px]">
                New rules start at the lowest priority. Higher priority rules win first when
                patterns overlap.
              </p>
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-600">
                {formError}
              </div>
            )}

            <Button
              className="mt-1 w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              onClick={handleAddRule}
            >
              Add Rule
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {rules.length === 0 && !isAdding && (
          <div className="sp-outline-dashed rounded-2xl py-12 text-center">
            <p className="sp-copy-muted text-xs font-medium">No automation rules yet.</p>
          </div>
        )}

        {rules.map((rule) => (
          <div
            key={rule.id}
            className={cn(
              'group relative flex flex-col gap-3 rounded-2xl border p-3 transition-all',
              rule.isActive ? 'sp-card sp-card-hover' : 'sp-subtle-surface opacity-70',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={cn('size-2.5 rounded-full shadow-sm', COLOR_MAP[rule.color])} />
                <h3 className="sp-copy-primary text-[13px] font-bold">{rule.title}</h3>
                {!rule.isActive && (
                  <span className="sp-chip-muted rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase">
                    Paused
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Tooltip>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => void moveRuleToEdge(rule.id, 'top')}
                      disabled={rule.order <= 1}
                      className="sp-icon-button flex size-7 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronsUp size={12} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">
                    Move To Top
                  </Tooltip.Content>
                </Tooltip>
                <Tooltip>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => void moveRule(rule.id, 'up')}
                      disabled={rule.order <= 1}
                      className="sp-icon-button flex size-7 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowUp size={12} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">
                    Move Up
                  </Tooltip.Content>
                </Tooltip>
                <Tooltip>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => void moveRule(rule.id, 'down')}
                      disabled={rule.order >= rules.length}
                      className="sp-icon-button flex size-7 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">
                    Move Down
                  </Tooltip.Content>
                </Tooltip>
                <Tooltip>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => void moveRuleToEdge(rule.id, 'bottom')}
                      disabled={rule.order >= rules.length}
                      className="sp-icon-button flex size-7 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronsDown size={12} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">
                    Move To Bottom
                  </Tooltip.Content>
                </Tooltip>
                <Tooltip>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => startPatternEditing(rule)}
                      className="sp-icon-button flex size-7 items-center justify-center rounded-full"
                    >
                      <Pencil size={12} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">
                    Edit Patterns
                  </Tooltip.Content>
                </Tooltip>
                <Tooltip>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => toggleRule(rule)}
                      className={cn(
                        'flex size-7 items-center justify-center rounded-full transition-colors',
                        rule.isActive
                          ? 'text-amber-500 hover:bg-amber-50'
                          : 'text-emerald-500 hover:bg-emerald-50',
                      )}
                    >
                      {rule.isActive ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">
                    {rule.isActive ? 'Pause Rule' : 'Resume Rule'}
                  </Tooltip.Content>
                </Tooltip>

                <Tooltip>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="flex size-7 items-center justify-center rounded-full text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={12} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">
                    Delete
                  </Tooltip.Content>
                </Tooltip>
              </div>
            </div>

            <div className="sp-subtle-surface flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-2">
              <span className="sp-chip-muted rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider">
                {rule.order === 1 ? 'Highest Priority' : `Priority ${rule.order}`}
              </span>
              {getAutoGroupRulePatterns(rule).map((pattern) => (
                <div
                  key={pattern}
                  className="sp-chip inline-flex items-center gap-1 rounded-full px-2 py-1"
                >
                  <Globe size={10} className="sp-copy-muted" />
                  <code className="sp-copy-secondary text-[10px] font-medium">{pattern}</code>
                  <span className="sp-chip-muted shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                    {describeRulePattern(pattern)}
                  </span>
                </div>
              ))}
            </div>

            {editingRuleId === rule.id && (
              <div className="sp-subtle-surface flex flex-col gap-2 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="sp-label text-[10px] font-bold uppercase tracking-wider">
                    Manage Patterns
                  </p>
                  <button
                    type="button"
                    className="sp-icon-button"
                    onClick={cancelPatternEditing}
                  >
                    <X size={12} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="sp-input-shell flex flex-1 items-center gap-2 rounded-xl px-3 py-2">
                    <Globe size={12} className="sp-copy-muted" />
                    <input
                      placeholder="Add another pattern"
                      className="sp-input w-full border-none bg-transparent text-xs font-medium outline-none"
                      value={editingPatternDraft}
                      onChange={(e) => setEditingPatternDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addPatternToDraftList()
                        }
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="sp-primary-action rounded-lg px-2 py-2 text-[10px] font-bold"
                    onClick={addPatternToDraftList}
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {editingPatterns.map((pattern) => (
                    <span
                      key={pattern}
                      className="sp-chip inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
                    >
                      <span>{pattern}</span>
                      <button
                        type="button"
                        className="sp-copy-muted hover:text-rose-500"
                        onClick={() => removePatternFromDraftList(pattern)}
                      >
                        <Trash2 size={10} />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="sp-secondary-action rounded-lg px-3 py-1.5 text-[10px] font-bold"
                    onClick={cancelPatternEditing}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white"
                    onClick={() => void saveEditedPatterns(rule)}
                  >
                    <Check size={10} />
                    Save Patterns
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default AutomationManagement
