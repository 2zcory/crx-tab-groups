import { defineManifest } from '@crxjs/vite-plugin'
import packageData from '../package.json'

//@ts-ignore
const isDev = process.env.NODE_ENV == 'development'

export default defineManifest({
  name: `${packageData.displayName || packageData.name}${isDev ? ` ➡️ Dev` : ''}`,
  description: packageData.description,
  version: packageData.version,
  manifest_version: 3,
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3iZe9suKhK7iBpT5Do1TtZEy5mItfbWXLSsY5bj54tI9CFf15DZYynLHv73IqjqI71FkG9gX8f7oeNko+lHTNMMRnKG2smQjYEaBv0gw0p46CUQ0dWOlhbqytnXH3tanIjSKvVhNAZUleuEFFR3oN0ZswMvEAlOCIqqYxapx6mt7d2ujxWtwIhDTWrY7FqPs6nk3HaA2fV0xEfw6FI4aaGo2mMsecGC1OXqf2DRtL/bzHfH7rI25T97fKSf68JoxK42tf/TmLMRBsqDAbt/LSQi3I+sYRLtDS0a3UUPHt0ZubsIByioy9+3da5exCCJsauotBL4bomJV65ZwApCuFwIDAQAB',
  icons: {
    16: 'img/logo-16.png',
    32: 'img/logo-32.png',
    48: 'img/logo-48.png',
    128: 'img/logo-128.png',
  },
  action: {
    default_icon: 'img/logo-48.png',
    default_title: 'Open tab groups side panel',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'sidepanel.html',
  },
  web_accessible_resources: [
    {
      resources: ['img/logo-16.png', 'img/logo-32.png', 'img/logo-48.png', 'img/logo-128.png'],
      matches: [],
    },
  ],
  permissions: ['sidePanel', 'tabs', 'tabGroups', 'storage', 'topSites'],
  host_permissions: ['<all_urls>'],
})
