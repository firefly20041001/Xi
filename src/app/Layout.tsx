import React from 'react'
import { Sidebar } from '../components/sidebar/Sidebar'
import { PlayerBar } from '../components/player/PlayerBar'
import { NexTitleBar } from '../components/NexTitleBar'
import { ListNavFab } from '../components/common/ListNavFab'

// NexBox 三层骨架:壁纸层(fixed z0)→ 标题栏/侧栏(fixed 悬浮)→ 内容层(浮在壁纸之上)。
// 页面通过 uiStore.activePage 切换,本组件不再透传导航属性。
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="app-background" />
      <NexTitleBar />
      <Sidebar />
      <main className="nex-content">{children}</main>
      <ListNavFab />
      <PlayerBar />
    </>
  )
}
