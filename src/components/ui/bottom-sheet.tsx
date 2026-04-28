import { motion, AnimatePresence, useDragControls } from 'framer-motion'
import { ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/utils'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  description?: string
  sheetClassName?: string
  contentClassName?: string
  sheetDataAttributes?: Record<`data-${string}`, string>
}

export const BottomSheet = ({
  isOpen,
  onClose,
  children,
  title,
  description,
  sheetClassName,
  contentClassName,
  sheetDataAttributes,
}: BottomSheetProps) => {
  const dragControls = useDragControls()
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const hasAppliedInitialFocusRef = useRef(false)

  // Prevent scrolling when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      hasAppliedInitialFocusRef.current = false
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            initial={{ y: '100vh' }}
            animate={{ y: 0 }}
            exit={{ y: '100vh' }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={() => {
              if (!isOpen || hasAppliedInitialFocusRef.current === true) {
                return
              }

              const focusTarget = sheetRef.current?.querySelector<HTMLElement>(
                '[data-bottom-sheet-autofocus], input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
              )

              focusTarget?.focus({ preventScroll: true })
              hasAppliedInitialFocusRef.current = true
            }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) {
                onClose()
              }
            }}
            {...sheetDataAttributes}
            className={cn(
              'relative z-10 flex max-h-[90vh] w-full flex-col rounded-t-[2rem] border-t border-[var(--sp-card-border)] bg-[var(--sp-shell-bg)] shadow-2xl will-change-transform',
              sheetClassName,
            )}
            style={{
              background: 'var(--sp-shell-bg)',
              backdropFilter: 'var(--sp-shell-blur)',
              transform: 'translateZ(0)',
            }}
          >
            {/* Handle / Header Area */}
            <div
              className="flex w-full cursor-grab flex-col items-center pt-3 pb-2 active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="h-1.5 w-12 rounded-full bg-[var(--sp-card-border)] opacity-50" />

              {(title || description) && (
                <div className="w-full px-6 pt-4 pb-2">
                  {title && (
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-primary)]">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="text-[10px] text-[var(--text-muted)]">{description}</p>
                  )}
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className={cn('flex-1 overflow-y-auto px-6 pb-8 custom-scrollbar', contentClassName)}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
