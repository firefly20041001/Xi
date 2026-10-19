declare const __APP_VERSION__: string

import { ElectronAPI } from './apiTypes'

declare global {
  interface Window {
    api: ElectronAPI
  }
}

declare module '*.png' {
  const src: string
  export default src
}
