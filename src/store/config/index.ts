//一个全新的 Pinia 仓库，用来专门管理全局设置
import { defineStore } from 'pinia'
import { encrypt, decrypt } from '@/utils/crypto'

// API Key 提供商列表
interface ApiKeys {
  deepseek: string
  siliconflow: string
  moonshot: string
  spark: string
}

const STORAGE_KEY = 'vuechat-api-keys'
const TEMP_KEY = 'vuechat-temperature'

// 从 localStorage 读取并解密 API Keys
const loadApiKeys = (): ApiKeys => {
  const defaults: ApiKeys = { deepseek: '', siliconflow: '', moonshot: '', spark: '' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Record<string, string>
    return {
      deepseek: decrypt(parsed.deepseek ?? ''),
      siliconflow: decrypt(parsed.siliconflow ?? ''),
      moonshot: decrypt(parsed.moonshot ?? ''),
      spark: decrypt(parsed.spark ?? '')
    }
  } catch {
    return defaults
  }
}

// 加密后写入 localStorage
const saveApiKeys = (keys: ApiKeys) => {
  const encrypted = {
    deepseek: encrypt(keys.deepseek),
    siliconflow: encrypt(keys.siliconflow),
    moonshot: encrypt(keys.moonshot),
    spark: encrypt(keys.spark)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted))
}

const loadTemperature = (): number => {
  try {
    const raw = localStorage.getItem(TEMP_KEY)
    return raw ? Number(raw) : 0.7
  } catch {
    return 0.7
  }
}

export const useConfigStore = defineStore('config-store', {
  state: () => ({
    apiKeys: loadApiKeys(),
    temperature: loadTemperature()
  }),
  actions: {
    // 保存到加密 localStorage
    persistKeys() {
      saveApiKeys(this.apiKeys)
    },
    persistTemperature() {
      localStorage.setItem(TEMP_KEY, String(this.temperature))
    },
    resetConfig() {
      this.apiKeys = { deepseek: '', siliconflow: '', moonshot: '', spark: '' }
      this.temperature = 0.7
      this.persistKeys()
      this.persistTemperature()
    }
  }
})
