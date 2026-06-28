import { Button } from '@/components/ui/button'
import { useTranslation } from '@/hooks/useTranslation'
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
import { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
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
import { motion, AnimatePresence } from 'framer-motion'

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

const RULE_CARD_TINT_MAP: Record<NStorage.Sync.GroupColor, { accent: string; border: string }> = {
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
  editingError: string | null
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
  editingError,
}: RuleCardUIProps) {
  const { t } = useTranslation()
  const effectiveExpanded = isExpanded || isEditing
  const rulePatterns = getAutoGroupRulePatterns(rule)
  const activeColor = isEditing ? editingColor : rule.color
  const surfaceTint = RULE_CARD_TINT_MAP[activeColor]

  const cardSurfaceStyle = {
    ...style,
    '--sp-rule-card-accent': surfaceTint.accent,
    '--sp-rule-card-border-accent': surfaceTint.border,
  } as CSSProperties

  const patternPreview = rulePatterns.join(', ')

  return (
    <div
      style={cardSurfaceStyle}
      className={cn(
        'sp-rule-card-surface group flex flex-col gap-2 transition-all p-3',
        !rule.isActive && 'is-paused',
        isDragging && 'is-placeholder',
        isOverlay && 'is-lifted',
        isEditing && 'is-editing scale-[1.01]',
      )}
    >
      <div className="flex items-center justify-between gap-2.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {!isEditing && (
            <div
              {...(!isOverlay ? { ...dragAttributes, ...dragListeners } : {})}
              className={cn(
                "sp-rule-drag-handle shrink-0 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5",
                !isOverlay ? "cursor-grab active:cursor-grabbing" : "opacity-50"
              )}
            >
              <GripVertical size={13} />
            </div>
          )}

          {!isEditing && (
            <div className={cn("size-2.5 rounded-full shrink-0 shadow-sm", COLOR_MAP[activeColor])} />
          )}

          <div
            className="flex flex-col min-w-0 flex-1 cursor-pointer"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              if (!isEditing) setIsExpanded(!isExpanded)
            }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className={cn("size-2.5 rounded-full shrink-0 shadow-sm", COLOR_MAP[activeColor])} />
                  <input
                    autoFocus
                    className="sp-input w-full bg-transparent text-[13px] font-bold outline-none border-b border-[var(--sp-tab-pill-active)] py-0.5"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : (
                <>
                  <h3 className="sp-rule-card-title truncate" title={rule.title}>
                    {rule.title}
                  </h3>
                  <span className="text-[9px] font-bold text-[var(--text-muted)] shrink-0 bg-[var(--surface-muted)] px-1.5 py-0.5 rounded-md border border-[var(--sp-card-border)]">
                    #{rule.order}
                  </span>
                </>
              )}
            </div>

            <motion.div
              initial={false}
              animate={{
                height: effectiveExpanded ? 0 : 'auto',
                opacity: effectiveExpanded ? 0 : 1,
                marginTop: effectiveExpanded ? 0 : 2,
              }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden min-w-0 flex"
            >
              {patternPreview && (
                <span className="text-[10px] text-[var(--text-muted)] truncate font-medium w-full" title={patternPreview}>
                  {patternPreview}
                </span>
              )}
            </motion.div>
          </div>
        </div>

        {!isEditing && !isOverlay && (
          <div className="sp-rule-inline-actions flex items-center gap-1 shrink-0">
            <Tooltip>
              <Tooltip.Trigger asChild>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(rule)
                  }}
                  className="size-6 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                >
                  <Pencil size={11} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">
                {t('edit')}
              </Tooltip.Content>
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
                    'size-6 flex items-center justify-center rounded-lg transition-all cursor-pointer hover:bg-[var(--surface-elevated)]',
                    rule.isActive
                      ? 'text-amber-500/80 hover:text-amber-500'
                      : 'text-emerald-500/80 hover:text-emerald-500',
                  )}
                >
                  {rule.isActive ? <Pause size={11} /> : <Play size={11} />}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">
                {rule.isActive ? t('pause') : t('resume')}
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
                  className="size-6 flex items-center justify-center rounded-lg text-rose-500/80 hover:bg-rose-500/10 hover:text-rose-500 transition-all cursor-pointer"
                >
                  <Trash2 size={11} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content className="sp-tooltip rounded-lg px-2 py-1 text-[10px]">
                {t('delete')}
              </Tooltip.Content>
            </Tooltip>

            <div
              className="flex size-6 items-center justify-center text-[var(--text-muted)] transition-transform duration-200 cursor-pointer"
              style={{ transform: effectiveExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded(!isExpanded)
              }}
            >
              <ChevronRight size={14} />
            </div>
          </div>
        )}

        {isOverlay && (
          <div className="text-[var(--text-muted)]">
            <ChevronRight size={14} />
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {effectiveExpanded && (
          <motion.div
            key="expanded-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 border-t border-[var(--sp-card-border)] mt-2 pt-3">
              {!isEditing && (
                <div className="flex flex-wrap gap-1.5 px-0.5">
                  {rulePatterns.map((pattern, idx) => (
                    <motion.div
                      key={pattern}
                      initial={{ opacity: 0, scale: 0.85, y: 5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: idx * 0.02 }}
                      className="sp-rule-tag sp-rule-card-chip py-1 px-2.5 rounded-lg gap-1.5 text-[10px]"
                    >
                      <Globe size={9} className="sp-copy-muted shrink-0" />
                      <code title={pattern} className="max-w-32 truncate">{pattern}</code>
                      <span className="sp-chip-muted rounded px-1 py-0.5 text-[7px] font-bold uppercase tracking-wider">
                        {describeRulePattern(pattern)}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}

              {isEditing && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="sp-subtle-surface flex flex-col gap-3 rounded-xl p-2.5"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="sp-copy-primary text-[10px] font-bold uppercase tracking-[0.14em]">
                        {t('ruleEditor')}
                      </p>
                    </div>
                    <span className="sp-chip-muted rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider">
                      {editingPatterns.length === 1 ? t('patternsCount', { count: editingPatterns.length }) : t('patternsCountPlural', { count: editingPatterns.length })}
                    </span>
                  </div>

                  {editingError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-medium text-rose-600 animate-in fade-in slide-in-from-top-1 duration-200">
                      {editingError}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label className="sp-label text-[9px] font-bold uppercase tracking-wider ml-0.5">
                      {t('labelColor')}
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={cn(
                            'size-5.5 rounded-full transition-transform hover:scale-110 cursor-pointer flex items-center justify-center border border-black/10',
                            COLOR_MAP[color],
                            editingColor === color &&
                              'scale-110 ring-2 ring-[var(--sp-tab-pill-active)] ring-offset-2',
                          )}
                          onClick={() => setEditingColor(color)}
                        >
                          {editingColor === color && (
                            <Check size={10} className={cn("drop-shadow-sm font-bold", color === 'yellow' ? 'text-black' : 'text-white')} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-0.5 ml-0.5">
                      <label className="sp-label text-[9px] font-bold uppercase tracking-wider">
                        {t('labelPatterns')}
                      </label>
                      <span className="text-[8px] text-[var(--text-muted)]">
                        {t('patternHint')}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {editingPatterns.map((pattern, idx) => {
                        const validation = validateAutoGroupRulePattern(normalizeAutoGroupPattern(pattern))
                        const isInvalid = pattern.trim() !== '' && !validation.isValid
                        return (
                          <div key={idx} className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <div className={cn(
                                "sp-input-shell flex flex-1 items-center gap-1.5 rounded-lg px-2 py-1 transition-colors",
                                isInvalid && "border-rose-500 bg-rose-500/5 ring-1 ring-rose-500/20"
                              )}>
                                <Globe size={11} className={cn("sp-copy-muted shrink-0", isInvalid && "text-rose-500")} />
                                <input
                                  className="sp-input w-full border-none bg-transparent text-[10px] font-medium outline-none"
                                  value={pattern}
                                  onChange={(e) => updatePattern(idx, e.target.value)}
                                />
                              </div>
                              <button
                                type="button"
                                className="sp-copy-muted cursor-pointer hover:text-rose-500 transition-colors shrink-0"
                                onClick={() => removePattern(idx)}
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                            {isInvalid && validation.error && (
                              <span className="text-[8px] font-medium text-rose-500 ml-1">
                                {validation.error}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex flex-col gap-1 mt-0.5">
                      <div className="flex items-center gap-1.5">
                        <div className={cn(
                          "sp-input-shell flex flex-1 items-center gap-1.5 rounded-lg px-2 py-1 border-dashed transition-colors",
                          editingPatternDraft.trim() !== '' && !validateAutoGroupRulePattern(normalizeAutoGroupPattern(editingPatternDraft)).isValid && "border-rose-500 bg-rose-500/5 ring-1 ring-rose-500/20 border-solid"
                        )}>
                          <Plus size={11} className="sp-copy-muted" />
                          <input
                            placeholder={t('addNewPattern')}
                            className="sp-input w-full border-none bg-transparent text-[10px] font-medium outline-none"
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
                          className="sp-primary-action cursor-pointer rounded-lg px-2 py-1 text-[9px] font-bold"
                          onClick={addPattern}
                        >
                          {t('add')}
                        </button>
                      </div>
                      {editingPatternDraft.trim() !== '' && !validateAutoGroupRulePattern(normalizeAutoGroupPattern(editingPatternDraft)).isValid && (
                        <span className="text-[8px] font-medium text-rose-500 ml-1">
                          {validateAutoGroupRulePattern(normalizeAutoGroupPattern(editingPatternDraft)).error}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-[var(--sp-card-border)]">
                    <button
                      type="button"
                      className="sp-secondary-action cursor-pointer rounded-lg px-2.5 py-1 text-[9px] font-bold"
                      onClick={cancelEdit}
                    >
                      {t('cancel')}

                    </button>
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-[9px] font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                      onClick={() => void saveChanges(rule)}
                    >
                      <Check size={11} />
                      {t('saveChanges')}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
  editingError: string | null
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

export interface AutomationManagementHandle {
  toggleAddMode: () => void
  toggleDebugMode: () => void
}

const AutomationManagement = forwardRef<
  AutomationManagementHandle,
  { developerMode?: boolean }
>(({ developerMode = false }, ref) => {
  const { t } = useTranslation()
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
  const [editingError, setEditingError] = useState<string | null>(null)

  const [activeId, setActiveId] = useState<string | null>(null)
  const activeRule = rules.find((r) => r.id === activeId)

  const [showDebug, setShowDebug] = useState(false)
  const effectiveShowDebug = developerMode && showDebug
  const [debugState, setDebugState] = useState<DebugState | null>(null)

  useImperativeHandle(ref, () => ({
    toggleAddMode: () => {
      setIsAdding((prev) => !prev)
    },
    toggleDebugMode: () => {
      setShowDebug((prev) => !prev)
    },
  }))

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
      setFormError(t('titleRequired'))
      return
    }

    const validation = validateAutoGroupRulePattern(pattern)
    if (!validation.isValid) {
      setFormError(validation.error || t('patternIsInvalid'))
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
      setFormError(t('failedToSaveRule'))
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
    setEditingError(null)
  }

  const cancelPatternEditing = () => {
    setEditingRuleId(null)
    setEditingTitle('')
    setEditingPatterns([])
    setEditingPatternDraft('')
    setEditingError(null)
  }

  const addPatternToDraftList = () => {
    setEditingError(null)
    const pattern = normalizeAutoGroupPattern(editingPatternDraft.trim())
    if (!pattern) return

    const validation = validateAutoGroupRulePattern(pattern)
    if (!validation.isValid) {
      setEditingError(validation.error || t('invalidPattern'))
      return
    }

    if (
      editingPatterns
        .map((p) => p.toLowerCase())
        .includes(validation.normalizedPattern.toLowerCase())
    ) {
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
    setEditingError(null)
    const title = editingTitle.trim()
    if (!title) {
      setEditingError(t('titleRequired'))
      return
    }

    // Filter out empty and validate existing patterns
    const validPatterns: string[] = []
    for (const p of editingPatterns) {
      const trimmed = p.trim()
      if (!trimmed) continue

      const validation = validateAutoGroupRulePattern(normalizeAutoGroupPattern(trimmed))
      if (!validation.isValid) {
        setEditingError(`${t('invalidPatternDetail', { pattern: trimmed, error: validation.error || '' })}`)
        return
      }
      validPatterns.push(validation.normalizedPattern)
    }

    if (validPatterns.length === 0) {
      setEditingError(t('atLeastOnePattern'))
      return
    }

    try {
      console.log('[Automation] Saving changes for rule:', rule.id, {
        title,
        editingColor,
        validPatterns,
      })
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
      setEditingError(t('failedToSaveChanges', { error: e instanceof Error ? e.message : 'Unknown error' }))
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
    if (effectiveShowDebug) {
      fetchDebugState()
      const interval = setInterval(fetchDebugState, 3000)
      return () => clearInterval(interval)
    }
  }, [effectiveShowDebug])

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
    <div className="flex flex-col gap-2.5 px-3 pb-3 pt-1">

      {isAdding && (
        <div className="sp-card animate-in fade-in slide-in-from-top-2 rounded-2xl border p-4 duration-300">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="sp-label ml-1 text-[10px] font-bold uppercase tracking-wider">
                {t('ruleTitle')}
              </label>
              <input
                autoFocus
                placeholder={t('rulePlaceholder')}
                className="sp-input-shell sp-input w-full rounded-xl border-none px-3 py-2.5 text-xs font-bold outline-none"
                value={newRuleTitle}
                onChange={(e) => setNewRuleTitle(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex flex-col gap-0.5 ml-1">
                <label className="sp-label text-[10px] font-bold uppercase tracking-wider">
                  {t('initialPattern')}
                </label>
                <span className="text-[9px] text-[var(--text-muted)]">
                  {t('patternHint')}
                </span>
              </div>
              <div className={cn(
                "sp-input-shell flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors",
                newRulePattern.trim() !== '' && !validateAutoGroupRulePattern(normalizeAutoGroupPattern(newRulePattern)).isValid && "border-rose-500 bg-rose-500/5 ring-1 ring-rose-500/20"
              )}>
                <Globe size={14} className="sp-copy-muted" />
                <input
                  placeholder={t('patternPlaceholder')}
                  className="sp-input w-full border-none bg-transparent text-xs font-bold outline-none"
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                />
              </div>
              {newRulePattern.trim() !== '' && !validateAutoGroupRulePattern(normalizeAutoGroupPattern(newRulePattern)).isValid && (
                <span className="text-[9px] font-medium text-rose-500 ml-1">
                  {validateAutoGroupRulePattern(normalizeAutoGroupPattern(newRulePattern)).error}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label className="sp-label ml-1 text-[10px] font-bold uppercase tracking-wider">
                {t('groupColor')}
              </label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      'size-6 rounded-full transition-transform hover:scale-110 cursor-pointer flex items-center justify-center border border-black/10',
                      COLOR_MAP[color],
                      newRuleColor === color &&
                        'scale-110 ring-2 ring-[var(--sp-tab-pill-active)] ring-offset-2',
                    )}
                    onClick={() => setNewRuleColor(color)}
                  >
                    {newRuleColor === color && (
                      <Check size={12} className={cn("drop-shadow-sm font-bold", color === 'yellow' ? 'text-black' : 'text-white')} />
                    )}
                  </button>
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
              {t('addRule')}
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
            <div className="sp-outline-dashed rounded-2xl py-12 px-4 text-center flex flex-col items-center gap-3">
              <p className="sp-copy-muted text-xs font-medium">{t('noRulesYet')}</p>
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[var(--sp-tab-pill-active)] px-4 py-2 text-xs font-bold text-[var(--primary-foreground)] shadow-md hover:scale-105 transition-transform"
              >
                <Plus size={14} />
                {t('createFirstRule')}
              </button>
            </div>
          )}

          <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
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
                editingError={editingError}
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
                editingError={null}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {effectiveShowDebug && debugState && (
        <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 duration-300">
          <div className="flex items-center justify-between">
            <h3 className="sp-copy-primary text-[11px] font-bold uppercase tracking-widest">
              {t('liveRegistry')}
            </h3>
            <span className="sp-chip-muted rounded-full px-2 py-0.5 text-[9px] font-bold">
              {t('activeGroupsCount', { count: debugState.ownership.length })}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {debugState.ownership.length === 0 ? (
              <p className="sp-copy-muted text-[10px] italic">{t('noActiveAutoGroups')}</p>
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
                    <span className="sp-copy-muted text-[9px]">{t('windowLabel', { id: entry.windowId })}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            <h3 className="sp-copy-primary text-[11px] font-bold uppercase tracking-widest">
              {t('recentAudit')}
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
              <p className="sp-copy-muted text-[10px] italic">{t('auditEmpty')}</p>
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
                        entry.outcome === 'grouped'
                          ? 'text-emerald-600'
                          : 'text-[var(--text-muted)]',
                      )}
                    >
                      {entry.outcome.replace('_', ' ')}
                    </span>
                    <span className="sp-copy-muted text-[8px]">
                      {new Date(entry.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="sp-copy-primary text-[10px] font-medium leading-tight truncate">
                    {entry.ruleTitle || t('scan')} - {entry.reason}
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
})

export default AutomationManagement
