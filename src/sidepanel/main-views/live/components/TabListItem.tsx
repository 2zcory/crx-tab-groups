import { Pin, PinOff, RefreshCw, X } from "lucide-react"
import { Button } from "../../../../components/ui/button"
import { KeyboardEventHandler, MouseEventHandler, useEffect, useRef, useState } from "react"
import AvatarIcon from "../../../../components/ui/avatar"
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/helpers";

interface IButtonIconProps extends React.ComponentPropsWithoutRef<"button"> { }

function ButtonIcon({ children, className, onClick, ...props }: IButtonIconProps) {
  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className={cn("cursor-pointer hover:bg-gray-200 size-6", className)} 
      onClick={onClick}
      {...props}
    >
      {children}
    </Button>
  )
}

interface IProps {
  tab: chrome.tabs.Tab
}

function TabListItem(props: IProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [scrollDistance, setScrollDistance] = useState(0);

  useEffect(() => {
    if (textRef.current) {
      const { scrollWidth, clientWidth } = textRef.current;
      const overflowing = scrollWidth > clientWidth;
      setIsOverflowing(overflowing);
      if (overflowing) {
        setScrollDistance(scrollWidth - clientWidth);
      }
    }
  }, [props.tab.title]);

  const handleActiveTab: MouseEventHandler<HTMLDivElement> = (e) => {
    e.stopPropagation()

    if (props.tab.id) {
      void chrome.tabs.update(props.tab.id, { active: true })
      void chrome.windows.update(props.tab.windowId, { focused: true })
    }
  }

  const handleCloseTab: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation()

    props.tab.id && chrome.tabs.remove(props.tab.id)
  }

  const togglePin: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation()

    const params: chrome.tabs.UpdateProperties = { pinned: true }

    if (props.tab.pinned) params.pinned = false

    props.tab.id && chrome.tabs.update(props.tab.id, params)
  }

  const handleReloadTab: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation()

    props.tab.id && chrome.tabs.reload(props.tab.id)
  }

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return

    e.preventDefault()
    if (props.tab.id) {
      void chrome.tabs.update(props.tab.id, { active: true })
      void chrome.windows.update(props.tab.windowId, { focused: true })
    }
  }

  return (
    <div
      className={cn(
        "group relative",
        "grid grid-cols-[auto_1fr_auto] items-center",
        "hover:bg-black/5 py-2 pl-3 pr-1.5 cursor-pointer rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-1",
        { "bg-black/[0.04]": props.tab.active }
      )}
      role="button"
      tabIndex={0}
      onClick={handleActiveTab}
      onKeyDown={handleKeyDown}
    >
      {props.tab.active && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-5 bg-slate-800 rounded-full" />
      )}
      <AvatarIcon 
        src={props.tab.favIconUrl} 
        fallbackString={(props.tab.title?.[0] || "").toUpperCase()} 
        className={cn("size-5", { "ring-1 ring-black/5": props.tab.active })}
      />
      <div className="ml-2 overflow-hidden">
        <div className="w-full overflow-hidden" ref={textRef}>
          <div 
            className={cn(
              "text-xs transition-colors whitespace-nowrap marquee-target", 
              { 
                "font-bold text-black active-marquee": props.tab.active && isOverflowing, 
                "text-slate-600": !props.tab.active,
                "hidden-marquee": !isOverflowing
              }
            )}
            style={{ 
              ['--marquee-duration' as string]: `${Math.max(4, (props.tab.title?.length || 0) / 5)}s`,
              ['--scroll-dist' as string]: `-${scrollDistance + 10}px` 
            }}
          >
            {props.tab.title}
          </div>
        </div>
        <div className="text-[10px] text-slate-400">{formatTimeAgo((props.tab as chrome.tabs.Tab & { lastAccessed?: number }).lastAccessed)}</div>
      </div>
      <div className="flex items-center gap-0.5 ml-1">
        <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5 bg-white/80 backdrop-blur-sm border border-black/5 shadow-sm rounded-lg p-0.5 animate-in fade-in slide-in-from-right-2 duration-200">
          <ButtonIcon onClick={togglePin} title={props.tab.pinned ? "Unpin tab" : "Pin tab"}>
            {props.tab.pinned ? <PinOff size={14} className="text-slate-600" /> : <Pin size={14} className="text-slate-600" />}
          </ButtonIcon>
          <ButtonIcon onClick={handleReloadTab} title="Reload tab">
            <RefreshCw size={14} className="text-slate-600" />
          </ButtonIcon>
        </div>
        <ButtonIcon
          onClick={handleCloseTab}
          title="Close tab"
          className="opacity-80 hover:bg-red-50 hover:text-red-600 group/close"
        >
          <X size={14} className="text-slate-600 group-hover/close:text-red-600" />
        </ButtonIcon>
      </div>
    </div >
  )
}

export default TabListItem
