namespace NStorage {
  type AreaName = "sync" | "local" | "managed" | "session"

  namespace Event {
    interface Changes<T = string> {
      [key: T]: chrome.storage.StorageChange
    }
  }

  namespace Sync {
    type GetKey = string | string[] | null

    namespace Response {
      interface Group extends Schema.Group {
        tabs: Schema.Tab[]
      }
    }

    namespace Schema {
      interface Database {
        version: string;
        groups: Group[];
        tabs: Tab[];
        favIcons: FavIcons;
      }

      interface Group {
        id: string;
        title: string;
        order: number;
        createdAt: string;
        updatedAt: string;
        lastOpened?: string;
      }

      interface Tab {
        id: string;
        title: string;
        order: number;
        groupId: string;
        createdAt: string;
        updatedAt: string;
        lastOpened?: string;
      }

      interface FavIcons {
        [key: string]: FavIcon
      }

      interface FavIcon {
        url: string;
        lastOpened: string;
      }
    }
  }
}
