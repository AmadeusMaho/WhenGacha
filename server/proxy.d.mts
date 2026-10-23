import type { IncomingMessage, ServerResponse } from 'node:http'

export const MAX_BYTES: number
export function handleProxy(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void>
