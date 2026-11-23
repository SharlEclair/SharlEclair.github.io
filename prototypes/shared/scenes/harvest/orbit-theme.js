/** Palette tokens for the Harvest "orbit" variants (?harvest=orbit-25 | orbit-mid | orbit-3d). Hex strings. */
export const ORBIT_THEMES = {
  dark: {
    bg: '#08080a', space: '#0b0e1a', ink: '#c9d2f0', inkMuted: '#5a6488',
    ocean: '#060d1f', oceanDeep: '#030712', land: '#18211f', landHi: '#2e3a33',
    atmoIn: '#5fe6ff', atmoMid: '#3b7fe8', atmoOut: '#a58bff',
    thread: '#5fe6ff', threadSoft: '#2a6f86',
    water: '#7df3ff', waterDim: '#1d4a5a', flood: '#3b7fe8', soil: '#3a2c20',
    levee: '#c9d2f0', leveeA: 0.35, rice: '#86d23c', riceHi: '#c8ff7a', city: '#ffb24a',
    foil: '#e9c06a', foilDark: '#8a5a1c', satDark: '#1a1f2a', cell: '#0d1440', cellGrid: '#6b8cff', cellFrame: '#f5b95a',
    sun: '#fff1d8',
    labelFg: 'var(--on-stage, #e6efff)', labelHalo: 'var(--stage, #08080a)', labelA1: '#5fe6ff', labelA2: '#a58bff',
    additive: true,
  },
  light: {
    bg: '#e8e6db', space: '#e3e1d4', ink: '#131312', inkMuted: '#8a887d',
    ocean: '#e8e6db', oceanDeep: '#dcdacd', land: '#cfccbd', landHi: '#9c9a8e',
    atmoIn: '#c8372d', atmoMid: '#131312', atmoOut: '#8a887d',
    thread: '#c8372d', threadSoft: '#e0a49c',
    water: '#2a7f9e', waterDim: '#9cc3cf', flood: '#7cc2da', soil: '#d8cca8',
    levee: '#131312', leveeA: 0.55, rice: '#3f9e2f', riceHi: '#0a7a3d', city: null,
    foil: '#2a2a27', foilDark: '#131312', satDark: '#30312e', cell: '#30312e', cellGrid: '#8f8e83', cellFrame: '#c8372d',
    sun: '#ffffff',
    labelFg: 'var(--on-stage, #131312)', labelHalo: 'var(--stage, #e8e6db)', labelA1: '#0a7a3d', labelA2: '#c8372d',
    additive: false,
  },
}
export const TIERS = ['25', 'mid', '3d']
