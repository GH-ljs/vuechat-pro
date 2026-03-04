/**
 * TODO: 若是 Github 演示部署环境，则仅模拟大模型相关策略，不调接口
 */
// export const isGithubDeployed = process.env.VITE_ROUTER_MODE === 'hash'
// 强制设置为 false，这样下拉框里其他真实的 AI 模型就全部解锁可用了
export const isGithubDeployed = false

