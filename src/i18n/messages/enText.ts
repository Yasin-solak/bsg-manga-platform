import { tamam2 } from './en/tamam2'
import { tamam } from './en/tamam'
import { veritabani3 } from './en/veritabani3'
import { ortak2 } from './en/ortak2'
import { veritabani2 } from './en/veritabani2'
import { admin4b } from './en/admin4b'
import { admin4 } from './en/admin4'
import { admin3 } from './en/admin3'
import { admin2 } from './en/admin2'
import { admin1 } from './en/admin1'
import { admin1b } from './en/admin1b'
import { ceviri } from './en/ceviri'
import { yonetim2 } from './en/yonetim2'
import { yonetim } from './en/yonetim'
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
*/
export const enText: Record<string, string> = { ...kabuk, ...seri, ...kesfet, ...giris, ...sayfalar, ...fansub, ...magaza, ...profil, ...topluluk, ...ayarlar, ...yardim, ...politika, ...ortak, ...servis, ...veritabani, ...yonetim, ...yonetim2, ...ceviri, ...admin1, ...admin1b, ...admin2, ...admin3, ...admin4, ...admin4b, ...veritabani2, ...ortak2, ...veritabani3, ...tamam, ...tamam2 }
