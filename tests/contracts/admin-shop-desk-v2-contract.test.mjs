import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (relativePath) => readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

const page = read('src/pages/AdminPage.tsx')
const section = read('src/components/admin/shop/AdminShopSection.tsx')
const format = read('src/components/admin/shop/shopAdminFormat.ts')
const products = read('src/components/admin/shop/ShopAdminProducts.tsx')
const productPane = read('src/components/admin/shop/ShopProductDetailPane.tsx')
const orders = read('src/components/admin/shop/ShopAdminOrders.tsx')

// Shop v2 (2026-11-03): Products, Bundles and Orders in desk layout; only
// in these tabs the page is fixed to screen height, other tabs are in normal flow.
assert.match(format, /export const SHOP_DESK_TABS: ShopAdminTab\[\] = \['products', 'bundles', 'orders'\]/)
assert.match(page, /activeSection === 'store' && SHOP_DESK_TABS\.includes\(shopTab as ShopAdminTab\)/)
assert.match(section, /deskTab && 'xl:min-h-0 xl:flex-1'/)
assert.match(section, /<AdminSectionHeader/)
assert.match(section, /flex w-fit max-w-full flex-wrap/, 'the tab strip must not overflow and clip')

for (const desk of [products, orders]) {
  assert.match(desk, /useDeskLayout\(\)/)
  assert.match(desk, /xl:grid-rows-\[minmax\(0,1fr\)\]/)
  assert.match(desk, /min-h-0 divide-y divide-border\/50 overflow-y-auto/)
  assert.match(desk, /onOpenAutoFocus=\{focusSheetContainer\}/)
  assert.doesNotMatch(desk, /<table/, 'Genis tablo (yatay kaydirma) yerine liste + ayrinti')
}
assert.match(products, /export const PRODUCTS_PER_PAGE = 20\b/)
assert.match(orders, /export const ORDERS_PER_PAGE = 20\b/)

// Status changes (single and bulk) through a dialog explaining the result.
assert.match(products, /<AdminConfirmDialog/)
assert.match(products, /alanların envanteri etkilenmez/)
assert.match(products, /destructive: status === 'archived'/)
assert.match(products, /yine de yayınlanır/, 'warns when publishing an invalid product')
assert.match(productPane, /data-testid="shop-product-issues"/)

// Refund: reason required, result written in the dialog.
assert.match(orders, /reason\.trim\(\)\.length < 3/)
assert.match(orders, /Kullanıcıya bildirim gider\./)

// Colors readable on light theme: admin screens do not use only dark theme colors.
for (const file of ['ShopAdminProducts.tsx', 'ShopProductDetailPane.tsx', 'ShopAdminOrders.tsx', 'ShopAdminOverview.tsx', 'ShopAdminEconomy.tsx', 'ShopAdminMerch.tsx']) {
  const source = read(`src/components/admin/shop/${file}`)
  assert.doesNotMatch(source, /(?<![:\w-])text-(rose|amber|violet|sky|emerald)-300\b/, `${file}: text-*-300 only with dark:`)
}
assert.match(format, /ADMIN_RARITY/)

console.log('PASS shop v2 desks (products, bundles, orders; confirm windows, light theme)')
