/**
 * Every value in angle brackets is a PLACEHOLDER to fill before launch.
 * Placeholders render highlighted on the page so none can slip through unnoticed.
 */
export const LEGAL = {
  lastUpdated: '<DATE>',
  entity: "<LEGAL ENTITY NAME or 'Zapricot (founders Naveen Panya and Chetan Dora)'>",
  location: 'Hyderabad, Telangana, India',
  email: 'zapricot.india@gmail.com',
  hosting: '<Vercel>',
  retention: '<24 months>',
  responseTime: '<30 days>',
  grievanceOfficer: '<NAME>',
}

export const isPlaceholder = (v: string) => /^<.+>$/.test(v)
