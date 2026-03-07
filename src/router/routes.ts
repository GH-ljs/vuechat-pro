import childRoutes from '@/router/child-routes'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Root',
    redirect: {
      name: 'ChatRoot'
    }
  },
  ...childRoutes,
  {
    path: '/:pathMatch(.*)',
    name: '404',
    component: () => import('@/components/NotFound.vue')
  }
]

export default routes
