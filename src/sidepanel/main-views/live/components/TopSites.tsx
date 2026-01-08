import AvatarIcon from "@/components/ui/avatar";
import { Button } from "@/components/ui/button"
import Tooltip from "@/components/ui/tooltip"
import { C_URL_SERVICES } from "@/constants";
import { extractDomainNameFromUrl } from "@/helpers";
import StorageSyncFavIcon from "@/storage/favIcon.sync"
import { useEffect, useState } from "react"

interface IMostVisitedURLFavIconProps {
  url: string;
  title: string;
  favIcons: NStorage.Sync.Schema.FavIcons;
}

function MostVisitedURLFavIcon(props: IMostVisitedURLFavIconProps) {
  const [favIconUrl, setFavIconUrl] = useState("")

  useEffect(() => {
    updateAvatarUrl()
  }, [props.favIcons])

  const updateAvatarUrl = () => {
    const domainName = extractDomainNameFromUrl(props.url)

    if (!domainName) return

    const favIcon = props.favIcons[domainName]

    setFavIconUrl(favIcon?.url || "")
  }

  return (
    <AvatarIcon
      src={favIconUrl}
      fallbackString={props.title[0]}
    />
  )
}

function TopSites() {
  const [list, setList] = useState<chrome.topSites.MostVisitedURL[]>([])
  const [favIcons, setFavIcons] = useState<NStorage.Sync.Schema.FavIcons>({})

  useEffect(() => {
    chrome.topSites.get(data => setList(data))

    getFavIcons();

    chrome.storage.onChanged.addListener(onStorageChanged)
    return () => chrome.storage.onChanged.removeListener(onStorageChanged)
  }, [])

  const onStorageChanged = async (changes: NStorage.Event.Changes<"favIcons">, areaName: NStorage.AreaName) => {
    if (!changes || areaName !== "sync") return

    await getFavIcons()
  }

  const getFavIcons = async () => {
    const data = await StorageSyncFavIcon.get();

    setFavIcons(data)

  }

  return (
    <div className="flex justify-between">
      {
        list.map(item =>
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                variant="secondary"
                size="icon"
                className="size-8"
                onClick={() => chrome.tabs.create({ url: item.url })}
              >
                <MostVisitedURLFavIcon
                  url={item.url}
                  title={item.title}
                  favIcons={favIcons}
                />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              {item.title}
            </Tooltip.Content>
          </Tooltip>
        )
      }
    </div>
  )
}

export default TopSites
