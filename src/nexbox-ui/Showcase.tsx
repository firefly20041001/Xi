// NexBox 风格组件展示页(设计基座预览)。
// 仅使用本地静态演示数据与本地交互,不调用后端命令。
import React, { useState } from 'react'
import {
  Play,
  SkipBack,
  Heart,
  Trash2,
  Info,
  ListPlus,
  Search,
  Home,
  Settings,
  BarChart3,
  Library
} from 'lucide-react'
import {
  NBButton,
  NBIconButton,
  NBInput,
  NBGlassPanel,
  NBCard,
  NBNavItem,
  NBWindowButtons,
  NBContextMenu,
  NBSwitch,
  NBCheckbox,
  NBSlider,
  NBTooltip,
  NBKbd,
  NBChevron,
} from './nb'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 14px', color: 'var(--nbf-fg)' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ children, gap = 12 }: { children: React.ReactNode; gap?: number }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap, flexWrap: 'wrap' }}>{children}</div>
}

const DEMO_TRACKS = [
  { name: '晚风', artist: '示例歌手 A', duration: '3:45' },
  { name: '蓝色时刻', artist: '示例歌手 B', duration: '4:12' },
  { name: '远方的海', artist: '示例歌手 C', duration: '3:58' },
  { name: '星河来信', artist: '示例歌手 D', duration: '4:31' }
]

// 演示用本地封面(渐变占位,不使用远程图片)
function DemoCover({ hue, label }: { hue: number; label: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `linear-gradient(135deg, hsl(${hue}, 70%, 72%), hsl(${hue + 40}, 65%, 58%))`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: 22,
        fontWeight: 600,
        textShadow: '0 1px 4px rgba(0,0,0,.25)'
      }}
    >
      {label}
    </div>
  )
}

export function Showcase() {
  const [scheme, setScheme] = useState<'light' | 'dark'>('light')
  const [inputValue, setInputValue] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const [switchOn, setSwitchOn] = useState(true)
  const [checkbox, setCheckbox] = useState(true)
  const [slider, setSlider] = useState(42)
  const [navActive, setNavActive] = useState('home')
  const [menuMsg, setMenuMsg] = useState('')

  return (
    <div className="nb-scope" data-nb-scheme={scheme}>
      <div
        style={{
          maxWidth: 980,
          margin: '0 auto',
          padding: '28px 24px 80px'
        }}
      >
        {/* 顶栏:标题 + 主题切换 + 窗口控制展示 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 30
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--nbf-fg)' }}>
            希 组件展示
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--nbf-fg-muted)', marginLeft: 10 }}>
              NexBox 设计基座 · 独立预览页
            </span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <NBButton
              variant="glass"
              onClick={() => setScheme((s) => (s === 'light' ? 'dark' : 'light'))}
            >
              切换到{scheme === 'light' ? '深色' : '浅色'}
            </NBButton>
            <NBWindowButtons
              onMinimize={() => setMenuMsg('演示环境:最小化不可用')}
              onMaximize={() => setMenuMsg('演示环境:最大化不可用')}
              onClose={() => setMenuMsg('演示环境:关闭不可用')}
            />
          </div>
        </div>

        {/* 1. 颜色、主题与玻璃材质 */}
        <Section title="1. 颜色、主题与玻璃材质">
          <NBGlassPanel padding={16}>
            <Row gap={14}>
              {[
                { k: '--nbf-glass-bg', v: 'var(--nbf-glass-bg)', n: '玻璃底' },
                { k: 'strong', v: 'var(--nbf-glass-bg-strong)', n: '玻璃强' },
                { k: 'solid', v: 'var(--nbf-panel-solid)', n: '实底' },
                { k: 'accent', v: 'var(--nbf-accent-active)', n: '强调色' },
                { k: 'hover', v: 'var(--nbf-accent-hover)', n: '强调 hover' },
                { k: 'danger', v: 'var(--nbf-danger-bg)', n: '危险底' }
              ].map((c) => (
                <div key={c.k} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: 72,
                      height: 48,
                      borderRadius: 10,
                      background: c.v,
                      border: '1px solid var(--nbf-glass-border)'
                    }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--nbf-fg-muted)', marginTop: 6 }}>{c.n}</div>
                </div>
              ))}
            </Row>
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--nbf-fg-muted)' }}>
              当前方案:{scheme === 'dark' ? '深色' : '浅色'} · 玻璃材质 =
              背景透明度 + blur(var(--nbf-blur-glass)) saturate(1.4) + 细边框
            </div>
          </NBGlassPanel>
        </Section>

        {/* 2. 排版 */}
        <Section title="2. 排版">
          <NBGlassPanel>
            <div style={{ fontSize: 22, fontWeight: 700 }}>headline 22 / 700 — 页面主标题</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>titleLarge 18 / 600 — 分区标题</div>
            <div style={{ fontSize: 15, fontWeight: 500, marginTop: 8 }}>titleMedium 15 / 500 — 卡片标题</div>
            <div style={{ fontSize: 14, marginTop: 8 }}>bodyLarge 14 / 400 — 列表主文本</div>
            <div style={{ fontSize: 12.5, color: 'var(--nbf-fg-muted)', marginTop: 6 }}>
              bodySmall 12.5 / 400 — 辅助说明文字(颜色 onSurfaceVariant)
            </div>
          </NBGlassPanel>
        </Section>

        {/* 3. 按钮和图标按钮 */}
        <Section title="3. 按钮和图标按钮">
          <NBGlassPanel>
            <Row>
              <NBButton variant="accent">立即播放</NBButton>
              <NBButton variant="glass">玻璃按钮</NBButton>
              <NBButton variant="solid">实底按钮</NBButton>
              <NBButton variant="ghost">幽灵按钮</NBButton>
              <NBButton variant="glass" disabled>
                禁用
              </NBButton>
              <NBButton variant="glass" danger>
                危险操作
              </NBButton>
            </Row>
            <Row style={{ marginTop: 16 }}>
              <NBTooltip label="播放/暂停">
                <NBIconButton
                  icon={<Play size={20} fill="currentColor" />}
                  title="播放/暂停"
                  variant="window"
                />
              </NBTooltip>
              <NBTooltip label="上一首">
                <NBIconButton icon={<SkipBack size={20} />} title="上一首" variant="ghost" />
              </NBTooltip>
              <NBTooltip label="收藏(演示)">
                <NBIconButton icon={<Heart size={20} fill="currentColor" />} title="收藏" variant="ghost" />
              </NBTooltip>
              <NBTooltip label="危险操作">
                <NBIconButton icon={<Trash2 size={20} />} title="删除" variant="window" danger />
              </NBTooltip>
            </Row>
          </NBGlassPanel>
        </Section>

        {/* 4. 输入框和搜索框 */}
        <Section title="4. 输入框和搜索框">
          <NBGlassPanel>
            <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
              <NBInput
                value={inputValue}
                onChange={setInputValue}
                placeholder="普通输入框(焦点时边框为强调色)"
              />
              <NBInput
                value={searchValue}
                onChange={setSearchValue}
                onClear={() => setSearchValue('')}
                placeholder="搜索歌曲、歌手、专辑、歌单…"
                icon={
                  <Search size={18} style={{ color: 'var(--nbf-fg-muted)' }} />
                }
                kbd="Ctrl K"
              />
              <NBInput value="" onChange={() => {}} placeholder="禁用状态" disabled />
            </div>
          </NBGlassPanel>
        </Section>

        {/* 5. 卡片与玻璃面板 */}
        <Section title="5. 卡片与玻璃面板">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {DEMO_TRACKS.map((t, i) => (
              <NBCard
                key={t.name}
                title={t.name}
                supporting={`示例 · ${t.artist}`}
                cover={<DemoCover hue={200 + i * 30} label={t.name.slice(0, 1)} />}
              />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
            <NBGlassPanel>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>玻璃面板(常规)</div>
              <div style={{ fontSize: 12.5, color: 'var(--nbf-fg-muted)' }}>
                rgba(玻璃底) + blur + saturate(1.4) + 细边框
              </div>
            </NBGlassPanel>
            <NBGlassPanel strong>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>玻璃面板(加强)</div>
              <div style={{ fontSize: 12.5, color: 'var(--nbf-fg-muted)' }}>
                更高不透明度,用于播放栏等需要更高可读性的区域
              </div>
            </NBGlassPanel>
          </div>
        </Section>

        {/* 6. Tooltip / Dropdown / ContextMenu */}
        <Section title="6. Tooltip / Dropdown / ContextMenu">
          <NBGlassPanel>
            <Row>
              <NBTooltip label="玻璃胶囊提示(悬停显示)">
                <NBButton variant="glass">悬停我(Tip)</NBButton>
              </NBTooltip>
              <NBContextMenu
                trigger={
                  <NBButton variant="glass">
                    上下文菜单 <NBChevron />
                  </NBButton>
                }
                items={[
                  { label: '播放', icon: <Play size={16} />, onSelect: () => setMenuMsg('演示:播放') },
                  { label: '加入队列', icon: <ListPlus size={16} />, onSelect: () => setMenuMsg('演示:加入队列') },
                  { label: '查看歌曲信息', icon: <Info size={16} />, onSelect: () => setMenuMsg('演示:歌曲信息') },
                  { label: '从列表移除', icon: <Trash2 size={20} />, danger: true, onSelect: () => setMenuMsg('演示:移除') }
                ]}
              />
              <NBKbd>Escape 关闭菜单</NBKbd>
              <span style={{ fontSize: 12.5, color: 'var(--nbf-fg-muted)' }}>
                {menuMsg || '菜单选中动作显示在这里'}
              </span>
            </Row>
          </NBGlassPanel>
        </Section>

        {/* 7. Slider / Switch / Checkbox */}
        <Section title="7. Slider / Switch / Checkbox">
          <NBGlassPanel>
            <Row gap={28}>
              <NBCheckbox checked={checkbox} onChange={setCheckbox} label="复选框(演示)" />
              <NBSwitch checked={switchOn} onChange={setSwitchOn} label="液态玻璃开关(演示)" />
              <NBSlider value={slider} onChange={setSlider} label="滑块(演示)" />
              <span style={{ fontSize: 12.5, color: 'var(--nbf-fg-muted)' }}>值:{slider}</span>
            </Row>
          </NBGlassPanel>
        </Section>

        {/* 8. 导航项 + 侧栏局部预览 */}
        <Section title="8. 导航项 / 侧栏局部预览">
          <div style={{ display: 'flex', gap: 20 }}>
            <NBGlassPanel style={{ width: 200 }} padding={10}>
              <div style={{ display: 'grid', gap: 4 }}>
                {[
                  { id: 'home', label: '首页', icon: <Home size={20} /> },
                  { id: 'search', label: '搜索', icon: <Search size={20} /> },
                  { id: 'playlists', label: '歌单', icon: <Library size={20} /> },
                  { id: 'charts', label: '排行榜', icon: <BarChart3 size={20} /> },
                  { id: 'settings', label: '设置', icon: <Settings size={20} /> }
                ].map((n) => (
                  <NBNavItem
                    key={n.id}
                    icon={n.icon}
                    label={n.label}
                    active={navActive === n.id}
                    onClick={() => setNavActive(n.id)}
                  />
                ))}
              </div>
            </NBGlassPanel>
            <NBGlassPanel style={{ width: 200 }} padding={10}>
              <div style={{ display: 'grid', gap: 4 }}>
                <NBNavItem icon={<Home size={20} />} label="首页" showLabel={false} />
                <NBNavItem
                  icon={<Search size={20} />}
                  label="搜索"
                  showLabel={false}
                  active
                />
                <NBNavItem icon={<Settings size={20} />} label="设置" showLabel={false} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--nbf-fg-muted)', marginTop: 8, textAlign: 'center' }}>
                折叠态(仅图标)
              </div>
            </NBGlassPanel>
          </div>
        </Section>

        {/* 9. 窗口控制按钮 */}
        <Section title="9. 窗口控制按钮">
          <NBGlassPanel>
            <Row>
              <NBWindowButtons
                onMinimize={() => setMenuMsg('演示:最小化')}
                onMaximize={() => setMenuMsg('演示:最大化')}
                onClose={() => setMenuMsg('演示:关闭(红 hover)')}
              />
              <span style={{ fontSize: 12.5, color: 'var(--nbf-fg-muted)' }}>
                36px 圆钮 · 白/黑 .8 底 + blur(10px) · 关闭钮悬停红色 · {menuMsg || '悬停查看反馈'}
              </span>
            </Row>
          </NBGlassPanel>
        </Section>

        {/* 10. 交互状态对照 */}
        <Section title="10. 交互状态对照">
          <NBGlassPanel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, fontSize: 12.5 }}>
              {[
                { s: '默认', bg: 'var(--nbf-glass-bg)', fg: 'var(--nbf-fg)' },
                { s: '悬停', bg: 'var(--nbf-accent-hover)', fg: 'var(--nbf-fg)' },
                { s: '选中/激活', bg: 'var(--nbf-accent-active)', fg: 'var(--nbf-accent-contrast)' },
                { s: '禁用', bg: 'var(--nbf-glass-bg)', fg: 'var(--nbf-fg-muted)' }
              ].map((x) => (
                <div key={x.s}>
                  <div
                    style={{
                      height: 44,
                      borderRadius: 'var(--nbf-radius-panel)',
                      background: x.bg,
                      color: x.fg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid var(--nbf-glass-border)'
                    }}
                  >
                    {x.s}
                  </div>
                  <div style={{ textAlign: 'center', color: 'var(--nbf-fg-muted)', marginTop: 6 }}>{x.s}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--nbf-fg-muted)' }}>
              键盘焦点:Tab 聚焦任意控件可看到强调色焦点环 · 悬停浮层有 150ms 延迟 ·
              动效时长 0.15–0.3s · 遵循系统减少动态效果设置
            </div>
          </NBGlassPanel>
        </Section>
      </div>
    </div>
  )
}
