import type { IncomingMessage, ServerResponse } from 'node:http'

export const MAX_BYTES: number
export function handleProxy(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void>
export function flushCache(): Promise<void>
export function setTransport(fn?: (url: string, ua: string) => Promise<{ status: number; headers: { get(name: string): string | null }; arrayBuffer(): Promise<Buffer> }>): void
export function sourceFetch(url: string): Promise<Response>
