import { describe, expect, it } from 'vitest'
import { decrypt, encrypt } from '@/utils/crypto'

describe('crypto', () => {
  it('encrypts and decrypts a string correctly', () => {
    const plain = 'sk-test-api-key-12345'
    const cipher = encrypt(plain)
    expect(cipher).not.toBe(plain)
    expect(cipher.length).toBeGreaterThan(0)
    expect(decrypt(cipher)).toBe(plain)
  })

  it('returns empty string for empty input', () => {
    expect(encrypt('')).toBe('')
    expect(decrypt('')).toBe('')
  })

  it('handles invalid cipher text gracefully', () => {
    // decrypt of garbage should return the original string (migration compat)
    const result = decrypt('not-a-valid-cipher')
    expect(typeof result).toBe('string')
  })

  it('produces different ciphertext for different inputs', () => {
    const a = encrypt('key-a')
    const b = encrypt('key-b')
    expect(a).not.toBe(b)
  })
})
