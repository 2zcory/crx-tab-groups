import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'

import { cn } from '@/lib/utils'

function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn('relative flex size-6 shrink-0 overflow-hidden rounded-md', className)}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full', className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn('bg-muted flex size-full items-center justify-center rounded-md', className)}
      {...props}
    />
  )
}

interface IProps extends Pick<AvatarPrimitive.AvatarImageProps, 'src'> {
  fallbackString?: string
}

function AvatarIcon(props: IProps) {
  return (
    <Avatar>
      <AvatarImage src={props.src} />
      <AvatarFallback>{props.fallbackString}</AvatarFallback>
    </Avatar>
  )
}

export default AvatarIcon

export { Avatar, AvatarImage, AvatarFallback }
