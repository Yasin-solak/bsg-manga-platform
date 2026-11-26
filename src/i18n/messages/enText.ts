import { tamam2 } from './en/tamam2'
import { tamam } from './en/tamam'
import { veritabani3 } from './en/veritabani3'
import { ortak3 } from './en/ortak3'
import { ortak2 } from './en/ortak2'
import { veritabani2 } from './en/veritabani2'
import { veritabani } from './en/veritabani'
import { servis } from './en/servis'
import { ortak } from './en/ortak'
import { politika } from './en/politika'
import { yardim } from './en/yardim'
import { ayarlar } from './en/ayarlar'
import { topluluk } from './en/topluluk'
import { profil } from './en/profil'
import { magaza } from './en/magaza'
import { fansub } from './en/fansub'
import { sayfalar } from './en/sayfalar'
import { kabuk } from './en/kabuk'
import { seri } from './en/seri'
import { kesfet } from './en/kesfet'
import { giris } from './en/giris'

/*
  Sayfa icerikleri icin metin tabanli ceviri (gettext tarzi): anahtar Turkce
  metnin kendisi. `tx('Devam et')`; degiskenler `{ad}` ile. Turkcede metin oldugu
  gibi gosterilir. Kaynaktaki her tx(...) metninin burada karsiligi olmali
  (i18n-text contract'i denetler).

  This is the CORE dictionary: every English page downloads it before the first render.
  Texts used only inside a panel live in enTextAdmin / enTextManage / enTextStudio and load
  with that panel. A text may sit in a panel dictionary only when every file that uses it is
  reachable through that panel alone (i18n-dictionary-parts contract); when unsure, add it here.
*/
export const enText: Record<string, string> = { ...kabuk, ...seri, ...kesfet, ...giris, ...sayfalar, ...fansub, ...magaza, ...profil, ...topluluk, ...ayarlar, ...yardim, ...politika, ...ortak, ...servis, ...veritabani, ...veritabani2, ...ortak2, ...ortak3, ...veritabani3, ...tamam, ...tamam2 }
