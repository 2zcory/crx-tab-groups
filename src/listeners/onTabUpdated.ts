import { useEffect } from 'react'

type Callback = () => void

const onTabUpdated = (callback: Callback) => {
  useEffect(() => {
    callback()

    chrome.tabs.onActivated.addListener(callback)
    chrome.tabs.onUpdated.addListener(callback)
    chrome.tabs.onMoved.addListener(callback)
    chrome.tabs.onRemoved.addListener(callback)
    chrome.tabs.onCreated.addListener(callback)
    chrome.tabs.onAttached.addListener(callback)
    chrome.tabs.onDetached.addListener(callback)
    chrome.tabGroups.onUpdated.addListener(callback)
    chrome.tabGroups.onCreated.addListener(callback)
    chrome.tabGroups.onRemoved.addListener(callback)

    return () => {
      chrome.tabs.onActivated.removeListener(callback)
      chrome.tabs.onUpdated.removeListener(callback)
      chrome.tabs.onMoved.removeListener(callback)
      chrome.tabs.onRemoved.removeListener(callback)
      chrome.tabs.onCreated.removeListener(callback)
      chrome.tabs.onAttached.removeListener(callback)
      chrome.tabs.onDetached.removeListener(callback)
      chrome.tabGroups.onUpdated.removeListener(callback)
      chrome.tabGroups.onCreated.removeListener(callback)
      chrome.tabGroups.onRemoved.removeListener(callback)
    }
  }, [])
}

export default onTabUpdated
