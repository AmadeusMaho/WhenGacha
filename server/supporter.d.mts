import type { IncomingMessage, ServerResponse } from 'node:http'

export function makeCode(key?: string): string
export function checkCode(raw: unknown, key?: string): boolean
export function handleUnlock(req: IncomingMessage, res: ServerResponse): Promise<void>
