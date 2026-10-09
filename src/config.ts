export const CONTACT = {
  email: 'zapricot.india@gmail.com',
  phone: '+91 93919 18082',
  phoneHref: 'tel:+919391918082',
  instagram: '@zapricot.india',
  instagramHref: 'https://www.instagram.com/zapricot.india/',
  location: 'Hyderabad, Telangana, India',
}

/** Early access sign-up (Google Form). Every "Early access" link opens it in a new tab. */
export const EARLY_ACCESS_URL = 'https://forms.gle/yuqt18titG8Y3pSC7'

export type FinishId = 'graphite' | 'titanium' | 'gold' | 'copper' | 'midnight'


export const FINISHES: { id: FinishId; name: string; edge: string }[] = [
  { id: 'graphite', name: 'Graphite', edge: '#3b3b3d' },
  { id: 'titanium', name: 'Titanium', edge: '#a3a19c' },
  { id: 'gold', name: 'Champagne Gold', edge: '#c9a96e' },
  { id: 'copper', name: 'Copper', edge: '#b9805f' },
  { id: 'midnight', name: 'Midnight', edge: '#34507a' },
]

/** Rolodex order on /product. TODO(specs): material, weight, thickness, chip — add when confirmed. */
export const PRODUCT_FINISHES: { id: FinishId; name: string; vibe: string; glow: string }[] = [
  { id: 'gold', name: 'Champagne Gold', vibe: 'Warm, quiet, unmistakable.', glow: 'rgba(226, 178, 104, 0.55)' },
  { id: 'copper', name: 'Copper', vibe: 'A little rose, a little bold.', glow: 'rgba(222, 136, 108, 0.52)' },
  { id: 'graphite', name: 'Graphite', vibe: 'Dark, brushed, all business.', glow: 'rgba(160, 160, 170, 0.34)' },
  { id: 'midnight', name: 'Midnight', vibe: 'Deep blue for late drives.', glow: 'rgba(70, 112, 205, 0.55)' },
  { id: 'titanium', name: 'Titanium', vibe: 'Cool, raw, timeless.', glow: 'rgba(212, 216, 224, 0.38)' },
]
