import { Pin, PinOff, RefreshCw, X } from "lucide-react"
import { Button } from "../../../../components/ui/button"
import { KeyboardEventHandler, MouseEventHandler, useEffect, useRef, useState } from "react"
import AvatarIcon from "../../../../components/ui/avatar"
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/helpers";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface IButtonIconProps extends React.ComponentPropsWithoutRef<"button"> { }

function ButtonIcon({ children, className, onClick, ...props }: IButtonIconProps) {
  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className={cn("cursor-pointer hover:bg-gray-200 size-6 shrink-0", className)} 
      onClick={onClick}
      {...props}
    >
      {children}
    </Button>
  )
}

interface IProps {
  tab: chrome.tabs.Tab
  isOverlay?: boolean
}

function TabListItem({ tab, isOverlay }: IProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id! });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 100 : undefined,
  };

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
  }, [tab.title]);

  const handleActiveTab: MouseEventHandler<HTMLDivElement> = (e) => {
    if (isDragging || isOverlay) return;
    e.stopPropagation()
    if (tab.id) {
      void chrome.tabs.update(tab.id, { active: true })
      void chrome.windows.update(tab.windowId, { focused: true })
    }
  }

  const handleCloseTab: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation()
    tab.id && chrome.tabs.remove(tab.id)
  }

  const togglePin: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation()
    const params: chrome.tabs.UpdateProperties = { pinned: true }
    if (tab.pinned) params.pinned = false
    tab.id && chrome.tabs.update(tab.id, params)
  }

  const handleReloadTab: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation()
    tab.id && chrome.tabs.reload(tab.id)
  }

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return
    e.preventDefault()
    if (tab.id) {
      void chrome.tabs.update(tab.id, { active: true })
      void chrome.windows.update(tab.windowId, { focused: true })
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative select-none",
        "grid grid-cols-[auto_1fr_auto] items-center",
        "py-2 pl-3 pr-1.5 rounded-xl transition-all outline-none",
        !isOverlay && "hover:bg-black/5 cursor-default",
        tab.active && !isOverlay && "bg-black/[0.04]",
        isDragging && !isOverlay && "opacity-20",
        isOverlay && "bg-white border border-slate-200 shadow-2xl scale-[1.02] cursor-grabbing z-[1000]"
      )}
      role="button"
      tabIndex={isOverlay ? -1 : 0}
      onClick={handleActiveTab}
      onKeyDown={handleKeyDown}
    >
      {tab.active && !isOverlay && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-5 bg-slate-800 rounded-full" />
      )}
      
      <AvatarIcon 
        src={tab.favIconUrl} 
        fallbackString={(tab.title?.[0] || "").toUpperCase()} 
        className={cn("size-5 shrink-0", { "ring-1 ring-black/5": tab.active && !isOverlay })}
      />
      
      <div className="ml-2 overflow-hidden pointer-events-none">
        <div className="w-full overflow-hidden" ref={textRef}>
          <div 
            className={cn(
              "text-xs transition-colors whitespace-nowrap marquee-target", 
              { 
                "font-bold text-black active-marquee": tab.active && isOverflowing && !isOverlay, 
                "text-slate-600": !tab.active || isOverlay,
                "hidden-marquee": !isOverflowing || isOverlay
              }
            )}
            style={{ 
              ['--marquee-duration' as string]: `${Math.max(4, (tab.title?.length || 0) / 5)}s`,
              ['--scroll-dist' as string]: `-${scrollDistance + 10}px` 
            }}
          >
            {tab.title}
          </div>
        </div>
        <div className="text-[10px] text-slate-400">{formatTimeAgo((tab as chrome.tabs.Tab & { lastAccessed?: number }).lastAccessed)}</div>
      </div>

      {!isOverlay && (
        <div className="flex items-center gap-0.5 ml-1">
          <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5 bg-white/80 backdrop-blur-sm border border-black/5 shadow-sm rounded-lg p-0.5 animate-in fade-in slide-in-from-right-2 duration-200">
            <ButtonIcon onClick={togglePin} title={tab.pinned ? "Unpin tab" : "Pin tab"}>
              {tab.pinned ? <PinOff size={14} className="text-slate-600" /> : <Pin size={14} className="text-slate-600" />}
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
      )}
    </div >
  )
}

export default TabListItem
