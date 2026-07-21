import { AlertCircle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface Props {
  error: Error
  reset: () => void
}

export function ErrorFallback({ error, reset }: Props) {
  const { t } = useTranslation()

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertCircle className="size-10 text-destructive" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold">{t('error.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('error.description')}</p>
      </div>
      {import.meta.env.DEV && (
        <div className="bg-muted border rounded-md p-3 max-h-40 overflow-auto w-full max-w-lg">
          <p className="font-mono text-xs font-semibold text-destructive">
            {error.name}: {error.message}
          </p>
          {error.stack && (
            <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap mt-1">
              {error.stack}
            </pre>
          )}
        </div>
      )}
      <Button onClick={reset} variant="outline" className="gap-2">
        <RefreshCw className="size-4" />
        {t('error.retry')}
      </Button>
    </div>
  )
}
