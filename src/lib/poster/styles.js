/**
 * Map styles. Road widths are in css pixels on screen; exports scale them with the poster.
 *
 *   background - land color (behind roads)
 *   roads      - color/width per road class
 *   water, green, areas - area colors, and whether areas are shown by default
 *   paper, text - poster paper and text colors
 *   route      - route color and outline color
 */
function roads(major, medium, minor, paths, widths = [1.5, 1.1, 0.8, 0.55]) {
  return {
    major: {color: major, width: widths[0]},
    medium: {color: medium, width: widths[1]},
    minor: {color: minor, width: widths[2]},
    paths: {color: paths, width: widths[3]},
  };
}

export const MAP_STYLES = [
  {
    id: 'classic', label: 'Classic',
    background: '#FFFFFF', roads: roads('#111111', '#1A1A1A', '#2A2A2A', '#555555', [1.8, 1.2, 0.8, 0.5]),
    water: '#FFFFFF', green: '#FFFFFF', areas: false,
    paper: '#FFFFFF', text: '#111111', route: {color: '#E4002B', outline: '#FFFFFF'}
  },
  {
    id: 'ink', label: 'Ink on cream',
    background: '#F7F2E8', roads: roads('rgba(26,26,26,0.9)', 'rgba(26,26,26,0.85)', 'rgba(26,26,26,0.8)', 'rgba(26,26,26,0.55)'),
    water: '#A9C7DD', green: '#C9D9B4', areas: false,
    paper: '#F7F2E8', text: '#161616', route: {color: '#C0392B', outline: '#F7F2E8'}
  },
  {
    id: 'minimal', label: 'Minimal grey',
    background: '#FFFFFF', roads: roads('#6E6E6E', '#8C8C8C', '#B4B4B4', '#D2D2D2', [1.6, 1.1, 0.7, 0.5]),
    water: '#EEF1F3', green: '#F2F4EF', areas: true,
    paper: '#FFFFFF', text: '#1E1E1E', route: {color: '#111111', outline: '#FFFFFF'}
  },
  {
    id: 'noir', label: 'Noir',
    background: '#111111', roads: roads('#FFFFFF', '#F0F0F0', '#D8D8D8', '#9A9A9A', [1.8, 1.2, 0.8, 0.5]),
    water: '#262626', green: '#1A1A1A', areas: true,
    paper: '#111111', text: '#F5F5F5', route: {color: '#FFC400', outline: '#111111'}
  },
  {
    id: 'blueprint', label: 'Blueprint',
    background: '#1D4E9B', roads: roads('#F4F7FC', '#E3EAF6', 'rgba(227,234,246,0.85)', 'rgba(227,234,246,0.55)', [1.5, 1.0, 0.7, 0.45]),
    water: '#163E7D', green: '#1D4E9B', areas: true,
    paper: '#1D4E9B', text: '#F4EEDC', route: {color: '#FFD23F', outline: '#1D4E9B'}
  },
  {
    id: 'glacier', label: 'Glacier blue',
    background: '#6F98B8', roads: roads('#FFFFFF', '#FFFFFF', '#F3F6F9', 'rgba(243,246,249,0.75)', [1.8, 1.3, 0.9, 0.55]),
    water: '#F3F6F9', green: '#6F98B8', areas: true,
    paper: '#FFFFFF', text: '#9AA3AA', route: {color: '#1B2A38', outline: '#FFFFFF'}
  },
  {
    id: 'sage', label: 'Sage',
    background: '#FFFFFF', roads: roads('#9EAD8B', '#A8B596', '#B8C3A8', '#CED6C2', [1.8, 1.3, 0.9, 0.6]),
    water: '#B5C1A3', green: '#F1F3EE', areas: true,
    paper: '#FFFFFF', text: '#1E1E1E', route: {color: '#3E4A2F', outline: '#FFFFFF'}
  },
  {
    id: 'gold', label: 'Gold on cream',
    background: '#F7F2EA', roads: roads('#C08A2E', '#C99A45', '#D5AE67', '#E2C795', [1.6, 1.1, 0.8, 0.55]),
    water: '#F7F2EA', green: '#F7F2EA', areas: false,
    paper: '#FFFFFF', text: '#1E1E1E', route: {color: '#7A1F1F', outline: '#F7F2EA'}
  },
  {
    id: 'vintage', label: 'Vintage',
    background: '#FBEFD9', roads: roads('#C8452C', '#D0613F', '#D8826A', '#E0A48F', [1.8, 1.2, 0.7, 0.45]),
    water: '#14708A', green: '#EDE3C8', areas: true,
    paper: '#FBEFD9', text: '#C8452C', route: {color: '#14708A', outline: '#FBEFD9'}
  },
  {
    id: 'atlas', label: 'Atlas',
    background: '#D9D9D9', roads: roads('#FFFFFF', '#FFFFFF', '#FAFAFA', 'rgba(250,250,250,0.8)', [2.0, 1.4, 0.9, 0.5]),
    water: '#7DB0D0', green: '#A9D08E', areas: true,
    paper: '#FFFFFF', text: '#B2B2B2', route: {color: '#D7191C', outline: '#FFFFFF'}
  },
  {
    id: 'midnight', label: 'Midnight',
    background: '#0E1A2B', roads: roads('#E6C88A', '#C9D3E6', 'rgba(201,211,230,0.75)', 'rgba(201,211,230,0.4)', [1.6, 1.1, 0.7, 0.45]),
    water: '#1B3150', green: '#122338', areas: true,
    paper: '#0E1A2B', text: '#E6C88A', route: {color: '#FF5A5F', outline: '#0E1A2B'}
  },
  {
    id: 'route', label: 'Route highlight',
    background: '#FAFAFA', roads: roads('#C9C9C9', '#D2D2D2', '#DDDDDD', '#E8E8E8', [1.5, 1.1, 0.8, 0.5]),
    water: '#E9EEF1', green: '#F0F2EC', areas: true,
    paper: '#FFFFFF', text: '#111111', route: {color: '#111111', outline: '#FFFFFF'}
  },
];

export function getStyle(id) {
  return MAP_STYLES.find(s => s.id === id) || MAP_STYLES[1];
}
