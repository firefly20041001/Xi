import { installApi } from './index'

// Import side effect: must be the first import in every entry so
// window.api exists before any module touches it
installApi()
