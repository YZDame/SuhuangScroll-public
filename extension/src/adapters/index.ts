import { registerAdapter } from './core'
import { DongniAdapter } from './dongni'
import { ReadboyAdapter } from './readboy'
import { ZhixueAdapter } from './zhixue'
import { SyntheticReviewAdapter } from './synthetic'

let registered = false

export function registerBuiltInAdapters(): void {
  if (registered) return
  registerAdapter(ZhixueAdapter)
  registerAdapter(ReadboyAdapter)
  registerAdapter(DongniAdapter)
  registerAdapter(SyntheticReviewAdapter)
  registered = true
}

export { DongniAdapter } from './dongni'
export { ReadboyAdapter } from './readboy'
export { ZhixueAdapter } from './zhixue'
export { SyntheticReviewAdapter } from './synthetic'
