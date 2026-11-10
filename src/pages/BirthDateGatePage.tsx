import { useState } from 'react'
import { CalendarDays, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { checkBirthDate, isAdultAge, MIN_AGE } from '@/lib/birthDate'
import { setMyBirthDate } from '@/services/birthDateService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { txa } from '@/i18n/activeLocale'

/**
 * Age gate: the birth date is asked once.
 *
 * Adding a field to the signup form only solves NEW users. No existing
 * user has a date; without asking them 18+ content stays closed to everyone
 * and the gate is meaningless. Social sign-in and email-verified
 * signup also open accounts without visiting the form.
 *
 * So the GUARANTEE is here: Layout takes every session without a date here.
 * The form "collects", the gate "guarantees".
 */

export default function BirthDateGatePage() {
  const { currentUser, updateCurrentUser } = useAuth()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const check = checkBirthDate(value)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!check.valid) {
      setError(check.message)
      return
    }

    setSubmitting(true)
    try {
      const saved = await setMyBirthDate(value)
      // Update the context immediately: otherwise Layout sends the user back to
      // the same gate, creating a loop.
      updateCurrentUser({ birthDate: saved })
    } catch (submitError) {
      setError(toUserFacingErrorMessage(submitError, txa('Doğum tarihi kaydedilemedi.')))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-5 py-10"
      data-testid="birth-date-gate"
    >
      <div className="w-full max-w-[440px] rounded-[20px] border border-border bg-card p-6 shadow-lg sm:p-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            {txa('Tek seferlik')}
          </span>
        </div>

        <h1 className="m-0 text-2xl font-black tracking-tight text-foreground">
          {txa('Doğum tarihin nedir?')}
        </h1>
        <p className="m-0 mt-2 text-sm leading-6 text-muted-foreground">
          {txa('Yaşa uygun içerik gösterebilmemiz için gerekli.')}
          {currentUser?.username ? txa(' @{username} hesabına bir kez kaydedilir.', { username: currentUser.username }) : ''}
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => { void handleSubmit(event) }}>
          <div className="space-y-1.5">
            <Label htmlFor="birth-date-gate-input">{txa('Doğum tarihi')}</Label>
            <Input
              id="birth-date-gate-input"
              type="date"
              autoComplete="bday"
              value={value}
              onChange={(event) => { setValue(event.target.value); setError(null) }}
              max={new Date().toISOString().slice(0, 10)}
              required
            />
            {/*
              Sonucu ONCEDEN soyluyoruz: kullanici neyi kabul ettigini
              gormeden "bir kez yazilir" bir alani doldurmamali.
            */}
            {check.valid ? (
              <p className="m-0 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {txa('{v1} yaşındasın —', { v1: check.age ?? '' })}{' '}
                {isAdultAge(check.age)
                  ? txa('18+ etiketli seriler de görünür.')
                  : txa('18+ etiketli seriler gizli kalır.')}
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="m-0 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={submitting} className="h-11 w-full font-extrabold">
            {submitting ? txa('Kaydediliyor...') : txa('Kaydet ve devam et')}
          </Button>

          <p className="m-0 text-center text-[11px] leading-5 text-muted-foreground">
            {txa('Bir kez kaydedilir ve sonradan değiştirilemez. {v1} yaşından', { v1: MIN_AGE })}
            {txa('küçükler BSG Manga\'yı kullanamaz.')}
          </p>
        </form>
      </div>
    </div>
  )
}
