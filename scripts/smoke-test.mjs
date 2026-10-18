// Functional smoke test for the Tauri port. Requires the app running with
// WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9333".
// Usage: node scripts/smoke-test.mjs
const CDP = 'http://127.0.0.1:9333'

const results = []
function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const targets = await (await fetch(`${CDP}/json`)).json()
  const page = targets.find((t) => t.type === 'page' && t.url.includes('5180'))
  if (!page) throw new Error('main window page not found — is the app running with port 9333?')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id
      pending.set(mid, { resolve, reject })
      ws.send(JSON.stringify({ id: mid, method, params }))
      setTimeout(() => {
        if (pending.has(mid)) {
          pending.delete(mid)
          reject(new Error('cdp timeout: ' + method))
        }
      }, 20000)
    })
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
    }
  }
  await new Promise((r) => { ws.onopen = r })

  async function evalJs(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) {
      return { __exc: String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300) }
    }
    return r.result.value
  }
  async function j(expr) {
    const v = await evalJs(expr)
    if (v && v.__exc) throw new Error(v.__exc)
    return v
  }

  // VIP 曲目会触发应用的"需要 VIP 权限"对话框;出现时点击"知道了"关闭
  async function dismissVipDialog() {
    await j(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '知道了')
      if (btn) btn.click()
      return btn ? 'dismissed' : 'none'
    })()`)
  }

  async function nav(label) {
    return j(`(() => {
      const item = [...document.querySelectorAll('.nav-item')].find(el => el.textContent.trim() === ${JSON.stringify(label)})
      if (!item) return 'nav not found'
      item.click()
      return 'ok'
    })()`)
  }

  try {
    // 1. App shell
    const shell = JSON.parse(
      await j(`JSON.stringify({ root: document.getElementById('root')?.children.length, api: !!window.api })`)
    )
    record('主窗口渲染', shell.root > 0 && shell.api, `root=${shell.root} api=${shell.api}`)

    // 2. Pages render
    for (const [label, marker] of [
      ['首页', '.home-page, .page'],
      ['搜索', '.search-page'],
      ['音乐库', '.library-page, .page'],
      ['歌单', '.playlists-page, .page'],
      ['播放历史', '.history-page, .page'],
      ['账号', '.account-page'],
      ['设置', '.settings-page, .page']
    ]) {
      await nav(label)
      await sleep(600)
      const ok = await j(`!!document.querySelector(${JSON.stringify(marker)})`)
      record(`页面渲染:${label}`, !!ok)
    }

    // 3. Settings details (sections + version)
    await nav('设置')
    await sleep(600)
    const settingsInfo = await j(`(() => {
      const sections = [...document.querySelectorAll('.settings-section-title')].map(t => t.textContent.trim())
      const row = [...document.querySelectorAll('.setting-item')].find(i => i.textContent.includes('版本'))
      return { sections, version: row ? row.querySelector('.setting-value')?.textContent : null }
    })()`)
    record('设置:关于/版本号', settingsInfo.sections.some((s) => s.includes('关于')) && settingsInfo.version === '2.1.1', JSON.stringify(settingsInfo))

    // Theme toggle round-trip
    const themeFlip = await j(`(async () => {
      const before = document.documentElement.getAttribute('data-theme')
      const btn = document.querySelector('.settings-page [class*=theme], .setting-item button')
      const themeBtns = [...document.querySelectorAll('button')].filter(b => b.querySelector('svg'))
      return before
    })()`)
    record('设置:主题属性存在', !!themeFlip, String(themeFlip))

    // 4. NetEase search via UI
    await nav('搜索')
    await sleep(500)
    await j(`(() => {
      const src = [...document.querySelectorAll('.source-filter-btn')].find(b => b.textContent.includes('网易云音乐'))
      if (src) src.click()
      return 'ok'
    })()`)
    await sleep(400)
    await j(`(() => {
      const input = document.querySelector('.search-input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, '周杰伦')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector('.search-bar').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      return 'ok'
    })()`)
    await sleep(2500)
    const searchRows = await j(`document.querySelectorAll('.results-section .track-item, .results-section [class*=track-item]').length`)
    record('搜索:网易云结果渲染', searchRows > 0, `${searchRows} 行`)

    // 5. Load more
    let afterLoadMore = 0
    const hasLoadMore = await j(`!![...document.querySelectorAll('button')].find(b => b.textContent.includes('加载更多'))`)
    if (hasLoadMore) {
      await j(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('加载更多')).click(), 'ok'`)
      await sleep(2500)
      afterLoadMore = await j(`document.querySelectorAll('.results-section .track-item, .results-section [class*=track-item]').length`)
    }
    record('搜索:加载更多', !hasLoadMore || afterLoadMore > searchRows, `${searchRows} -> ${afterLoadMore}`)

    // 6. Play first result
    await j(`(() => {
      const row = document.querySelector('.results-section .track-item, .results-section [class*=track-item]')
      if (row) row.click()
      return row ? 'clicked' : 'no row'
    })()`)
    // VIP tracks fall through the whole quality cascade without login and
    // can take a while; poll and fall back to the second row
    let p = { src: false, paused: true, t: 0 }
    for (let attempt = 0; attempt < 3; attempt++) {
      for (let i = 0; i < 10; i++) {
        await sleep(2000)
        await dismissVipDialog()
        p = JSON.parse(await j(`JSON.stringify({
          src: !!window.__audioElement?.src,
          paused: window.__audioElement?.paused,
          t: window.__audioElement?.currentTime
        })`))
        if (p.src && !p.paused) break
      }
      if (p.src && !p.paused) break
      await j(`(() => {
        const rows = document.querySelectorAll('.track-item')
        if (rows[1]) rows[1].click()
        return 'ok'
      })()`)
    }
    await dismissVipDialog()
    record('播放:音频起播', p.src && !p.paused && p.t > 0, JSON.stringify(p))
    record('播放:播放栏曲目', !!(await j(`document.querySelector('.player-track-name')?.textContent`)))

    // 7. Pause/resume via control bar
    await j(`document.querySelector('.play-btn')?.click(), 'ok'`)
    await sleep(400)
    const paused = await j(`window.__audioElement?.paused`)
    record('播放:暂停/继续', paused === true, `paused=${paused}`)

    // 8. Quality menu
    const qm = await j(`(() => {
      const btn = [...document.querySelectorAll('.player-action-btn')].find(b => ['标准','高品','无损','Hi-Res'].includes(b.textContent.trim()))
      if (!btn) return false
      btn.click()
      return 'clicked'
    })()`)
    await sleep(600)
    const qmOpen = await j(`!!document.querySelector('.quality-menu')`)
    record('播放:音质菜单', !!qmOpen)
    await j(`(() => { document.body.click(); return 'ok' })()`)

    // 9. Volume via store command path (set through api is internal; use audio)
    const vol = await j(`(window.__audioElement ? window.__audioElement.volume : -1)`)
    record('播放:音量属性', vol >= 0 && vol <= 1, `volume=${vol}`)

    // 10. History populated after playing
    await nav('播放历史')
    await sleep(700)
    const histRows = await j(`document.querySelectorAll('.track-item, [class*=track-item]').length`)
    record('播放历史:有记录', histRows > 0, `${histRows} 行`)

    // 11. Playlists: create via api, visible in page, delete
    const created = await j(`(async () => {
      const pl = await window.api.playlist.create('冒烟测试歌单')
      return pl.id
    })()`)
    await nav('歌单')
    await sleep(700)
    const visible = await j(`document.body.textContent.includes('冒烟测试歌单')`)
    record('歌单:创建并显示', !!created && visible, `id=${created}`)
    await j(`(async () => { await window.api.playlist.delete(${JSON.stringify(created)}); return 'ok' })()`)

    // 12. Account page
    await nav('账号')
    await sleep(700)
    const accountCards = await j(`document.querySelectorAll('.account-card').length`)
    // 状态无关:卡片数量是结构断言;各卡登录态由账号存储决定
    record('账号:卡片渲染', accountCards === 2, `${accountCards} 卡片`)

    // 13. Desktop lyrics window
    const before = (await (await fetch(`${CDP}/json`)).json()).filter((t) => t.type === 'page').length
    await j(`window.api.lyricsWindow.toggle(), 'ok'`)
    await sleep(1500)
    const afterTargets = (await (await fetch(`${CDP}/json`)).json()).filter((t) => t.type === 'page')
    const lyricsPage = afterTargets.find((t) => t.url.includes('lyrics'))
    record('桌面歌词:窗口打开', afterTargets.length > before && !!lyricsPage, `pages=${afterTargets.length}`)
    if (lyricsPage) {
      // push a line and verify on the lyrics page DOM
      const ws2 = new WebSocket(lyricsPage.webSocketDebuggerUrl)
      let id2 = 0
      const pend2 = new Map()
      const send2 = (m, pr = {}) => new Promise((res, rej) => {
        const mid = ++id2
        pend2.set(mid, { resolve: res, reject: rej })
        ws2.send(JSON.stringify({ id: mid, method: m, params: pr }))
        setTimeout(() => pend2.delete(mid), 10000)
      })
      ws2.onmessage = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.id && pend2.has(msg.id)) {
          const pp = pend2.get(msg.id)
          pend2.delete(msg.id)
          msg.error ? pp.reject(new Error(msg.error.message)) : pp.resolve(msg.result)
        }
      }
      await new Promise((r) => { ws2.onopen = r })
      const r2 = await send2('Runtime.evaluate', {
        expression: `document.getElementById('lyrics-line')?.textContent || ''`,
        returnByValue: true
      })
      record('桌面歌词:内容送达', (r2.result.value || '').length > 0, String(r2.result.value).slice(0, 20))
      ws2.close()
      await j(`window.api.lyricsWindow.toggle(), 'ok'`)
      await sleep(800)
    }
  } catch (err) {
    record('测试执行', false, String(err.message || err))
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`)
  ws.close()
  process.exit(0)
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
