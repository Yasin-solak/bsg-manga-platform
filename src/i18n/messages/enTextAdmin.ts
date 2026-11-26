import { admin1 } from './en/admin1'
import { admin1b } from './en/admin1b'
import { admin2 } from './en/admin2'
import { admin3 } from './en/admin3'
import { admin4 } from './en/admin4'
import { admin4b } from './en/admin4b'
import { admin5 } from './en/admin5'

/* English texts used only inside the admin panel; loaded with the /admin route (see enText.ts). */
export const enTextAdmin: Record<string, string> = { ...admin1, ...admin1b, ...admin2, ...admin3, ...admin4, ...admin4b, ...admin5 }
