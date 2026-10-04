import { expect, it } from 'vitest'
import { RateLimiter } from './rateLimiter'

it('waits once the window is full', async () => {
  let now = 0
  const sleeps: number[] = []
  const limiter = new RateLimiter(
    2,
    1000,
    () => now,
    async (ms) => {
      sleeps.push(ms)
      now += ms
    },
  )
  await limiter.acquire()
  await limiter.acquire()
  expect(sleeps).toEqual([])
  await limiter.acquire()
  expect(sleeps).toEqual([1005])
})
