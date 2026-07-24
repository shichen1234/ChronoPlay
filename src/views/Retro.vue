<template>
  <div class="retro-container">
    <!-- 顶部标题栏（仅在未开始游戏时显示，保持游戏画面纯粹） -->
    <header v-if="currentView !== 'gameplay'" class="retro-header">
      <div class="header-main-row">
        <div class="header-titles">
          <h2>👾 复古游戏厅</h2>
          <p class="retro-subtitle">纵使新出的游戏越来越多，经典永不过时</p>
        </div>
        <!-- 外接手柄顶部控制条 -->
        <div v-if="connectedGamepads.length > 0" class="gamepad-quick-actions">
          <button 
            v-if="connectedGamepads.length === 1" 
            @click="showControlModal = true" 
            class="btn-gamepad-config btn-gamepad-single"
            title="点击配置外接手柄控制 1P 还是 2P及键盘操作键位"
          >
            <span class="pad-icon">🎮</span>
            <span class="pad-text">更改操作方法 (1手柄连接)</span>
          </button>
          <button 
            v-else-if="connectedGamepads.length >= 2" 
            @click="swapTwoPlayers" 
            class="btn-gamepad-config btn-gamepad-swap"
            :class="{ 'swapped-active': isGamepadSwapped }"
            title="点击互换两个用户操作手柄"
          >
            <span class="pad-icon">🔄</span>
            <span class="pad-text">
              互换两个用户操作：👦1P({{ isGamepadSwapped ? '手柄#2' : '手柄#1' }}) ⇄ 👧2P({{ isGamepadSwapped ? '手柄#1' : '手柄#2' }})
            </span>
          </button>
        </div>
      </div>
    </header>

    <!-- 1. 游戏分类选择视图 -->
    <div v-if="currentView === 'category'" class="category-grid">
      <div 
        v-for="cat in categories" 
        :key="cat.id" 
        class="category-card"
        @click="selectCategory(cat.id)"
      >
        <div class="card-image-wrapper">
          <img :src="cat.cover" :alt="cat.name" class="category-cover-img" />
          <div class="cover-overlay">
            <span class="enter-badge">进入分类</span>
          </div>
        </div>
        <div class="category-info">
          <h3>{{ cat.name }}</h3>
          <p>{{ cat.desc }}</p>
        </div>
      </div>
    </div>

    <!-- 2. 某个分类下的游戏列表视图 -->
    <div v-else-if="currentView === 'gamelist'" class="gamelist-view">
      <div class="view-actions">
        <button @click="backToCategories" class="btn-back-nav">
          <span class="arrow">←</span> 返回分类选择
        </button>
        <span class="category-indicator">
          当前分类：<b>{{ categories.find(c => c.id === selectedCategory)?.name }}</b>
        </span>
      </div>

      <div class="game-grid">
        <div 
          v-for="game in getActiveGames()" 
          :key="game.id" 
          class="game-card"
        >
          <div class="game-cover-wrapper">
            <img :src="game.cover" :alt="game.name" class="game-cover-img" />
          </div>
          <div class="game-card-body">
            <h4>{{ game.name }}</h4>
            <p class="game-desc">{{ game.desc }}</p>
            <button @click="selectGame(game)" class="btn-start-game">
              ⚡ 启动游戏
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 游戏运行视图 -->
    <div v-else-if="currentView === 'gameplay' && selectedGame" class="gameplay-view">
      <!-- 游戏上方状态条与控制按钮 -->
      <div class="gameplay-header">
        <div class="gameplay-title">
          <span class="game-dot"></span>
          正在游玩：<b>{{ selectedGame.name }}</b>
        </div>
        <div class="gameplay-actions">
          <!-- 外接手柄控制栏：没有手柄不显示，1个显示更改操作方法，2个显示互换两用户操作 -->
          <button 
            v-if="connectedGamepads.length === 1" 
            @click="showControlModal = true" 
            class="btn-gamepad-config btn-gamepad-single"
          >
            <span class="pad-icon">🎮</span>
            <span class="pad-text">更改操作方法 (已接1手柄)</span>
          </button>
          <button 
            v-else-if="connectedGamepads.length >= 2" 
            @click="swapTwoPlayers" 
            class="btn-gamepad-config btn-gamepad-swap"
            :class="{ 'swapped-active': isGamepadSwapped }"
          >
            <span class="pad-icon">🔄</span>
            <span class="pad-text">
              互换两个用户操作：👦1P({{ isGamepadSwapped ? '手柄#2' : '手柄#1' }}) ⇄ 👧2P({{ isGamepadSwapped ? '手柄#1' : '手柄#2' }})
            </span>
          </button>

          <button @click="exitGame" class="btn-exit-game">
            🛑 退出并关闭游戏
          </button>
        </div>
      </div>

      <!-- 游戏加载核心运行视窗 -->
      <div class="gameplay-viewport">
        <!-- 3A. NES 游戏渲染容器 (JSNES 模拟器) -->
        <div v-if="selectedGame.type === 'nes'" class="nes-viewport-container">
          <div class="nes-screen-wrapper">
            <canvas id="mario-canvas" width="256" height="240"></canvas>
            <!-- 启动浮层 -->
            <div v-if="!isPlaying" class="start-overlay" @click="startGame">
              <div class="play-btn">▶ 启动 {{ selectedGame?.name || '红白机游戏' }}</div>
            </div>
          </div>
        </div>

        <!-- 3B. 街机游戏渲染容器 (Iframe 隔离加载) -->
        <div v-else class="arcade-viewport-container">
          <div class="iframe-container">
            <iframe 
              :src="getArcadeUrl(selectedGame)" 
              class="emulator-iframe"
              scrolling="no"
              allow="gamepad; autoplay; fullscreen"
              allowfullscreen
            ></iframe>
          </div>
        </div>
      </div>

      <!-- 键位控制面板说明 -->
      <div class="gamepad-instructions-panel">
        <div class="panel-header">{{ getGamepadInstructions(selectedGame).header || '🎮 键盘与手柄按键映射配置表' }}</div>
        <div class="panel-body">
          <div class="player-row">
            <span class="p-badge">{{ getGamepadInstructions(selectedGame).isSinglePlayer ? '掌机操作' : '1P 玩家' }}</span>
            <span class="keys">{{ getGamepadInstructions(selectedGame).p1 }}</span>
          </div>
          <div v-if="!getGamepadInstructions(selectedGame).isSinglePlayer" class="player-row">
            <span class="p-badge p2-badge">2P 玩家</span>
            <span class="keys">{{ getGamepadInstructions(selectedGame).p2 }}</span>
          </div>
        </div>
        <!-- SRM 存档无法读取的提示说明，仅在 GBA 掌机游戏下方显示 -->
        <div v-if="selectedGame?.type === 'gba' || selectedGame?.core === 'mgba' || selectedGame?.rom?.endsWith('.gba')" class="srm-save-warning">
          <span class="warn-icon">💡</span>
          <div class="warn-content">
            <h4>关于存档：由于浏览器内核安全限制，默认的 .srm 卡带/电池保存功能可能无法正常读取。为避免存档丢失，请务必使用游戏画面下方横条菜单中的【保存/加载为 State 文件（快照存档 / Save State）】功能来随时保存进度！</h4>
          </div>
        </div>
      </div>
    </div>

    <!-- 1个外接手柄接入时的操作方法修改与键盘操控设置弹窗 -->
    <div v-if="showControlModal && connectedGamepads.length === 1" class="pad-modal-overlay" @click.self="showControlModal = false">
      <div class="pad-modal-card">
        <div class="pad-modal-header">
          <div class="modal-title-wrap">
            <span class="modal-icon">🎮</span>
            <h3>外接单手柄控制配置</h3>
          </div>
          <button class="btn-close-pad-modal" @click="showControlModal = false">×</button>
        </div>
        <div class="pad-modal-body">
          <div class="pad-status-banner">
            <span class="pad-badge">当前已连接 1 个手柄</span>
            <span class="pad-id">{{ connectedGamepads[0]?.id || '通用游戏手柄' }}</span>
          </div>
          <p class="pad-modal-tip">您可以自由调整该外接手柄控制 1P 还是 2P 角色，同时设置未接入手柄玩家的按键操控方式。</p>

          <div class="config-block">
            <label class="config-label">1. 选择手柄控制目标玩家：</label>
            <div class="pad-options-grid">
              <div 
                class="pad-option-card" 
                :class="{ active: singleGamepadPlayer === 1 }"
                @click="setSingleGamepadPlayer(1)"
              >
                <div class="option-header">
                  <span class="player-avatar">👦</span>
                  <h4>控制 1P 玩家 (默认)</h4>
                </div>
                <p>当前接入的外接手柄将操控 1P 角色进行游戏。</p>
              </div>
              <div 
                class="pad-option-card" 
                :class="{ active: singleGamepadPlayer === 2 }"
                @click="setSingleGamepadPlayer(2)"
              >
                <div class="option-header">
                  <span class="player-avatar">👧</span>
                  <h4>控制 2P 玩家</h4>
                </div>
                <p>当前接入的外接手柄将操控 2P 角色进行游戏。</p>
              </div>
            </div>
          </div>

          <div class="config-block">
            <label class="config-label">2. 设置没有使用手柄玩家（{{ singleGamepadPlayer === 1 ? '2P 玩家' : '1P 玩家' }}）的键盘操控方式：</label>
            <div class="pad-options-grid">
              <div 
                class="pad-option-card" 
                :class="{ active: keyboardLayoutForNoPad === 'layout1' }"
                @click="setKeyboardLayoutForNoPad('layout1')"
              >
                <div class="option-header">
                  <span class="kbd-icon">⌨️</span>
                  <h4>W A S D + J K L U I 操控</h4>
                </div>
                <p>使用 W/A/S/D 控制方向移动，J/K/L/U/I 控制出拳射击及动作，Enter 为开始，Shift 为投币或选择。</p>
              </div>
              <div 
                class="pad-option-card" 
                :class="{ active: keyboardLayoutForNoPad === 'layout2' }"
                @click="setKeyboardLayoutForNoPad('layout2')"
              >
                <div class="option-header">
                  <span class="kbd-icon">⌨️</span>
                  <h4>↑ ↓ ← → + 小键盘 1234578 操控</h4>
                </div>
                <p>使用方向键 ↑/↓/←/→ 控制方向移动，小键盘 1/2/3/4/5/7/8 控制动作、跳跃与系统选项功能。</p>
              </div>
            </div>
          </div>
        </div>
        <div class="pad-modal-footer">
          <button class="btn-save-pad-config" @click="showControlModal = false">保存配置并应用</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount, onMounted, nextTick } from 'vue'
import { useGameStore } from '../store/game'

const gameStore = useGameStore()

// 核心视图切换状态
const currentView = ref('category') // 'category' | 'gamelist' | 'gameplay'
const selectedCategory = ref(null)  // 'nes' | 'arcade'
const selectedGame = ref(null)      // 当前运行的 Game 实体

const isPlaying = ref(false)

// 外接手柄控制与配置状态
const connectedGamepads = ref([])
const showControlModal = ref(false)
const singleGamepadPlayer = ref(1) // 当仅接入1个手柄时，手柄操控的玩家：1 -> 1P, 2 -> 2P
const keyboardLayoutForNoPad = ref('layout2') // 没有使用手柄玩家的键盘布局选择：'layout1' (WASD...) 或 'layout2' (上下左右小键盘...)
const isGamepadSwapped = ref(false) // 当接入2个及以上手柄时，是否互换两个手柄对1P和2P的控制

let audioCtx = null
let animationFrameId = null
let currentNes = null
let gamepadPollId = null
let previousGamepadStates = {}

// 1P 和 2P FC 模拟器物理按键映射表
const KEY_MAP_CODE = {
  'KeyW': { player: 1, button: 4 },
  'KeyS': { player: 1, button: 5 },
  'KeyA': { player: 1, button: 6 },
  'KeyD': { player: 1, button: 7 },
  'KeyJ': { player: 1, button: 1 },
  'KeyK': { player: 1, button: 0 },
  'ShiftLeft': { player: 1, button: 2 },
  'ShiftRight': { player: 1, button: 2 },
  'Enter': { player: 1, button: 3 },
  'ArrowUp': { player: 2, button: 4 },
  'ArrowDown': { player: 2, button: 5 },
  'ArrowLeft': { player: 2, button: 6 },
  'ArrowRight': { player: 2, button: 7 },
  'Numpad1': { player: 2, button: 1 },
  'Numpad2': { player: 2, button: 0 },
  'Numpad4': { player: 2, button: 2 },
  'Numpad5': { player: 2, button: 3 },
  'Digit1': { player: 2, button: 1 },
  'Digit2': { player: 2, button: 0 }
}

const KEY_MAP_KEYCODE = {
  87: { player: 1, button: 4 },
  83: { player: 1, button: 5 },
  65: { player: 1, button: 6 },
  68: { player: 1, button: 7 },
  74: { player: 1, button: 1 },
  75: { player: 1, button: 0 },
  16: { player: 1, button: 2 },
  13: { player: 1, button: 3 },
  38: { player: 2, button: 4 },
  40: { player: 2, button: 5 },
  37: { player: 2, button: 6 },
  39: { player: 2, button: 7 },
  97: { player: 2, button: 1 },
  98: { player: 2, button: 0 },
  49: { player: 2, button: 1 },
  50: { player: 2, button: 0 }
}

// 模拟器分类大项数据
const categories = [
  {
    id: 'nes',
    name: 'FC / 红白机经典',
    desc: '限制级小霸王游戏机合集。支持本地 Canvas 渲染、极低延迟音频与双人键盘映射。',
    cover: '/covers/nes_category.png'
  },
  {
    id: 'arcade',
    name: '街机游戏厅 (ARCADE / NeoGeo)',
    desc: '怀旧街机与 NeoGeo 巅峰神作。基于 FinalBurn Neo 核心，支持双打与 100% 离线自托管。',
    cover: '/covers/arcade_category.png'
  },
  {
    id: 'gba',
    name: 'GBA / 掌机经典',
    desc: 'Game Boy Advance 掌机王国传奇神作。基于 mGBA 高清模拟器核心，零延迟沉浸式体验宝可梦世界。',
    cover: '/covers/gba_category.svg'
  }
]

// 经典的 FC 游戏列表
const nesGames = [
  {
    id: 'mario',
    name: '超级马里奥一代',
    desc: '任天堂横版卷轴动作过关经典，操控马里奥通过吃蘑菇强化，越过重重难关拯救蘑菇王国公主。',
    cover: '/covers/mario_cover.png',
    rom: 'mario.nes',
    type: 'nes'
  },
  {
    id: 'contra',
    name: '魂斗罗一代 (Contra)',
    desc: '经典双人协作横版动作射击过关游戏。搭配散弹、激光等多样武器挑战外星武装要塞。',
    cover: '/covers/contra_cover.svg',
    rom: 'contra.nes',
    type: 'nes'
  },
  {
    id: 'super_contra',
    name: '超级魂斗罗 2 代 (Super Contra)',
    desc: '魂斗罗系列续作。加入了俯视角与侧视角切换关卡，拥有多地形射击与关卡选择模式。',
    cover: '/covers/super_contra.svg',
    rom: 'super_contra.nes',
    type: 'nes'
  },
  {
    id: 'battle_city',
    name: '坦克大战 (Battle City)',
    desc: '经典双人合作防守对决游戏。驾驶坦克保卫基地老鹰，击碎砖墙与钢筋，吃星星升级火力。',
    cover: '/covers/battle_city.svg',
    rom: 'battle_city.nes',
    type: 'nes'
  },
  {
    id: 'double_dragon_1',
    name: '双截龙 1 代 (Double Dragon)',
    desc: '街头格斗清关鼻祖大作，讲述比利兄弟为了拯救被绑架的女友，深入黑帮街头展开拳脚与武器格斗的故事。',
    cover: '/covers/double_dragon_1.svg',
    rom: 'double_dragon_1.nes',
    type: 'nes'
  },
  {
    id: 'double_dragon_2',
    name: '双截龙 2 代：复仇 (Double Dragon II)',
    desc: '双截龙系列复仇篇，强化了左右方向不同的攻击判定机制，招牌旋风腿与升龙膝顶动作极具打击感。',
    cover: '/covers/double_dragon_2.svg',
    rom: 'double_dragon_2.nes',
    type: 'nes'
  },
  {
    id: 'double_dragon_3',
    name: '双截龙 3 代：神圣之石 (Double Dragon III)',
    desc: '跨越世界的寻宝之旅。不仅拥有招牌街头格斗连招，在冒险途中还可招募忍者和武士伙伴共同作战。',
    cover: '/covers/double_dragon_3.svg',
    rom: 'double_dragon_3.nes',
    type: 'nes'
  },
  {
    id: 'double_dragon_4',
    name: '超级双截龙 4 代 (Super Double Dragon)',
    desc: '红白机版双截龙续作篇章，结合街机格斗要素，拥有丰富的蓄力攻击系统与多样的街头战斗关卡。',
    cover: '/covers/double_dragon_4.svg',
    rom: 'double_dragon_4.nes',
    type: 'nes'
  },
  {
    id: 'adventure_island_1',
    name: '高桥名人的冒险岛 1 代 (Adventure Island)',
    desc: '经典横版动作过关游戏。高桥名人通过吃水果补充不断消耗的体力，使用石斧与滑板越过丛林陷阱。',
    cover: '/covers/adventure_island_1.svg',
    rom: 'adventure_island_1.nes',
    type: 'nes'
  },
  {
    id: 'adventure_island_2',
    name: '高桥名人的冒险岛 2 代 (Adventure Island II)',
    desc: '冒险岛系列重大升级之作，引入了四只恐龙坐骑伙伴与武器库存储备系统，可玩度大幅上升。',
    cover: '/covers/adventure_island_2.svg',
    rom: 'adventure_island_2.nes',
    type: 'nes'
  },
  {
    id: 'adventure_island_3',
    name: '高桥名人的冒险岛 3 代 (Adventure Island III)',
    desc: '高桥名人经典海岛冒险第三代，新增了三角龙等坐骑与回旋镖武器，关卡路线设计充满挑战与趣味。',
    cover: '/covers/adventure_island_3.svg',
    rom: 'adventure_island_3.nes',
    type: 'nes'
  },
  {
    id: 'adventure_island_4',
    name: '高桥名人的冒险岛 4 代 (Adventure Island IV)',
    desc: '红白机末期极具特色的半开放式动作冒险游戏，拥有非线性探索与多样道具解谜互动，制作精巧。',
    cover: '/covers/adventure_island_4.svg',
    rom: 'adventure_island_4.nes',
    type: 'nes'
  },
  {
    id: 'nekketsu_soccer_1',
    name: '热血足球故事 (Nekketsu Soccer Story)',
    desc: '热血系列竞技搞笑作品。允许使用身体撞击、旋风必杀射门以及专属格斗技，赛场欢笑与热血并存。',
    cover: '/covers/nekketsu_soccer_1.svg',
    rom: 'nekketsu_soccer_1.nes',
    type: 'nes'
  },
  {
    id: 'nekketsu_soccer_2',
    name: '热血足球 2 代：世界杯 (Nintendo World Cup)',
    desc: '热血足球的世界杯竞技版本，带领队伍迎战全球各地的强劲对手，体验节奏极快的热血足球对抗。',
    cover: '/covers/nekketsu_soccer_2.svg',
    rom: 'nekketsu_soccer_2.nes',
    type: 'nes'
  },
  {
    id: 'nekketsu_soccer_3',
    name: '热血足球 3 代：联赛 (Nekketsu Soccer League)',
    desc: '热血足球联赛巅峰之作，加入了风、雨、雷电等天气地形影响，以及双人合体必杀球等进阶机制。',
    cover: '/covers/nekketsu_soccer_3.svg',
    rom: 'nekketsu_soccer_3.nes',
    type: 'nes'
  },
  {
    id: 'chinese_chess',
    name: '中国象棋 (Chinese Chess)',
    desc: '古典中国象棋对弈游戏。遵从楚河汉界“将、士、象、车、马、炮”传统规则，支持挑战电脑对战。',
    cover: '/covers/chinese_chess.svg',
    rom: 'chinese_chess.nes',
    type: 'nes'
  },
  {
    id: 'gomoku',
    name: '五子棋 (Gomoku)',
    desc: '经典五子棋对战游戏。黑白交替落子，先连成五子取胜。操作说明：K / 小键盘 2 下棋，J / 小键盘 1 投降，Shift 选择。',
    cover: '/covers/gomoku.svg',
    rom: 'gomoku.nes',
    type: 'nes'
  }
]

// 经典的街机游戏列表（涵盖合金弹头全系列、拳皇与街头篮球）
const arcadeGames = [
  {
    id: 'dino',
    name: 'Cadillacs & Dinosaurs (恐龙快打)',
    desc: '经典横版动作清关街机过关游戏，四名主角各具特色，可拾取各类枪械打击偷猎者保护恐龙。',
    cover: '/covers/dino_cover.jpg',
    rom: 'dino.zip',
    core: 'fbneo',
    type: 'arcade'
  },
  {
    id: 'kof97',
    name: 'The King of Fighters 97 (拳皇 97)',
    desc: 'SNK 大蛇篇终章对决，拥有 Advanced 和 Extra 两种能量槽模式，出招连招顺畅，对战手感极佳。',
    cover: '/covers/kof97_cover.png',
    rom: 'kof97.zip',
    core: 'fbneo',
    bios: 'neogeo.zip',
    type: 'arcade'
  },
  {
    id: 'kof98',
    name: 'The King of Fighters 98 (拳皇 98)',
    desc: '集结历代人气角色的梦幻格斗大乱斗，取消了剧情限制专注于各角色之间的平衡与连技打磨。',
    cover: '/covers/kof98_cover.png',
    rom: 'kof98h.zip',
    core: 'fbneo',
    bios: 'neogeo.zip',
    type: 'arcade'
  },
  {
    id: 'mslug',
    name: 'Metal Slug 1 (合金弹头 1代)',
    desc: '2D 横版动作射击代表作，极具张力的像素手绘美术与趣味十足的战车交互，带来连贯畅快的战斗体验。',
    cover: '/covers/mslug_cover.svg',
    rom: 'mslug.zip',
    core: 'fbneo',
    bios: 'neogeo.zip',
    type: 'arcade'
  },
  {
    id: 'mslug2',
    name: 'Metal Slug 2 (合金弹头 2代)',
    desc: '加入两大新主角与载具骆驼和垂直机甲，增添了神秘的外星遗迹关卡以及木乃伊特殊变身状态。',
    cover: '/covers/mslug_cover.svg',
    rom: 'mslug2.zip',
    core: 'fbneo',
    bios: 'neogeo.zip',
    type: 'arcade'
  },
  {
    id: 'mslug3',
    name: 'Metal Slug 3 (合金弹头 3代)',
    desc: '拥有高空、深海等多分支路线关卡与庞大巨型 Boss，从地球海岛一路攻入外星母舰，关卡极度饱满。',
    cover: '/covers/mslug_cover.svg',
    rom: 'mslug3.zip',
    core: 'fbneo',
    bios: 'neogeo.zip',
    type: 'arcade'
  },
  {
    id: 'mslug4',
    name: 'Metal Slug 4 (合金弹头 4代)',
    desc: '对战生化恐怖组织，加入了双持冲锋枪新角色与特殊猴子变身状态，维持了系列一贯的快节奏交火。',
    cover: '/covers/mslug_cover.svg',
    rom: 'mslug4.zip',
    core: 'fbneo',
    bios: 'neogeo.zip',
    type: 'arcade'
  },
  {
    id: 'mslug5',
    name: 'Metal Slug 5 (合金弹头 5代)',
    desc: '加入了便捷的地面滑铲动作和全新重装战车，围绕托勒密遗迹与神秘面具展开丛林及地下基地对决。',
    cover: '/covers/mslug_cover.svg',
    rom: 'mslug5.zip',
    core: 'fbneo',
    bios: 'neogeo.zip',
    type: 'arcade'
  },
  {
    id: 'mslugx',
    name: 'Metal Slug X (合金弹头 X)',
    desc: '基于 2 代的强化重制版，重新调整了敌人分布与掉落武器，昼夜变化与节奏衔接更加流畅连贯。',
    cover: '/covers/mslug_cover.svg',
    rom: 'mslugx.zip',
    core: 'fbneo',
    bios: 'neogeo.zip',
    type: 'arcade'
  }
]

// GBA 掌机游戏列表
const gbaGames = [
  {
    id: 'pokemon_firered',
    name: '精灵宝可梦：火红 (Pokémon FireRed)',
    desc: '关都地区的经典物语再临！按键操控：W/A/S/D 移动，K 对话/确认(A)，J 取消/跑步(B)，U/I 为 L/R 键，Shift 选择，Enter 开始。',
    cover: '/covers/pokemon_firered.svg',
    rom: 'pokemon_firered.gba',
    core: 'mgba',
    type: 'gba'
  },
  {
    id: 'pokemon_leafgreen',
    name: '精灵宝可梦：叶绿 (Pokémon LeafGreen)',
    desc: '重温经典宝可梦收集与回合制策略对战。按键操控：W/A/S/D 移动，K 对话/确认(A)，J 取消/跑步(B)，U/I 为 L/R 键，Shift 选择，Enter 开始。',
    cover: '/covers/pokemon_leafgreen.svg',
    rom: 'pokemon_leafgreen.gba',
    core: 'mgba',
    type: 'gba'
  },
  {
    id: 'zelda_minish',
    name: '塞尔达传说：缩小帽 (The Minish Cap)',
    desc: '任天堂与 CAPCOM 强强联手的 GBA 动作解谜巅峰。按键操控：W/A/S/D 移动，J 攻击/挥剑，K 使用盾牌/防守，U/I 为 L/R 键，Shift 选择，Enter 开始。',
    cover: '/covers/zelda_minish.svg',
    rom: '塞尔达传说-缩小帽.gba',
    core: 'mgba',
    type: 'gba'
  },
  {
    id: 'kirby_mirror',
    name: '星之卡比：镜之迷宫 (Kirby & The Amazing Mirror)',
    desc: '经典粉色恶魔高自由度箱庭探索神作。按键操控：W/A/S/D 移动，J 攻击/吸入/变身，K 跳跃/飞翔，U/I 为 L/R 键，Shift 选择，Enter 开始。',
    cover: '/covers/kirby_mirror.svg',
    rom: '星之卡比 - 镜之迷宫.gba',
    core: 'mgba',
    type: 'gba'
  },
  {
    id: 'castlevania_aria',
    name: '恶魔城：晓月圆舞曲 (Castlevania: Aria of Sorrow)',
    desc: 'GBA 恶魔城探索巅峰！按键操控：W/A/S/D 移动，J 挥砍(B)，K 跳跃(A)，U 为 L 闪避，I 为 R 魂能力，Shift 选择，Enter 开始。',
    cover: '/covers/castlevania_aria.svg',
    rom: '059_恶魔城 - 晓月之圆舞曲 (简) [九柳] [!].gba',
    core: 'mgba',
    type: 'gba'
  },
  {
    id: 'fe_binding',
    name: '火焰之纹章：封印之剑 (Fire Emblem: The Binding Blade)',
    desc: '火纹 GBA 三部曲第一弹。按键操控：W/A/S/D 光标移动，K 选中/确认(A)，J 取消/范围(B)，U/I 为 L/R 键，Shift 选择，Enter 开始。',
    cover: '/covers/fe_binding.svg',
    rom: '1火焰纹章_封印之剑.gba',
    core: 'mgba',
    type: 'gba'
  },
  {
    id: 'fe_blazing',
    name: '火焰之纹章：烈火之剑 (Fire Emblem: The Blazing Blade)',
    desc: '火纹 GBA 三部曲第二弹，三主角豪杰史诗！按键操控：W/A/S/D 移动，K 确认(A)，J 取消(B)，U/I 为 L/R 键，Shift 选择，Enter 开始。',
    cover: '/covers/fe_blazing.svg',
    rom: '2火焰纹章-烈火之剑.gba',
    core: 'mgba',
    type: 'gba'
  },
  {
    id: 'fe_sacred',
    name: '火焰之纹章：圣魔之光石 (Fire Emblem: The Sacred Stones)',
    desc: '火纹 GBA 三部曲第三弹，自由大地图探索与分支转职系统！按键操控：W/A/S/D 移动，K 确认(A)，J 取消(B)，U/I 为 L/R 键，Shift 选择，Enter 开始。',
    cover: '/covers/fe_sacred.svg',
    rom: '3火焰纹章_圣魔之光石.gba',
    core: 'mgba',
    type: 'gba'
  },
  {
    id: 'ace_attorney_1',
    name: '逆转裁判 1 (Ace Attorney 1)',
    desc: '法庭推理传奇起点！成步堂龙一首度登台异议！按键操控：W/A/S/D 光标移动，K 选中/质疑/确认(A)，J 举证/后退(B)，U/I 为 L/R 键，Shift 选择，Enter 开始。',
    cover: '/covers/ace_attorney_1.svg',
    rom: '逆转裁判1.gba',
    core: 'mgba',
    type: 'gba'
  },
  {
    id: 'ace_attorney_2',
    name: '逆转裁判 2 (Ace Attorney 2)',
    desc: '心理枷锁机制引入！成步堂龙一与狩魔冥激斗法庭！按键操控：W/A/S/D 光标移动，K 选中/质疑/确认(A)，J 举证/后退(B)，U/I 为 L/R 键，Shift 选择，Enter 开始。',
    cover: '/covers/ace_attorney_2.svg',
    rom: '逆转裁判2.gba',
    core: 'mgba',
    type: 'gba'
  },
  {
    id: 'ace_attorney_3',
    name: '逆转裁判 3 (Ace Attorney 3)',
    desc: 'CAPCOM 法庭辩论推理天花板！成步堂龙一与美柳千奈美的羁绊对决！按键操控：W/A/S/D 光标移动，K 选中/威慑质疑/确认(A)，J 举证/后退(B)，U/I 为 L/R 肩键切换，Shift 选择，Enter 开始。',
    cover: '/covers/ace_attorney.svg',
    rom: '逆转裁判3.gba',
    core: 'mgba',
    type: 'gba'
  }
]

const getActiveGames = () => {
  if (selectedCategory.value === 'nes') return nesGames
  if (selectedCategory.value === 'arcade') return arcadeGames
  if (selectedCategory.value === 'gba') return gbaGames
  return []
}

const selectCategory = (catId) => {
  selectedCategory.value = catId
  currentView.value = 'gamelist'
}

const backToCategories = () => {
  selectedCategory.value = null
  currentView.value = 'category'
}

const selectGame = (game) => {
  selectedGame.value = game
  currentView.value = 'gameplay'
  isPlaying.value = false

  if (game.type === 'nes') {
    nextTick(() => {
      startGame()
    })
  } else {
    nextTick(() => {
      syncControlConfigToIframe()
    })
  }
}

const exitGame = () => {
  cleanupNes()
  selectedGame.value = null
  currentView.value = 'gamelist'
}

// 更改1个手柄控制目标玩家
const setSingleGamepadPlayer = (playerNum) => {
  singleGamepadPlayer.value = playerNum
  // 智能默认调整没有使用手柄玩家的常规按键习惯
  if (playerNum === 1 && keyboardLayoutForNoPad.value === 'layout1') {
    keyboardLayoutForNoPad.value = 'layout2'
  } else if (playerNum === 2 && keyboardLayoutForNoPad.value === 'layout2') {
    keyboardLayoutForNoPad.value = 'layout1'
  }
  syncControlConfigToIframe()
}

// 更改未连接手柄玩家的键盘布局
const setKeyboardLayoutForNoPad = (layout) => {
  keyboardLayoutForNoPad.value = layout
  syncControlConfigToIframe()
}

// 互换两个外接手柄对 1P / 2P 的操控
const swapTwoPlayers = () => {
  isGamepadSwapped.value = !isGamepadSwapped.value
  syncControlConfigToIframe()
}

// 同步外接手柄与按键控制配置到内嵌 Iframe（街机/GBA模拟器）
const syncControlConfigToIframe = () => {
  const iframes = document.querySelectorAll('.emulator-iframe')
  iframes.forEach(iframe => {
    try {
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'UPDATE_CONTROL_CONFIG',
          config: {
            connectedGamepadsCount: connectedGamepads.value.length,
            singleGamepadPlayer: singleGamepadPlayer.value,
            keyboardLayoutForNoPad: keyboardLayoutForNoPad.value,
            isGamepadSwapped: isGamepadSwapped.value
          }
        }, '*')
      }
    } catch (e) {}
  })
}

// 实时轮询浏览器物理外接手柄列表及 NES 游戏手柄控制
const pollGamepadsLoop = () => {
  const rawPads = navigator.getGamepads ? navigator.getGamepads() : []
  const activeList = []
  for (let i = 0; i < rawPads.length; i++) {
    const g = rawPads[i]
    if (g && (g.connected || g.id)) {
      activeList.push({
        index: g.index,
        id: g.id,
        buttons: g.buttons.map(b => ({ pressed: b.pressed || b === 1 || (b.value > 0.5) })),
        axes: Array.from(g.axes || [])
      })
    }
  }

  // 如果连接的手柄数量或ID变更，自动更新并通知底层逻辑
  if (activeList.length !== connectedGamepads.value.length ||
      activeList.some((p, idx) => p.id !== connectedGamepads.value[idx]?.id || p.index !== connectedGamepads.value[idx]?.index)) {
    connectedGamepads.value = activeList
    syncControlConfigToIframe()
  }

  // 针对 NES 模拟器的外接手柄输入轮询驱动
  if (selectedGame.value?.type === 'nes' && isPlaying.value && currentNes && activeList.length > 0) {
    activeList.forEach((g, idx) => {
      let targetPlayer = 1
      if (activeList.length === 1) {
        targetPlayer = singleGamepadPlayer.value
      } else if (activeList.length >= 2) {
        if (!isGamepadSwapped.value) {
          targetPlayer = idx === 0 ? 1 : 2
        } else {
          targetPlayer = idx === 0 ? 2 : 1
        }
      }

      const padKey = `${g.index}_${g.id}`
      if (!previousGamepadStates[padKey]) {
        previousGamepadStates[padKey] = new Array(8).fill(false)
      }
      const prevPressed = previousGamepadStates[padKey]

      // NES 按键映射表 (0:A, 1:B, 2:Select, 3:Start, 4:Up, 5:Down, 6:Left, 7:Right)
      const curPressed = new Array(8).fill(false)
      // D-pad 或双摇杆方向移动支持
      curPressed[4] = (g.buttons[12] && g.buttons[12].pressed) || (g.axes[1] !== undefined && g.axes[1] < -0.5) || (g.axes[3] !== undefined && g.axes[3] < -0.5)
      curPressed[5] = (g.buttons[13] && g.buttons[13].pressed) || (g.axes[1] !== undefined && g.axes[1] > 0.5) || (g.axes[3] !== undefined && g.axes[3] > 0.5)
      curPressed[6] = (g.buttons[14] && g.buttons[14].pressed) || (g.axes[0] !== undefined && g.axes[0] < -0.5) || (g.axes[2] !== undefined && g.axes[2] < -0.5)
      curPressed[7] = (g.buttons[15] && g.buttons[15].pressed) || (g.axes[0] !== undefined && g.axes[0] > 0.5) || (g.axes[2] !== undefined && g.axes[2] > 0.5)
      // A与B动作键 (支持 ABXY 4键：A/X 映射为 NES A，B/Y 映射为 NES B)
      curPressed[0] = (g.buttons[0] && g.buttons[0].pressed) || (g.buttons[2] && g.buttons[2].pressed)
      curPressed[1] = (g.buttons[1] && g.buttons[1].pressed) || (g.buttons[3] && g.buttons[3].pressed)
      // Select(选择/投币) 与 Start(开始) -> 增加肩键(LB/LT/RB/RT)触发，避开按压主页键/视图键弹出 Steam 菜单的问题！
      curPressed[2] = (g.buttons[4] && g.buttons[4].pressed) || (g.buttons[6] && g.buttons[6].pressed) || (g.buttons[8] && g.buttons[8].pressed)
      curPressed[3] = (g.buttons[5] && g.buttons[5].pressed) || (g.buttons[7] && g.buttons[7].pressed) || (g.buttons[9] && g.buttons[9].pressed)

      for (let btn = 0; btn < 8; btn++) {
        if (curPressed[btn] && !prevPressed[btn]) {
          currentNes.buttonDown(targetPlayer, btn)
        } else if (!curPressed[btn] && prevPressed[btn]) {
          currentNes.buttonUp(targetPlayer, btn)
        }
      }
      previousGamepadStates[padKey] = curPressed
    })
  }

  gamepadPollId = requestAnimationFrame(pollGamepadsLoop)
}

// 保存事件处理器引用，方便组件卸载时精确移除，防止内存泄漏
const _onGamepadConnected = () => syncControlConfigToIframe()
const _onGamepadDisconnected = () => syncControlConfigToIframe()

onMounted(() => {
  gamepadPollId = requestAnimationFrame(pollGamepadsLoop)
  window.addEventListener('gamepadconnected', _onGamepadConnected)
  window.addEventListener('gamepaddisconnected', _onGamepadDisconnected)
})

const getGamepadInstructions = (gameOrName) => {
  const name = typeof gameOrName === 'string' ? gameOrName : (gameOrName?.name || '')
  const type = typeof gameOrName === 'string' ? '' : (gameOrName?.type || '')

  if (name.includes('拳皇')) {
    return {
      p1: '移动: W, A, S, D ｜ 招式: U (轻拳) / I (轻脚) / J (重拳) / K (重脚) ｜ 系统: Enter (开始) / Shift (投币)',
      p2: '移动: ↑, ↓, ←, → ｜ 招式: 小键盘 1 (轻拳) / 小键盘 2 (轻脚) / 小键盘 4 (重拳) / 小键盘 5 (重脚) ｜ 系统: 小键盘 8 (开始) / 小键盘 7 (投币)'
    }
  } else if (name.includes('合金弹头')) {
    return {
      p1: '移动: W, A, S, D ｜ 动作: J (射击-长按自动连发) / K (跳跃) / L (扔手榴弹) ｜ 系统: Enter (开始) / Shift (投币)',
      p2: '移动: ↑, ↓, ←, → ｜ 动作: 小键盘 1 (射击-长按自动连发) / 小键盘 2 (跳跃) / 小键盘 3 (扔手榴弹) ｜ 系统: 小键盘 5 (开始) / 小键盘 4 (投币)'
    }
  } else if (name.includes('恐龙快打')) {
    return {
      p1: '移动: W, A, S, D ｜ 动作: J (出拳攻击) / K (跳跃) ｜ 系统: Enter (开始) / Shift (投币)',
      p2: '移动: ↑, ↓, ←, → ｜ 动作: 小键盘 1 (出拳攻击) / 小键盘 2 (跳跃) ｜ 系统: 小键盘 5 (开始) / 小键盘 4 (投币)'
    }
  } else if (name.includes('象棋')) {
    return {
      p1: '光标移动: W, A, S, D ｜ 操作: K (选棋/移动/开始) / J (取消/后退) ｜ 系统: Enter (开始/暂停)',
      p2: '光标移动: ↑, ↓, ←, → ｜ 操作: 小键盘 2 (选棋/移动/开始) / 小键盘 1 (取消/后退) ｜ 系统: 小键盘 5 (开始/暂停)'
    }
  } else if (name.includes('五子棋')) {
    return {
      p1: '光标移动: W, A, S, D ｜ 操作: K (下棋落子) / J (投降) ｜ 系统: Shift (选择) / Enter (开始)',
      p2: '光标移动: ↑, ↓, ←, → ｜ 操作: 小键盘 2 (下棋落子) / 小键盘 1 (投降) ｜ 系统: 小键盘 4 (选择) / 小键盘 5 (开始)'
    }
  } else if (name.includes('坦克大战')) {
    return {
      p1: '坦克移动: W, A, S, D ｜ 动作: J (开炮攻击，K键无功能) ｜ 系统: Shift (选择关卡) / Enter (开始)',
      p2: '坦克移动: ↑, ↓, ←, → ｜ 动作: 小键盘 1 (开炮攻击，小键盘2无功能) ｜ 系统: 小键盘 4 (选择关卡) / 小键盘 5 (开始)'
    }
  } else if (name.includes('魂斗罗')) {
    return {
      p1: '8向移动/趴下: W, A, S, D ｜ 动作: J (射击攻击) / K (跳跃) ｜ 系统: Shift (选择) / Enter (开始)',
      p2: '8向移动/趴下: ↑, ↓, ←, → ｜ 动作: 小键盘 1 (射击攻击) / 小键盘 2 (跳跃) ｜ 系统: 小键盘 4 (选择) / 小键盘 5 (开始)'
    }
  } else if (name.includes('马里奥')) {
    return {
      p1: '移动与下蹲: W, A, S, D ｜ 动作: J (吐子弹/长按加速奔跑) / K (跳跃) ｜ 系统: Enter (开始/暂停)',
      p2: '移动与下蹲: ↑, ↓, ←, → ｜ 动作: 小键盘 1 (吐子弹/长按加速奔跑) / 小键盘 2 (跳跃) ｜ 系统: 小键盘 5 (开始/暂停)'
    }
  } else if (name.includes('双截龙')) {
    return {
      p1: '街头移动: W, A, S, D ｜ 动作: J (拳打攻击) / K (脚踢/攻击) ｜ 系统: Shift (选择) / Enter (开始)',
      p2: '街头移动: ↑, ↓, ←, → ｜ 动作: 小键盘 1 (拳打攻击) / 小键盘 2 (脚踢/攻击) ｜ 系统: 小键盘 4 (选择) / 小键盘 5 (开始)'
    }
  } else if (name.includes('冒险岛')) {
    return {
      p1: '控制移动: W, A, S, D ｜ 动作: J (投掷武器攻击/奔跑加速) / K (高空跳跃) ｜ 系统: Enter (开始/暂停)',
      p2: '控制移动: ↑, ↓, ←, → ｜ 动作: 小键盘 1 (投掷武器攻击/奔跑加速) / 小键盘 2 (高空跳跃) ｜ 系统: 小键盘 5 (开始/暂停)'
    }
  } else if (name.includes('热血足球')) {
    return {
      p1: '球场移动: W, A, S, D ｜ 动作: J (传球/射门/撞击) / K (跳跃/铲球/必杀) ｜ 系统: Enter (开始/暂停)',
      p2: '球场移动: ↑, ↓, ←, → ｜ 动作: 小键盘 1 (传球/射门/撞击) / 小键盘 2 (跳跃/铲球/必杀) ｜ 系统: 小键盘 5 (开始/暂停)'
    }
  } else if (type === 'gba' || name.includes('宝可梦') || name.includes('逆转') || name.includes('塞尔达') || name.includes('卡比') || name.includes('恶魔城') || name.includes('火焰之纹章')) {
    return {
      isSinglePlayer: true,
      header: '🎮 GBA 单人掌机按键映射指南',
      p1: '十字键移动: W, A, S, D ｜ 动作: K (A键/确认与跳跃) / J (B键/取消/攻击/跑步) ｜ 肩键: U (L键) / I (R键) ｜ 系统: Enter (Start主菜单) / Shift (Select快捷键)',
      p2: ''
    }
  } else if (type === 'nes') {
    return {
      p1: '十字键移动: W, A, S, D ｜ 动作: J (B键/攻击) / K (A键/跳跃或操作) ｜ 系统: Shift (选择) / Enter (开始)',
      p2: '十字键移动: ↑, ↓, ←, → ｜ 动作: 小键盘 1 (B键/攻击) / 小键盘 2 (A键/跳跃或操作) ｜ 系统: 小键盘 4 (选择) / 小键盘 5 (开始)'
    }
  } else {
    return {
      p1: '移动: W, A, S, D ｜ 动作: J (攻击) / K (跳跃) ｜ 系统: Enter (开始) / Shift (投币)',
      p2: '移动: ↑, ↓, ←, → ｜ 动作: 小键盘 1 (攻击) / 小键盘 2 (跳跃) ｜ 系统: 小键盘 5 (开始) / 小键盘 4 (投币)'
    }
  }
}

const getArcadeUrl = (game) => {
  let url = `/emulator.html?game=${game.rom}&core=${game.core}`
  if (game.bios) {
    url += `&bios=${game.bios}`
  }
  return url
}

// 解析键盘操作路由，支持无手柄玩家自定义选择 WASD 还是 上下左右小键盘
const resolveKeyboardPlayer = (defaultPlayer) => {
  if (connectedGamepads.value.length === 1) {
    const padPlayer = singleGamepadPlayer.value
    const nonPadPlayer = padPlayer === 1 ? 2 : 1
    const layout = keyboardLayoutForNoPad.value
    if (layout === 'layout1' && defaultPlayer === 1) {
      return nonPadPlayer
    } else if (layout === 'layout2' && defaultPlayer === 2) {
      return nonPadPlayer
    }
  }
  return defaultPlayer
}

// === NES 运行机制 ===
const handleKeyDown = (e) => {
  if (!currentNes) return
  const mapping = KEY_MAP_CODE[e.code] || KEY_MAP_KEYCODE[e.keyCode]
  if (mapping) {
    const targetPlayer = resolveKeyboardPlayer(mapping.player)
    currentNes.buttonDown(targetPlayer, mapping.button)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) || [37, 38, 39, 40].includes(e.keyCode)) {
      e.preventDefault()
    }
  }
}

const handleKeyUp = (e) => {
  if (!currentNes) return
  const mapping = KEY_MAP_CODE[e.code] || KEY_MAP_KEYCODE[e.keyCode]
  if (mapping) {
    const targetPlayer = resolveKeyboardPlayer(mapping.player)
    currentNes.buttonUp(targetPlayer, mapping.button)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) || [37, 38, 39, 40].includes(e.keyCode)) {
      e.preventDefault()
    }
  }
}

const startGame = () => {
  if (isPlaying.value) return
  isPlaying.value = true

  const canvas = document.getElementById('mario-canvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(256, 240)
  const buf = new Uint32Array(imageData.data.buffer)

  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 })
  const BUFFER_SIZE = 4096
  const audioBuffer = {
    L: new Float32Array(BUFFER_SIZE * 2),
    R: new Float32Array(BUFFER_SIZE * 2),
    pos: 0
  }

  const scriptNode = audioCtx.createScriptProcessor(BUFFER_SIZE, 0, 2)
  scriptNode.onaudioprocess = (e) => {
    const outL = e.outputBuffer.getChannelData(0)
    const outR = e.outputBuffer.getChannelData(1)
    for (let i = 0; i < BUFFER_SIZE; i++) {
      if (audioBuffer.pos <= i) {
        outL[i] = 0; outR[i] = 0;
      } else {
        outL[i] = audioBuffer.L[i]; outR[i] = audioBuffer.R[i];
      }
    }
    const remaining = Math.max(0, audioBuffer.pos - BUFFER_SIZE)
    audioBuffer.L.copyWithin(0, BUFFER_SIZE)
    audioBuffer.R.copyWithin(0, BUFFER_SIZE)
    audioBuffer.pos = remaining
  }
  scriptNode.connect(audioCtx.destination)

  // eslint-disable-next-line no-undef
  currentNes = new jsnes.NES({
    onFrame: (frameBuffer) => {
      for (let i = 0; i < 256 * 240; i++) {
        buf[i] = 0xFF000000 | frameBuffer[i]
      }
      ctx.putImageData(imageData, 0, 0)
    },
    onAudioSample: (l, r) => {
      if (audioBuffer.pos < audioBuffer.L.length) {
        audioBuffer.L[audioBuffer.pos] = l
        audioBuffer.R[audioBuffer.pos] = r
        audioBuffer.pos++
      }
    },
    sampleRate: 44100
  })

  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('keyup', handleKeyUp)

  const targetRom = selectedGame.value ? (selectedGame.value.rom || 'mario.nes') : 'mario.nes'
  const targetName = selectedGame.value ? (selectedGame.value.name || '红白机游戏') : '红白机游戏'

  fetch(`/${targetRom}`)
    .then(res => res.arrayBuffer())
    .then(ab => {
      const bytes = new Uint8Array(ab)
      let binary = ""
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      currentNes.loadROM(binary)

      const interval = 1000 / 60
      let lastTime = performance.now()
      function step(currentTime) {
        if (currentTime - lastTime > interval) {
          lastTime = currentTime - ((currentTime - lastTime) % interval)
          currentNes.frame()
        }
        animationFrameId = requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
    .catch(err => {
      console.error("ROM 加载失败:", err)
      alert(`${targetName} ROM 加载失败，请检查 public/${targetRom} 是否存在！`)
      isPlaying.value = false
    })

  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
}

const cleanupNes = () => {
  isPlaying.value = false
  if (animationFrameId) {
    try {
      cancelAnimationFrame(animationFrameId)
    } catch (e) {}
    animationFrameId = null
  }
  if (audioCtx) {
    try {
      if (audioCtx.state !== 'closed') {
        audioCtx.close()
      }
    } catch (e) {
      console.error('Failed to close audioCtx:', e)
    }
    audioCtx = null
  }
  if (gamepadPollId) {
    try { cancelAnimationFrame(gamepadPollId) } catch(e){}
    gamepadPollId = null
  }
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('keyup', handleKeyUp)
  currentNes = null
}

onBeforeUnmount(() => {
  cleanupNes()
  // 移除手柄事件监听器和轮询帧，彻底消除内存泄漏
  window.removeEventListener('gamepadconnected', _onGamepadConnected)
  window.removeEventListener('gamepaddisconnected', _onGamepadDisconnected)
  if (gamepadPollId) {
    cancelAnimationFrame(gamepadPollId)
    gamepadPollId = null
  }
})
</script>

<style scoped>
.retro-container {
  padding: 30px 40px;
  animation: fadeIn 0.5s ease;
  max-width: 1200px;
  margin: 0 auto;
  box-sizing: border-box;
}

.retro-header {
  margin-bottom: 30px;
}

.retro-header h2 {
  color: #1e293b;
  font-size: 28px;
  font-weight: bold;
  margin: 0 0 8px 0;
}

.retro-subtitle {
  color: #64748b;
  font-size: 14px;
  margin: 0;
}

/* 1. 游戏分类网格 */
.category-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 30px;
  margin-top: 20px;
}

.category-card {
  background: #1e293b;
  border: 3px solid #0f172a;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 6px 6px 0px #0f172a;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  backdrop-filter: blur(8px);
}

.category-card:hover {
  transform: translate(-3px, -3px);
  box-shadow: 10px 10px 0px #0f172a;
  border-color: #f1c40f;
}

.card-image-wrapper {
  position: relative;
  height: 240px;
  overflow: hidden;
  border-bottom: 3px solid #0f172a;
}

.category-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.category-card:hover .category-cover-img {
  transform: scale(1.03);
}

.cover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(11, 15, 25, 0.4);
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.category-card:hover .cover-overlay {
  opacity: 1;
}

.enter-badge {
  background: #f1c40f;
  color: #0f172a;
  padding: 10px 24px;
  border-radius: 20px;
  font-weight: bold;
  font-size: 15px;
  border: 2px solid #0f172a;
  box-shadow: 3px 3px 0px #0f172a;
}

.category-info {
  padding: 24px;
}

.category-info h3 {
  color: white;
  margin: 0 0 10px 0;
  font-size: 20px;
  font-weight: bold;
}

.category-info p {
  color: #94a3b8;
  font-size: 14.5px;
  line-height: 1.6;
  margin: 0;
}

/* 2. 游戏列表视图 */
.gamelist-view {
  animation: fadeIn 0.4s ease;
}

.view-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.btn-back-nav {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  color: #334155;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 2px 5px rgba(0,0,0,0.05);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-back-nav:hover {
  background: #f1f5f9;
  border-color: #42b983;
  color: #42b983;
}

.category-indicator {
  font-size: 14px;
  color: #64748b;
}

.category-indicator b {
  color: #1e293b;
  margin-left: 5px;
}

.game-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 25px;
}

.game-card {
  background: #1e293b;
  border: 3px solid #0f172a;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 4px 4px 0px #0f172a;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}

.game-card:hover {
  transform: translate(-2px, -2px);
  box-shadow: 7px 7px 0px #0f172a;
  border-color: #f1c40f;
}

.game-cover-wrapper {
  height: 160px;
  overflow: hidden;
  background: #0b0f19;
  border-bottom: 3px solid #0f172a;
}

.game-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.game-card:hover .game-cover-img {
  transform: scale(1.02);
}

.game-card-body {
  padding: 18px;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.game-card-body h4 {
  color: white;
  margin: 0 0 8px 0;
  font-size: 17px;
  font-weight: bold;
}

.game-desc {
  color: #94a3b8;
  font-size: 13.5px;
  line-height: 1.5;
  margin: 0 0 16px 0;
  flex-grow: 1;
}

.btn-start-game {
  background: #f1c40f;
  color: #0f172a;
  border: 2px solid #0f172a;
  padding: 10px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 14.5px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 2px 2px 0px #0f172a;
}

.btn-start-game:hover {
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0px #0f172a;
  background: #f39c12;
}

/* 3. 游戏运行视图 */
.gameplay-view {
  animation: fadeIn 0.4s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.gameplay-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 14px 24px;
  border-radius: 12px;
  margin-bottom: 20px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
  box-sizing: border-box;
}

.gameplay-title {
  color: white;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.game-dot {
  width: 8px;
  height: 8px;
  background: #2ecc71;
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

.btn-exit-game {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 3px 8px rgba(231, 76, 60, 0.3);
}

.btn-exit-game:hover {
  background: #c0392b;
  box-shadow: 0 4px 12px rgba(231, 76, 60, 0.5);
}

.gameplay-viewport {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 25px;
}

/* 3A. NES 大视窗 */
.nes-viewport-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

.nes-screen-wrapper {
  position: relative;
  width: 640px;  /* 完美放大 2.5 倍库 */
  height: 600px; /* 完美放大 2.5 倍高度 */
  background: #000;
  border: 6px solid #1e293b;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 25px rgba(0,0,0,0.5);
  box-sizing: border-box;
}

#mario-canvas {
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: pixelated; /* 像素化，无损放大 */
}

.start-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  z-index: 10;
}

.play-btn {
  background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
  color: white;
  padding: 14px 28px;
  border-radius: 30px;
  font-weight: bold;
  font-size: 18px;
  box-shadow: 0 4px 15px rgba(46, 204, 113, 0.4);
  transition: all 0.2s;
}

.play-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 20px rgba(46, 204, 113, 0.6);
}

/* 3B. 街机视窗 */
.arcade-viewport-container {
  width: 100%;
  max-width: 960px;
}

.iframe-container {
  position: relative;
  width: 100%;
  padding-top: 75%; /* 4:3 比例 */
  background: #0b0f19;
  border: 4px solid #1e293b;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 25px rgba(0,0,0,0.4);
  box-sizing: border-box;
}

.emulator-iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
}

/* 4. 双人键位说明面板 */
.gamepad-instructions-panel {
  width: 100%;
  max-width: 960px;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0,0,0,0.15);
  box-sizing: border-box;
}

.panel-header {
  background: #0f172a;
  padding: 12px 20px;
  color: #00f2fe;
  font-weight: bold;
  font-size: 14.5px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.panel-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.player-row {
  display: flex;
  align-items: center;
  gap: 15px;
  font-size: 13.5px;
}

.p-badge {
  background: #3498db;
  color: white;
  font-weight: bold;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  min-width: 50px;
  text-align: center;
  flex-shrink: 0;
}

.p2-badge {
  background: #e67e22;
}

.keys {
  color: #e2e8f0;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.6; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* === 顶部行与外接手柄动态操作条 CSS === */
.header-main-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.gamepad-quick-actions {
  display: flex;
  align-items: center;
}

.gameplay-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-gamepad-config {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  white-space: nowrap;
}

.btn-gamepad-single {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #ffffff;
}

.btn-gamepad-single:hover {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
}

.btn-gamepad-swap {
  background: linear-gradient(135deg, #8b5cf6, #6d28d9);
  color: #ffffff;
}

.btn-gamepad-swap:hover {
  background: linear-gradient(135deg, #a78bfa, #8b5cf6);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(109, 40, 217, 0.35);
}

.btn-gamepad-swap.swapped-active {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4);
}

.pad-icon, .swap-icon {
  font-size: 16px;
}

/* === 外接手柄控制配置弹窗 Modal CSS === */
.pad-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(8px);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fadeIn 0.2s ease-out;
}

.pad-modal-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 16px;
  width: 100%;
  max-width: 680px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  color: #f1f5f9;
}

.pad-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #334155;
}

.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-title-wrap h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #ffffff;
}

.btn-close-pad-modal {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
  transition: color 0.2s;
}

.btn-close-pad-modal:hover {
  color: #ffffff;
}

.pad-modal-body {
  padding: 24px;
}

.pad-status-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #0f172a;
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid #3b82f6;
  margin-bottom: 16px;
}

.pad-badge {
  background: #3b82f6;
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
}

.pad-id {
  color: #60a5fa;
  font-weight: 600;
  font-size: 14px;
}

.pad-modal-tip {
  color: #94a3b8;
  font-size: 13.5px;
  margin-bottom: 24px;
  line-height: 1.6;
}

.config-block {
  margin-bottom: 26px;
}

.config-label {
  display: block;
  font-size: 14.5px;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 12px;
}

.pad-options-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.pad-option-card {
  background: #0f172a;
  border: 2px solid #334155;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pad-option-card:hover {
  border-color: #64748b;
  transform: translateY(-2px);
}

.pad-option-card.active {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
  box-shadow: 0 0 0 1px #3b82f6;
}

.option-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.option-header h4 {
  margin: 0;
  font-size: 15px;
  color: #ffffff;
}

.player-avatar, .kbd-icon {
  font-size: 20px;
}

.pad-option-card p {
  margin: 0;
  font-size: 12.5px;
  color: #94a3b8;
  line-height: 1.5;
}

.pad-modal-footer {
  padding: 16px 24px;
  background: #0f172a;
  border-top: 1px solid #334155;
  display: flex;
  justify-content: flex-end;
  border-bottom-left-radius: 16px;
  border-bottom-right-radius: 16px;
}

.btn-save-pad-config {
  background: #3b82f6;
  color: #ffffff;
  border: none;
  padding: 10px 22px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-save-pad-config:hover {
  background: #2563eb;
}

.srm-save-warning {
  margin-top: 14px;
  background: rgba(234, 179, 8, 0.12);
  border: 1px solid rgba(234, 179, 8, 0.35);
  border-radius: 10px;
  padding: 14px 18px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.warn-icon {
  font-size: 22px;
  line-height: 1;
  flex-shrink: 0;
}

.warn-content h4 {
  margin: 0 0 6px 0;
  font-size: 14px;
  font-weight: 700;
  color: #facc15;
}

.warn-content p {
  margin: 0 0 6px 0;
  font-size: 12.5px;
  color: #e2e8f0;
  line-height: 1.6;
}

.warn-content p:last-child {
  margin-bottom: 0;
}

.warn-content code {
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  color: #fbbf24;
}
</style>