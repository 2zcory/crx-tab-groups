import AvatarIcon from '@/components/ui/avatar'
import Tooltip from '@/components/ui/tooltip'
import { extractDomainNameFromUrl } from '@/helpers'
import StorageSyncFavIcon from '@/storage/favIcon.sync'
import { useEffect, useRef, useState } from 'react'

interface IMostVisitedURLFavIconProps {
  url: string
  title: string
  favIcons: NStorage.Sync.Schema.FavIcons
}

function MostVisitedURLFavIcon(props: IMostVisitedURLFavIconProps) {
  const [favIconUrl, setFavIconUrl] = useState('')

  useEffect(() => {
    updateAvatarUrl()
  }, [props.favIcons])

  const updateAvatarUrl = () => {
    const domainName = extractDomainNameFromUrl(props.url)

    if (!domainName) return

    const favIcon = props.favIcons[domainName]

    setFavIconUrl(favIcon?.url || '')
  }

  return <AvatarIcon src={favIconUrl} fallbackString={props.title[0]} />
}

function TopSites() {
  const [list, setList] = useState<chrome.topSites.MostVisitedURL[]>([])
  const [favIcons, setFavIcons] = useState<NStorage.Sync.Schema.FavIcons>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chrome.topSites.get((data) => setList(data))

    getFavIcons()

    chrome.storage.onChanged.addListener(onStorageChanged)
    return () => chrome.storage.onChanged.removeListener(onStorageChanged)
  }, [])

  const onStorageChanged = async (
    changes: NStorage.Event.Changes<'favIcons'>,
    areaName: NStorage.AreaName,
  ) => {
    if (!changes || areaName !== 'sync') return

    await getFavIcons()
  }

  const getFavIcons = async () => {
    const data = await StorageSyncFavIcon.get()
    setFavIcons(data)
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) {
      // Chuyển cuộn dọc thành cuộn ngang
      scrollRef.current.scrollLeft += e.deltaY
    }
  }

  return (
    <section
      className="sp-card relative w-full overflow-hidden rounded-2xl group/topsites"
      data-live-surface="top-sites"
    >
      <div className="flex items-center justify-between px-4 pt-3">
        <div>
          <p className="sp-label text-[11px] font-semibold uppercase tracking-[0.18em]">
            Top Sites
          </p>
          <p className="sp-copy-muted text-[11px]">Quick launch utility</p>
        </div>
        <span className="sp-chip rounded-full px-2 py-0.5 text-[10px] font-medium">
          {Math.min(list.length, 12)}
        </span>
      </div>
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex items-center gap-5 px-4 py-3 overflow-x-auto no-scrollbar mask-fade-right scroll-smooth"
      >
        {list.slice(0, 12).map((item) => (
          <Tooltip key={item.url}>
            <Tooltip.Trigger asChild>
              <button
                className="group flex-shrink-0 size-7 flex items-center justify-center rounded-full transition-colors cursor-pointer hover:bg-[var(--surface-muted)]"
                onClick={() => chrome.tabs.create({ url: item.url })}
              >
                <div className="grayscale-[0.4] group-hover:grayscale-0 transition-all scale-95 group-hover:scale-110">
                  <MostVisitedURLFavIcon url={item.url} title={item.title} favIcons={favIcons} />
                </div>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content>{item.title}</Tooltip.Content>
          </Tooltip>
        ))}
      </div>
    </section>
  )
}

export default TopSites
