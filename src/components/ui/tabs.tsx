import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'
import { ETabMenu } from '@/enums'

function TabsContainer({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col min-h-0', className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'relative inline-flex h-10 w-full shrink-0 items-center justify-start gap-4 border-b px-2 z-50 backdrop-blur',
        'border-[var(--sp-footer-border)] bg-[var(--sp-tab-pill-bg)]',
        className,
      )}
      {...props}
    />
  )
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    data-slot="tabs-trigger"
    className={cn(
      'relative cursor-pointer py-2 text-xs font-bold uppercase tracking-widest outline-none transition-all',
      'text-[var(--sp-tab-pill-text)] data-[state=active]:text-[var(--sp-tab-pill-active)]',
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = 'TabsTrigger'

interface ITabsContentProps
  extends Omit<React.ComponentProps<typeof TabsPrimitive.Content>, 'value'> {
  value: ETabMenu
}

function TabsContent({ className, value, ...props }: ITabsContentProps) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none overflow-y-auto pt-2', className)}
      value={`${value}`}
      {...props}
    />
  )
}

interface IProps {
  tabs: NCommon.Option<ETabMenu>[]
  defaultValue?: ETabMenu
  value?: ETabMenu
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
  rightElement?: React.ReactNode
}

function Tabs(props: IProps) {
  const [internalValue, setInternalValue] = React.useState(
    `${props.defaultValue || props.tabs[0].value}`,
  )
  const activeValue = props.value !== undefined ? `${props.value}` : internalValue

  const handleValueChange = (val: string) => {
    if (props.value === undefined) {
      setInternalValue(val)
    }
    props.onValueChange?.(val)
  }

  const [indicatorStyle, setIndicatorStyle] = React.useState({ left: 0, width: 0 })
  const triggerRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})

  React.useEffect(() => {
    const activeEl = triggerRefs.current[activeValue]
    if (activeEl) {
      setIndicatorStyle({
        left: activeEl.offsetLeft,
        width: activeEl.clientWidth,
      })
    }
  }, [activeValue])

  // Re-calculate on window resize to keep indicator aligned
  React.useEffect(() => {
    const handleResize = () => {
      const activeEl = triggerRefs.current[activeValue]
      if (activeEl) {
        setIndicatorStyle({
          left: activeEl.offsetLeft,
          width: activeEl.clientWidth,
        })
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeValue])

  return (
    <TabsContainer
      value={activeValue}
      onValueChange={handleValueChange}
      className={props.className}
    >
      <TabsList className="justify-between pr-0">
        <div className="flex items-center gap-4">
          {props.tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={`${tab.value}`}
              ref={(el) => {
                triggerRefs.current[`${tab.value}`] = el
              }}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </div>

        {props.rightElement && (
          <div className="flex items-center px-2">
            {props.rightElement}
          </div>
        )}

        <div
          className="absolute bottom-0 z-10 h-[2px] bg-[var(--sp-tab-pill-active)] transition-all duration-300 ease-in-out"
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
          }}
        />
      </TabsList>
      {props.children}
    </TabsContainer>
  )
}

Tabs.Content = TabsContent

export default Tabs
