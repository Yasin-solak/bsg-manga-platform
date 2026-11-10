import type { ComponentProps, ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { txa } from '@/i18n/activeLocale'

interface AdminOverflowMenuProps {
  children: ReactNode
  disabled?: boolean
  label?: string
  align?: 'start' | 'center' | 'end'
  size?: ComponentProps<typeof Button>['size']
}

export function AdminOverflowMenu({
  children,
  disabled = false,
  label = txa('Daha Fazla'),
  align = 'end',
  size = 'sm',
}: AdminOverflowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size={size} disabled={disabled}>
          <MoreHorizontal className="mr-1 h-4 w-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
