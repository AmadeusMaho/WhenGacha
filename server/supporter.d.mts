import type { IncomingMessage, ServerResponse } from 'node:http'

export function supportEnabled(): boolean
export function supportProblems(): string[]
export function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void>
