import CryptoJS from 'crypto-js'

// 使用应用标识作为加密密钥的一部分，结合浏览器指纹增加唯一性
const SALT = 'VueChatPro_2024'

function getEncryptionKey(): string {
  // 基于固定盐值 + navigator 信息生成密钥，确保同设备同浏览器下一致
  const raw = `${ SALT }_${ navigator.userAgent.slice(0, 20) }`
  return CryptoJS.SHA256(raw).toString().slice(0, 32)
}

export function encrypt(plainText: string): string {
  if (!plainText) return ''
  const key = CryptoJS.enc.Utf8.parse(getEncryptionKey())
  const iv = CryptoJS.enc.Utf8.parse(SALT.slice(0, 16))
  const encrypted = CryptoJS.AES.encrypt(plainText, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })
  return encrypted.toString()
}

export function decrypt(cipherText: string): string {
  if (!cipherText) return ''
  try {
    const key = CryptoJS.enc.Utf8.parse(getEncryptionKey())
    const iv = CryptoJS.enc.Utf8.parse(SALT.slice(0, 16))
    const decrypted = CryptoJS.AES.decrypt(cipherText, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    })
    return decrypted.toString(CryptoJS.enc.Utf8)
  } catch {
    // 解密失败（如旧版明文数据），返回原始值兼容迁移
    return cipherText
  }
}
