// 推荐歌单页（壳）：内容已下线（原日推/排行榜及其推荐代码已移除），页面保留待后续规划。
import React from 'react'
import { motion } from 'framer-motion'
import { Music } from 'lucide-react'
import { GlassPanel } from '../components/common/GlassPanel'

export function LibraryPage() {
  return (
    <div className="page library-page">
      <motion.div className="page-header" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1>推荐歌单</h1>
      </motion.div>

      <div>
        <GlassPanel intensity="light" className="empty-state">
          <Music size={32} />
          <p>敬请期待</p>
        </GlassPanel>
      </div>
    </div>
  )
}
