namespace NStorage {
  type AreaName = 'sync' | 'local' | 'managed' | 'session'

  namespace Event {
    interface Changes<T = string> {
      [key: T]: chrome.storage.StorageChange
    }
  }

  namespace Sync {
    type GetKey = string | string[] | null

    type GroupColor =
      | 'grey'
      | 'blue'
      | 'red'
      | 'yellow'
      | 'green'
      | 'pink'
      | 'purple'
      | 'cyan'
      | 'orange'

    namespace Response {
      interface Group extends Schema.Group {
        tabs: Schema.Tab[]
      }
    }

    namespace Schema {
      interface Database {
        version: string
        groups: Group[]
        tabs: Tab[]
        favIcons: FavIcons
        autoGroups: AutoGroupRule[]
      }

      interface AutoGroupRule {
        id: string
        title: string
        color: GroupColor
        order: number
        urlPatterns: string[]
        urlPattern?: string
        isActive: boolean
        createdAt: string
      }

      interface Group {
        id: string
        title: string
        order: number
        color?: GroupColor
        createdAt: string
        updatedAt: string
        lastOpened?: string
      }

      interface Tab {
        id: string
        title: string
        url?: string
        favIconUrl?: string
        order: number
        groupId: string
        isRepaired?: boolean
        createdAt: string
        updatedAt: string
        lastOpened?: string
      }

      interface FavIcons {
        [key: string]: FavIcon
      }

      interface FavIcon {
        url: string
        lastOpened: string
      }
    }
  }

  namespace Local {
    interface AutoGroupOwnershipEntry {
      ruleId: string
      windowId: number
      groupId: number
      title: string
      color: Sync.GroupColor
      updatedAt: string
    }

    interface AutoGroupAuditEntry {
      id: string
      createdAt: string
      ruleId?: string
      ruleTitle?: string
      windowId?: number
      tabId?: number
      url?: string
      outcome: 'ignored' | 'no_match' | 'already_grouped' | 'grouped' | 'error'
      reason: string
      groupId?: number
      groupCreated?: boolean
      matchedPattern?: string
      message?: string
    }
  }
}
