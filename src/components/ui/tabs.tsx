import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"
import { ETabMenu } from "@/enums"

function TabsContainer({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 w-full items-center justify-start border-b border-black/[0.03] px-2 gap-4",
        className
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
      "relative text-slate-400 data-[state=active]:text-slate-900 transition-all text-xs font-bold uppercase tracking-widest py-2 cursor-pointer outline-none",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = "TabsTrigger"

interface ITabsContentProps extends Omit<React.ComponentProps<typeof TabsPrimitive.Content>, "value"> {
  value: ETabMenu
}

function TabsContent({
  className,
  value,
  ...props
}: ITabsContentProps) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      value={`${value}`}
      {...props}
    />
  )
}

interface IProps {
  tabs: NCommon.Option<ETabMenu>[];
  defaultValue?: ETabMenu;
  children: React.ReactNode;
}

function Tabs(props: IProps) {
  const [activeValue, setActiveValue] = React.useState(`${props.defaultValue || props.tabs[0].value}`);
  const [indicatorStyle, setIndicatorStyle] = React.useState({ left: 0, width: 0 });
  const triggerRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  React.useEffect(() => {
    const activeEl = triggerRefs.current[activeValue];
    if (activeEl) {
      setIndicatorStyle({
        left: activeEl.offsetLeft,
        width: activeEl.clientWidth
      });
    }
  }, [activeValue]);

  // Re-calculate on window resize to keep indicator aligned
  React.useEffect(() => {
    const handleResize = () => {
      const activeEl = triggerRefs.current[activeValue];
      if (activeEl) {
        setIndicatorStyle({
          left: activeEl.offsetLeft,
          width: activeEl.clientWidth
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeValue]);

  return (
    <TabsContainer value={activeValue} onValueChange={setActiveValue}>
      <TabsList className="relative">
        {
          props.tabs.map(tab => (
            <TabsTrigger 
              key={tab.value} 
              value={`${tab.value}`}
              ref={(el) => { triggerRefs.current[`${tab.value}`] = el }}
            >
              {tab.label}
            </TabsTrigger>
          ))
        }
        <div 
          className="absolute bottom-0 h-[2px] bg-slate-800 transition-all duration-300 ease-in-out z-10" 
          style={{ 
            left: `${indicatorStyle.left}px`, 
            width: `${indicatorStyle.width}px` 
          }}
        />
      </TabsList>
      {
        props.children
      }
    </TabsContainer >
  )
}

Tabs.Content = TabsContent

export default Tabs;
