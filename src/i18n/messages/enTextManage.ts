import { yonetim } from './en/yonetim'
import { yonetim2 } from './en/yonetim2'
import { yonetim3 } from './en/yonetim3'

/* English texts used only inside the fansub management panel; loaded with that route (see enText.ts). */
export const enTextManage: Record<string, string> = { ...yonetim, ...yonetim2, ...yonetim3 }
