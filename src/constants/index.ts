import { EMockGroup, ETabMenu } from "@/enums";

export const TAB_MENU: Array<NCommon.Option<ETabMenu>> = [
  {
    value: ETabMenu.TAB_SYNC,
    label: "Tabs Live"
  },
  {
    value: ETabMenu.BOOKMARK,
    label: "Bookmark"
  }
]

export const MOCK_GROUP: Record<EMockGroup, string> = {
  [EMockGroup.PINNED]: "📌 Pinned",
  [EMockGroup.UNGROUP]: "Ungrouped"
}

export const C_URL_SERVICES = [
  "docs.google.com/spreadsheets",
  "translate.google.com",
  "meet.google.com"
]
