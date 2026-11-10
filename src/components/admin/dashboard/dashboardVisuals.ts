import {
  BookOpen,
  HeartPulse,
  Hourglass,
  MessagesSquare,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { DashboardMetricId } from './dashboardTypes'

interface DashboardMetricVisual {
  icon: LucideIcon
  iconClassName: string
  iconSurfaceClassName: string
}

export const DASHBOARD_METRIC_VISUALS: Record<DashboardMetricId, DashboardMetricVisual> = {
  users: {
    icon: UsersRound,
    iconClassName: 'text-primary',
    iconSurfaceClassName: 'bg-primary/12',
  },
  mangas: {
    icon: BookOpen,
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
    iconSurfaceClassName: 'bg-emerald-500/12',
  },
  community: {
    icon: MessagesSquare,
    iconClassName: 'text-violet-600 dark:text-violet-400',
    iconSurfaceClassName: 'bg-violet-500/12',
  },
  fansubs: {
    icon: ShieldCheck,
    iconClassName: 'text-blue-600 dark:text-blue-400',
    iconSurfaceClassName: 'bg-blue-500/12',
  },
  backlog: {
    icon: Hourglass,
    iconClassName: 'text-amber-600 dark:text-amber-400',
    iconSurfaceClassName: 'bg-amber-500/12',
  },
  'operation-health': {
    icon: HeartPulse,
    iconClassName: 'text-primary',
    iconSurfaceClassName: 'bg-primary/12',
  },
}
