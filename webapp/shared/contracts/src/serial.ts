export type Serial = string

export const isValidSerial = (value: string): value is Serial =>
  typeof value === 'string' && /^[A-Z0-9]{1,32}$/.test(value)
