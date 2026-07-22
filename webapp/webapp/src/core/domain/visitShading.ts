export type VisitShade = 'none' | 'user1' | 'user2' | 'both'

export const WEB_VISIT_FILLS: Record<Exclude<VisitShade, 'none'>, string> = {
  user1: '#b0b0b0',
  user2: '#606060',
  both: '#000000',
}

export const BMP_VISIT_FILLS: Record<Exclude<VisitShade, 'none'>, string> = {
  user1: '#a0a0a0',
  user2: '#606060',
  both: '#000000',
}

//shading logic
export const resolveVisitShade = (
  id: string,
  user1: ReadonlySet<string>,
  user2: ReadonlySet<string>,
): VisitShade => {
  const selectedByUser1 = user1.has(id)
  const selectedByUser2 = user2.has(id)
  if (selectedByUser1 && selectedByUser2) return 'both'
  if (selectedByUser1) return 'user1'
  if (selectedByUser2) return 'user2'
  return 'none'
}
