import React from 'react'
import { motion } from 'framer-motion'
import { Search, Disc3, ListMusic, Clock } from 'lucide-react'
import { GlassPanel } from '../components/common/GlassPanel'

interface HomePageProps {
  onNavigate: (page: string) => void
}

export function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="page home-page">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>
          Yachiyo
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '0 0 24px' }}>
          发现好音乐
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
      >
        <h2 className="section-title">快速访问</h2>
        <div className="quick-access-grid">
          <GlassPanel intensity="light" hover className="quick-access-card" onClick={() => onNavigate('search')}>
            <Search size={28} />
            <span>搜索音乐</span>
          </GlassPanel>
          <GlassPanel intensity="light" hover className="quick-access-card" onClick={() => onNavigate('library')}>
            <Disc3 size={28} />
            <span>推荐歌单</span>
          </GlassPanel>
          <GlassPanel intensity="light" hover className="quick-access-card" onClick={() => onNavigate('playlists')}>
            <ListMusic size={28} />
            <span>歌单管理</span>
          </GlassPanel>
          <GlassPanel intensity="light" hover className="quick-access-card" onClick={() => onNavigate('history')}>
            <Clock size={28} />
            <span>播放历史</span>
          </GlassPanel>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.16 }}
      >
        <h2 className="section-title">账号</h2>
        <div className="quick-access-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <GlassPanel intensity="light" hover className="quick-access-card" onClick={() => onNavigate('account')}>
            <span>管理账号</span>
          </GlassPanel>
        </div>
      </motion.div>
    </div>
  )
}
