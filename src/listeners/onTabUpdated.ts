import { useEffect } from "react"

type Callback = () => void

const onTabUpdated = (callback: Callback) => {
  useEffect(() => {
    callback();

    chrome.tabs.onActivated.addListener(callback)
    chrome.tabs.onUpdated.addListener(callback)
    chrome.tabs.onMoved.addListener(callback)
    chrome.tabGroups.onUpdated.addListener(callback)

    return () => {
      chrome.tabs.onActivated.removeListener(callback)
      chrome.tabs.onUpdated.removeListener(callback)
      chrome.tabs.onMoved.removeListener(callback)
      chrome.tabGroups.onUpdated.removeListener(callback)
    }
  }, [])
}

export default onTabUpdated
