import { motion, AnimatePresence, useDragControls } from 'framer-motion'
import { ReactNode, useEffect } from 'react'
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

  // Prevent scrolling when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
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
              'fixed inset-x-0 bottom-0 z-50 flex max-h-[90%] flex-col rounded-t-[2rem] border-t border-[var(--sp-card-border)] bg-[var(--sp-shell-bg)] shadow-2xl',
              sheetClassName,
            )}
            style={{ 
              background: 'var(--sp-shell-bg)',
              backdropFilter: 'var(--sp-shell-blur)'
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
        </>
      )}
    </AnimatePresence>
  )
}
