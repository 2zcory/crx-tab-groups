import { ReactNode } from "react"

interface IProps {
  children: ReactNode
}
function GroupListItem(props: IProps) {
  return (
    <div>{props.children}</div>
  )
}

export default GroupListItem
