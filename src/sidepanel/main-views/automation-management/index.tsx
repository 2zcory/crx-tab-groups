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
  Bug,
  RefreshCw,
  Eraser,
  ChevronRight,
  ArrowUpWideNarrow,
  GripVertical,
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import Tooltip from '@/components/ui/tooltip'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'

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

const RULE_CARD_TINT_MAP: Record<
  NStorage.Sync.GroupColor,
  { accent: string; border: string }
> = {
  grey: { accent: 'rgb(148 163 184)', border: 'rgba(148, 163, 184, 0.3)' },
  blue: { accent: 'rgb(59 130 246)', border: 'rgba(59, 130, 246, 0.3)' },
  red: { accent: 'rgb(239 68 68)', border: 'rgba(239, 68, 68, 0.3)' },
  yellow: { accent: 'rgb(234 179 8)', border: 'rgba(234, 179, 8, 0.3)' },
  green: { accent: 'rgb(34 197 94)', border: 'rgba(34, 197, 94, 0.3)' },
  pink: { accent: 'rgb(236 72 153)', border: 'rgba(236, 72, 153, 0.3)' },
  purple: { accent: 'rgb(168 85 247)', border: 'rgba(168, 85, 247, 0.3)' },
  cyan: { accent: 'rgb(6 182 212)', border: 'rgba(6, 182, 212, 0.3)' },
  orange: { accent: 'rgb(249 115 22)', border: 'rgba(249, 115, 22, 0.3)' },
}

interface DebugState {
  ownership: {
    ruleId: string
    windowId: number
    groupId: number
    title: string
    color: string
    updatedAt: string
  }[]
  audit: {
    id: string
    createdAt: string
    ruleId?: string
    ruleTitle?: string
    tabId: number
    windowId: number
    url?: string
    outcome: 'grouped' | 'already_grouped' | 'no_match' | 'ignored' | 'error'
    reason: string
    groupId?: number
    matchedPattern?: string
    message?: string
  }[]
}

// --- Shared UI Component for Rule Card ---
interface RuleCardUIProps {
  rule: NStorage.Sync.Schema.AutoGroupRule
  isExpanded: boolean
  setIsExpanded: (val: boolean) => void
  isEditing: boolean
  editingTitle: string
  setEditingTitle: (val: string) => void
  editingColor: NStorage.Sync.GroupColor
  setEditingColor: (val: NStorage.Sync.GroupColor) => void
  editingPatternDraft: string
  setEditingPatternDraft: (val: string) => void
  addPattern: () => void
  updatePattern: (index: number, val: string) => void
  removePattern: (index: number) => void
  saveChanges: (rule: NStorage.Sync.Schema.AutoGroupRule) => void
  cancelEdit: () => void
  editingPatterns: string[]
  onEdit: (rule: NStorage.Sync.Schema.AutoGroupRule) => void
  onToggle: (rule: NStorage.Sync.Schema.AutoGroupRule) => void
  onDelete: (id: string) => void
  isDragging?: boolean
  isOverlay?: boolean
  dragAttributes?: any
  dragListeners?: any
  style?: CSSProperties
}

function RuleCardUI({
  rule,
  isExpanded,
  setIsExpanded,
  isEditing,
  editingTitle,
  setEditingTitle,
  editingColor,
  setEditingColor,
  editingPatternDraft,
  setEditingPatternDraft,
  addPattern,
  updatePattern,
  removePattern,
  saveChanges,
  cancelEdit,
  editingPatterns,
  onEdit,
  onToggle,
  onDelete,
  isDragging,
  isOverlay,
  dragAttributes,
  dragListeners,
  style,
}: RuleCardUIProps) {
  const effectiveExpanded = isExpanded || isEditing
  const rulePatterns = getAutoGroupRulePatterns(rule)
  const activeColor = isEditing ? editingColor : rule.color
  const surfaceTint = RULE_CARD_TINT_MAP[activeColor]
  
  const cardSurfaceStyle = {
    ...style,
    '--sp-rule-card-accent': surfaceTint.accent,
    '--sp-rule-card-border-accent': surfaceTint.border,
  } as CSSProperties

  return (
    <div
      style={cardSurfaceStyle}
      {...dragAttributes}
      {...dragListeners}
      className={cn(
        'sp-rule-card-surface group flex flex-col gap-3 transition-all',
        !rule.isActive && 'is-paused',
        isDragging && 'is-placeholder',
        isOverlay && 'is-lifted',
        isEditing && 'is-editing scale-[1.01]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex min-w-0 flex-1 items-center cursor-pointer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            if (!isEditing) setIsExpanded(!isExpanded)
          }}
        >
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input
                autoFocus
                className="sp-input w-full bg-transparent text-[14px] font-bold outline-none border-b border-[var(--sp-tab-pill-active)] py-0"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <h3 className="sp-rule-card-title truncate pr-4" title={rule.title}>
                {rule.title}
              </h3>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isEditing && !rule.isActive && (
            <span className="sp-chip-muted rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider">
              Paused
            </span>
          )}
          {!isEditing && (
            <div className="sp-rule-card-chevron flex size-5 items-center justify-center text-[var(--text-muted)] transition-transform duration-300"
                 style={{ transform: effectiveExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              <ChevronRight size={16} />
            </div>
          )}
        </div>

        {!isEditing && !isOverlay && (
          <div className="sp-rule-actions absolute right-8 top-1/2 -translate-y-1/2">
            <Tooltip>
              <Tooltip.Trigger asChild>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(rule)
                  }}
                  className="sp-icon-button flex size-6 items-center justify-center rounded-lg"
                >
                  <Pencil size={12} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">Edit</Tooltip.Content>
            </Tooltip>
            <Tooltip>
              <Tooltip.Trigger asChild>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(rule)
                  }}
                  className={cn(
                    'flex size-6 items-center justify-center rounded-lg transition-colors',
                    rule.isActive ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10',
                  )}
                >
                  {rule.isActive ? <Pause size={12} /> : <Play size={12} />}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">
                {rule.isActive ? 'Pause' : 'Resume'}
              </Tooltip.Content>
            </Tooltip>
            <Tooltip>
              <Tooltip.Trigger asChild>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(rule.id)
                  }}
                  className="flex size-6 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 size={12} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">Delete</Tooltip.Content>
            </Tooltip>
          </div>
        )}
      </div>

      <div className="sp-rule-card-body-wrapper" data-expanded={effectiveExpanded}>
        <div className="sp-rule-card-body-inner">
          <div className="flex flex-col gap-4 border-t border-[var(--sp-card-border)] mt-1 pt-4">
            {!isEditing && (
              <>
                <div className="flex items-center gap-2 px-1">
                  <span className="sp-rule-metric" title={`Priority ${rule.order}`}>
                    <ArrowUpWideNarrow size={10} />
                    Priority {rule.order}
                  </span>
                  <span className="sp-rule-metric" title={`${rulePatterns.length} patterns`}>
                    <Globe size={10} />
                    {rulePatterns.length} Patterns
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 px-1">
                  {getAutoGroupRulePatterns(rule).map((pattern, idx) => (
                    <div
                      key={pattern}
                      className="sp-rule-tag sp-rule-card-chip"
                      style={{ '--stagger-idx': idx } as CSSProperties}
                    >
                      <Globe size={10} className="sp-copy-muted shrink-0" />
                      <code title={pattern}>{pattern}</code>
                      <span className="sp-chip-muted rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider">
                        {describeRulePattern(pattern)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {isEditing && (
              <div
                className="sp-subtle-surface flex flex-col gap-4 rounded-xl p-3"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="sp-copy-primary text-[11px] font-bold uppercase tracking-[0.16em]">
                      Rule Editor
                    </p>
                    <p className="sp-copy-muted text-[10px]">
                      Adjust identity, color, and pattern scope in one place.
                    </p>
                  </div>
                  <span className="sp-chip-muted rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider">
                    {editingPatterns.length} pattern{editingPatterns.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="sp-label text-[10px] font-bold uppercase tracking-wider ml-1">
                    Color
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={cn(
                          'size-4 rounded-full transition-transform hover:scale-125 cursor-pointer',
                          COLOR_MAP[color],
                          editingColor === color &&
                            'scale-125 ring-2 ring-[var(--sp-tab-pill-active)] ring-offset-2',
                        )}
                        onClick={() => setEditingColor(color)}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="sp-label text-[10px] font-bold uppercase tracking-wider ml-1">
                    Patterns
                  </label>
                  
                  <div className="flex flex-col gap-2">
                    {editingPatterns.map((pattern, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="sp-input-shell flex flex-1 items-center gap-2 rounded-xl px-3 py-1.5">
                          <Globe size={12} className="sp-copy-muted shrink-0" />
                          <input
                            className="sp-input w-full border-none bg-transparent text-[11px] font-medium outline-none"
                            value={pattern}
                            onChange={(e) => updatePattern(idx, e.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          className="sp-copy-muted cursor-pointer hover:text-rose-500 transition-colors"
                          onClick={() => removePattern(idx)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <div className="sp-input-shell flex flex-1 items-center gap-2 rounded-xl px-3 py-1.5 border-dashed">
                      <Plus size={12} className="sp-copy-muted" />
                      <input
                        placeholder="Add new pattern"
                        className="sp-input w-full border-none bg-transparent text-[11px] font-medium outline-none"
                        value={editingPatternDraft}
                        onChange={(e) => setEditingPatternDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addPattern()
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="sp-primary-action cursor-pointer rounded-lg px-2.5 py-1.5 text-[10px] font-bold"
                      onClick={addPattern}
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--sp-card-border)]">
                  <button
                    type="button"
                    className="sp-secondary-action cursor-pointer rounded-lg px-3 py-1.5 text-[10px] font-bold"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-[10px] font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                    onClick={() => void saveChanges(rule)}
                  >
                    <Check size={12} />
                    Save Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Sortable Item Component ---
interface SortableRuleCardProps {
  rule: NStorage.Sync.Schema.AutoGroupRule
  onEdit: (rule: NStorage.Sync.Schema.AutoGroupRule) => void
  onToggle: (rule: NStorage.Sync.Schema.AutoGroupRule) => void
  onDelete: (id: string) => void
  editingRuleId: string | null
  editingTitle: string
  setEditingTitle: (val: string) => void
  editingColor: NStorage.Sync.GroupColor
  setEditingColor: (val: NStorage.Sync.GroupColor) => void
  editingPatternDraft: string
  setEditingPatternDraft: (val: string) => void
  addPattern: () => void
  updatePattern: (index: number, val: string) => void
  removePattern: (index: number) => void
  saveChanges: (rule: NStorage.Sync.Schema.AutoGroupRule) => void
  cancelEdit: () => void
  editingPatterns: string[]
}

function SortableRuleCard(props: SortableRuleCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.rule.id,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <RuleCardUI
        {...props}
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
        isEditing={props.editingRuleId === props.rule.id}
        isDragging={isDragging}
        dragAttributes={attributes}
        dragListeners={listeners}
      />
    </div>
  )
}

function AutomationManagement() {
  const [rules, setRules] = useState<NStorage.Sync.Schema.AutoGroupRule[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [newRuleTitle, setNewRuleTitle] = useState('')
  const [newRuleColor, setNewRuleColor] = useState<NStorage.Sync.GroupColor>('blue')
  const [newRulePattern, setNewRulePattern] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingColor, setEditingColor] = useState<NStorage.Sync.GroupColor>('blue')
  const [editingPatterns, setEditingPatterns] = useState<string[]>([])
  const [editingPatternDraft, setEditingPatternDraft] = useState('')
  
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeRule = rules.find((r) => r.id === activeId)
  
  const [showDebug, setShowDebug] = useState(false)
  const [debugState, setDebugState] = useState<DebugState | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
  )

  const fetchRules = useCallback(async () => {
    const data = await StorageSyncAutoGroup.getList()
    setRules(sortAutoGroupRules(data))
  }, [])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const handleAddRule = async () => {
    setFormError(null)

    const title = newRuleTitle.trim()
    const pattern = normalizeAutoGroupPattern(newRulePattern.trim())

    if (!title) {
      setFormError('Title is required')
      return
    }

    const validation = validateAutoGroupRulePattern(pattern)
    if (!validation.isValid) {
      setFormError(validation.error || 'Pattern is invalid')
      return
    }

    try {
      const now = new Date().toISOString()
      const rule: NStorage.Sync.Schema.AutoGroupRule = {
        id: crypto.randomUUID(),
        title,
        color: newRuleColor,
        order: rules.length + 1,
        urlPatterns: [validation.normalizedPattern],
        isActive: true,
        createdAt: now,
      }

      await StorageSyncAutoGroup.create(rule)
      await fetchRules()
      setIsAdding(false)
      setNewRuleTitle('')
      setNewRulePattern('')

      chrome.runtime.sendMessage({ action: 'run_auto_group_scan' })
    } catch (e) {
      console.error(e)
      setFormError('Failed to save rule')
    }
  }

  const deleteRule = async (id: string) => {
    try {
      await StorageSyncAutoGroup.deleteById(id)
      await fetchRules()
    } catch (e) {
      console.error(e)
    }
  }

  const toggleRule = async (rule: NStorage.Sync.Schema.AutoGroupRule) => {
    try {
      await StorageSyncAutoGroup.update({
        ...rule,
        isActive: !rule.isActive,
      })
      await fetchRules()
    } catch (e) {
      console.error(e)
    }
  }

  const startPatternEditing = (rule: NStorage.Sync.Schema.AutoGroupRule) => {
    setEditingRuleId(rule.id)
    setEditingTitle(rule.title)
    setEditingColor(rule.color)
    setEditingPatterns([...getAutoGroupRulePatterns(rule)])
    setEditingPatternDraft('')
  }

  const cancelPatternEditing = () => {
    setEditingRuleId(null)
    setEditingTitle('')
    setEditingPatterns([])
    setEditingPatternDraft('')
  }

  const addPatternToDraftList = () => {
    const pattern = normalizeAutoGroupPattern(editingPatternDraft.trim())
    if (!pattern) return

    const validation = validateAutoGroupRulePattern(pattern)
    if (!validation.isValid) {
      alert(validation.error || 'Invalid pattern')
      return
    }

    if (editingPatterns.map((p) => p.toLowerCase()).includes(validation.normalizedPattern.toLowerCase())) {
      setEditingPatternDraft('')
      return
    }

    setEditingPatterns((current) => [...current, validation.normalizedPattern])
    setEditingPatternDraft('')
  }

  const updatePatternAtIndex = (index: number, val: string) => {
    setEditingPatterns((current) => {
      const next = [...current]
      next[index] = val
      return next
    })
  }

  const removePatternFromDraftList = (index: number) => {
    setEditingPatterns((current) => current.filter((_, i) => i !== index))
  }

  const saveEditedPatterns = async (rule: NStorage.Sync.Schema.AutoGroupRule) => {
    const title = editingTitle.trim()
    if (!title) {
      alert('Title is required')
      return
    }

    // Filter out empty and validate existing patterns
    const validPatterns: string[] = []
    for (const p of editingPatterns) {
      const trimmed = p.trim()
      if (!trimmed) continue
      
      const validation = validateAutoGroupRulePattern(normalizeAutoGroupPattern(trimmed))
      if (!validation.isValid) {
        alert(`Invalid pattern: ${trimmed}. ${validation.error || ''}`)
        return
      }
      validPatterns.push(validation.normalizedPattern)
    }

    if (validPatterns.length === 0) {
      alert('A rule must have at least one valid pattern')
      return
    }

    try {
      console.log('[Automation] Saving changes for rule:', rule.id, { title, editingColor, validPatterns })
      await StorageSyncAutoGroup.update({
        ...rule,
        title,
        color: editingColor,
        urlPatterns: validPatterns,
      })
      await fetchRules()
      cancelPatternEditing()
      chrome.runtime.sendMessage({ action: 'run_auto_group_scan' })
    } catch (e) {
      console.error('[Automation] Save error:', e)
      alert(`Failed to save changes: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  const fetchDebugState = async () => {
    chrome.runtime.sendMessage({ action: 'get_auto_group_debug_state' }, (response) => {
      if (response?.success) {
        setDebugState({
          ownership: response.ownership,
          audit: response.audit.reverse(),
        })
      }
    })
  }

  const clearAuditLog = async () => {
    chrome.runtime.sendMessage({ action: 'clear_auto_group_audit' }, (response) => {
      if (response?.success) {
        setDebugState((prev) => (prev ? { ...prev, audit: [] } : null))
      }
    })
  }

  useEffect(() => {
    if (showDebug) {
      fetchDebugState()
      const interval = setInterval(fetchDebugState, 3000)
      return () => clearInterval(interval)
    }
  }, [showDebug])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    
    if (!over || active.id === over.id) return

    const oldIndex = rules.findIndex((r) => r.id === active.id)
    const newIndex = rules.findIndex((r) => r.id === over.id)

    const newOrderedRules = arrayMove(rules, oldIndex, newIndex).map((rule, index) => ({
      ...rule,
      order: index + 1,
    }))

    setRules(newOrderedRules)
    await StorageSyncAutoGroup.replaceAll(newOrderedRules)
    chrome.runtime.sendMessage({ action: 'run_auto_group_scan' })
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-primary)]">
            Rules
          </h2>
          <Tooltip>
            <Tooltip.Trigger asChild>
              <button
                onClick={() => setShowDebug(!showDebug)}
                className={cn(
                  'sp-icon-button flex size-6 items-center justify-center rounded-full cursor-pointer',
                  showDebug && 'bg-amber-100 text-amber-600',
                )}
              >
                <Bug size={12} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">
              {showDebug ? 'Hide Automation Debugger' : 'Show Automation Debugger'}
            </Tooltip.Content>
          </Tooltip>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className={cn(
            'flex size-7 items-center justify-center rounded-full transition-all cursor-pointer',
            isAdding
              ? 'sp-secondary-action rotate-45'
              : 'bg-[var(--sp-tab-pill-active)] text-[var(--primary-foreground)] shadow-lg shadow-indigo-500/20 hover:scale-110',
          )}
        >
          <Plus size={16} />
        </button>
      </div>

      {isAdding && (
        <div className="sp-card animate-in fade-in slide-in-from-top-2 rounded-2xl border p-4 duration-300">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="sp-label ml-1 text-[10px] font-bold uppercase tracking-wider">
                Rule Title
              </label>
              <input
                autoFocus
                placeholder="Work, Social, Shopping..."
                className="sp-input-shell sp-input w-full rounded-xl border-none px-3 py-2.5 text-xs font-bold outline-none"
                value={newRuleTitle}
                onChange={(e) => setNewRuleTitle(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="sp-label ml-1 text-[10px] font-bold uppercase tracking-wider">
                Initial Pattern
              </label>
              <div className="sp-input-shell flex items-center gap-2 rounded-xl px-3 py-2.5">
                <Globe size={14} className="sp-copy-muted" />
                <input
                  placeholder="github.com, *.google.com..."
                  className="sp-input w-full border-none bg-transparent text-xs font-bold outline-none"
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="sp-label ml-1 text-[10px] font-bold uppercase tracking-wider">
                Group Color
              </label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      'size-5 rounded-full transition-transform hover:scale-125 cursor-pointer',
                      COLOR_MAP[color],
                      newRuleColor === color &&
                        'scale-125 ring-2 ring-[var(--sp-tab-pill-active)] ring-offset-2',
                    )}
                    onClick={() => setNewRuleColor(color)}
                  />
                ))}
              </div>
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-600">
                {formError}
              </div>
            )}

            <Button
              className="mt-1 w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer"
              onClick={handleAddRule}
            >
              Add Rule
            </Button>
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col gap-2.5">
          {rules.length === 0 && !isAdding && (
            <div className="sp-outline-dashed rounded-2xl py-12 text-center">
              <p className="sp-copy-muted text-xs font-medium">No automation rules yet.</p>
            </div>
          )}

          <SortableContext
            items={rules.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            {rules.map((rule) => (
              <SortableRuleCard
                key={rule.id}
                rule={rule}
                onEdit={startPatternEditing}
                onToggle={toggleRule}
                onDelete={deleteRule}
                editingRuleId={editingRuleId}
                editingTitle={editingTitle}
                setEditingTitle={setEditingTitle}
                editingColor={editingColor}
                setEditingColor={setEditingColor}
                editingPatternDraft={editingPatternDraft}
                setEditingPatternDraft={setEditingPatternDraft}
                addPattern={addPatternToDraftList}
                updatePattern={updatePatternAtIndex}
                removePattern={removePatternFromDraftList}
                saveChanges={saveEditedPatterns}
                cancelEdit={cancelPatternEditing}
                editingPatterns={editingPatterns}
              />
            ))}
          </SortableContext>
        </div>

        <DragOverlay adjustScale={false}>
          {activeRule ? (
            <div className="w-[calc(100vw-2rem)]">
              <RuleCardUI
                rule={activeRule}
                isExpanded={false}
                setIsExpanded={() => {}}
                isEditing={false}
                editingTitle=""
                setEditingTitle={() => {}}
                editingColor="blue"
                setEditingColor={() => {}}
                editingPatternDraft=""
                setEditingPatternDraft={() => {}}
                addPattern={() => {}}
                updatePattern={() => {}}
                removePattern={() => {}}
                saveChanges={() => {}}
                cancelEdit={() => {}}
                editingPatterns={[]}
                onEdit={() => {}}
                onToggle={() => {}}
                onDelete={() => {}}
                isOverlay
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {showDebug && debugState && (
        <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 duration-300">
          <div className="flex items-center justify-between">
            <h3 className="sp-copy-primary text-[11px] font-bold uppercase tracking-widest">
              Live Registry
            </h3>
            <span className="sp-chip-muted rounded-full px-2 py-0.5 text-[9px] font-bold">
              {debugState.ownership.length} active groups
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {debugState.ownership.length === 0 ? (
              <p className="sp-copy-muted text-[10px] italic">No active auto-groups tracked.</p>
            ) : (
              debugState.ownership.map((entry, idx) => (
                <div
                  key={`${entry.ruleId}-${entry.windowId}-${idx}`}
                  className="sp-subtle-surface flex flex-col gap-1 rounded-lg p-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className={cn('size-2 rounded-full', COLOR_MAP[entry.color])} />
                      <span className="sp-copy-primary text-[11px] font-bold">{entry.title}</span>
                    </div>
                    <span className="sp-copy-muted text-[9px]">Window {entry.windowId}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            <h3 className="sp-copy-primary text-[11px] font-bold uppercase tracking-widest">
              Recent Audit
            </h3>
            <button
              onClick={clearAuditLog}
              className="sp-copy-muted hover:text-rose-500 transition-colors cursor-pointer"
            >
              <Eraser size={12} />
            </button>
          </div>

          <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
            {debugState.audit.length === 0 ? (
              <p className="sp-copy-muted text-[10px] italic">Audit log is empty.</p>
            ) : (
              debugState.audit.map((entry) => (
                <div
                  key={entry.id}
                  className="sp-subtle-surface flex flex-col gap-1 rounded-lg p-2 border-l-2"
                  style={{
                    borderLeftColor:
                      entry.outcome === 'grouped'
                        ? 'var(--success)'
                        : entry.outcome === 'error'
                          ? 'var(--error)'
                          : 'var(--sp-card-border)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'text-[9px] font-bold uppercase tracking-tighter',
                        entry.outcome === 'grouped' ? 'text-emerald-600' : 'text-[var(--text-muted)]',
                      )}
                    >
                      {entry.outcome.replace('_', ' ')}
                    </span>
                    <span className="sp-copy-muted text-[8px]">
                      {new Date(entry.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="sp-copy-primary text-[10px] font-medium leading-tight truncate">
                    {entry.ruleTitle || 'Scan'} - {entry.reason}
                  </p>
                  {entry.url && (
                    <p className="sp-copy-muted text-[9px] truncate italic">{entry.url}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default AutomationManagement
