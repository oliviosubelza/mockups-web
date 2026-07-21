import { useMutation } from '@tanstack/react-query'
import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query'
import { notify } from '@/core/notify'
import { extractApiMessage } from '@/core/http/error'

export interface SafeMutationNotifyOptions {
  successMessage?: string
  errorMessage?: string
  silent?: boolean
}

export function useSafeMutation<
  TData = unknown,
  TError = unknown,
  TVariables = void,
  TContext = unknown,
>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
  notifyOptions: SafeMutationNotifyOptions = {},
): UseMutationResult<TData, TError, TVariables, TContext> {
  const { successMessage, errorMessage, silent = false } = notifyOptions

  return useMutation({
    ...options,
    onSuccess(...args) {
      const [data, variables, context, mutationContext] = args
      if (!silent && successMessage) {
        notify(successMessage, { type: 'success' })
      }
      options.onSuccess?.(data, variables, context, mutationContext)
    },
    onError(...args) {
      const [error, variables, context, mutationContext] = args
      if (!silent) {
        const message = errorMessage ?? extractApiMessage(error)
        notify(message, { type: 'error' })
      }
      options.onError?.(error, variables, context, mutationContext)
    },
  })
}
