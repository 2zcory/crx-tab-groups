import { Pin, PinOff, RefreshCw, X } from "lucide-react"
import { Button } from "../../../../components/ui/button"
import { MouseEventHandler } from "react"
import AvatarIcon from "../../../../components/ui/avatar"
import { cn } from "@/lib/utils";

interface IButtonIconProps extends Pick<React.ComponentProps<"button">, "children" | "onClick" | "className"> { }

function ButtonIcon(props: IButtonIconProps) {
  return (
    <Button variant="ghost" size="icon" className={
      cn("cursor-pointer hover:bg-gray-200 size-6", props.className)
    } onClick={props.onClick}>
      {props.children}
    </Button>
  )
}

interface IProps {
  tab: chrome.tabs.Tab
}

function TabListItem(props: IProps) {
  const handleActiveTab: MouseEventHandler<HTMLDivElement> = (e) => {
    e.stopPropagation()

    props.tab.id && chrome.tabs.update(props.tab.id, { active: true })
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

  return (
    <div
      className={cn(
        "group",
        "grid grid-cols-[auto_1fr_auto] items-center",
        "hover:bg-gray-100 py-2 pl-2 pr-0 cursor-pointer",
        { "before:content-[attr(data-before)] before:absolute before:left-0": props.tab.active }
      )}
      onClick={handleActiveTab}
      data-before="⯈"
    >
      <AvatarIcon src={props.tab.favIconUrl} fallbackString={(props.tab.title?.[0] || "").toUpperCase()} />
      <div className="ml-1 overflow-hidden truncate">{props.tab.title}</div>
      <div className="hidden group-hover:flex">
        <ButtonIcon onClick={togglePin} className="ml-0.5">
          {
            props.tab.pinned ? (
              <PinOff />
            ) : (
              <Pin />

            )
          }
        </ButtonIcon>
        <ButtonIcon onClick={handleReloadTab} className="ml-0.5">
          <RefreshCw />
        </ButtonIcon>
        <ButtonIcon onClick={handleCloseTab} className="ml-0.5">
          <X />
        </ButtonIcon>
      </div>
    </div >
  )
}

export default TabListItem
