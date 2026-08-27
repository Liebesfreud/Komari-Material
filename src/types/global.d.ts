// 构建时注入的全局常量
declare const __BUILD_VERSION__: string
declare const __BUILD_GIT_HASH__: string

export interface MaterialMessageApi {
  success: (content: string) => void
  error: (content: string) => void
  warning: (content: string) => void
  info: (content: string) => void
}

export interface MaterialLoadingBarApi {
  start: () => void
  finish: () => void
  error: () => void
}

export interface MaterialModalOptions {
  title?: string
  content?: () => unknown
  size?: 'medium' | 'large'
  className?: string
  closable?: boolean
  closeOnEsc?: boolean
  maskClosable?: boolean
  [key: string]: unknown
}

export interface MaterialModalApi {
  create: (options: MaterialModalOptions) => void
  destroyAll: () => void
}

export interface MaterialNotificationApi {
  create: (options: { title?: string, content?: string, type?: 'success' | 'error' | 'warning' | 'info' }) => void
  success: (options: { title?: string, content?: string }) => void
  error: (options: { title?: string, content?: string }) => void
  warning: (options: { title?: string, content?: string }) => void
  info: (options: { title?: string, content?: string }) => void
}

export type MaterialDialogApi = MaterialNotificationApi

declare global {
  interface Window {
    $message: MaterialMessageApi
    $dialog: MaterialDialogApi
    $notification: MaterialNotificationApi
    $loadingBar: MaterialLoadingBarApi
    $modal: MaterialModalApi
  }
}
