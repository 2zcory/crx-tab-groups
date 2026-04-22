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
    <section className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 group/topsites">
      <div className="flex items-center justify-between px-4 pt-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Top Sites
          </p>
          <p className="text-[11px] text-slate-400">Quick launch utility</p>
        </div>
        <span className="rounded-full border border-black/5 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-slate-500">
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
                className="group flex-shrink-0 size-7 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors cursor-pointer"
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
