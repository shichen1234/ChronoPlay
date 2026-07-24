import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
const routes = [
  {
    path: '/',
    redirect: '/home'  
  },
  {
    path: '/home',
    name: 'Home',
    component: Home 
  },
  {
    path: '/list',
    name: 'List',
    component: () => import('../views/List.vue') 
  },
  {
    path: '/detail/:id',
    name: 'Detail',
    component: () => import('../views/Detail.vue') 
  },
  {
    path: '/hof',
    name: 'HallOfFame',
    component: () => import('../views/HallOfFame.vue')
  },
  {
    path: '/retro',
    name: 'Retro',
    component: () => import('../views/Retro.vue') 
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/store',
    name: 'Store',
    component: () => import('../views/Store.vue')
  },
  {
    path: '/store/detail/:id',
    name: 'StoreDetail',
    component: () => import('../views/StoreDetail.vue')
  },
  {
    path: '/profile/:steamid?',
    name: 'Profile',
    component: () => import('../views/Profile.vue')
  },
  {
    path: '/publisher/:name',
    name: 'Publisher',
    component: () => import('../views/Publisher.vue')
  },
  {
    path: '/accelerator',
    name: 'Accelerator',
    component: () => import('../views/Accelerator.vue')
  }
]
const router = createRouter({
  history: createWebHistory(),
  routes,
  linkActiveClass: 'active-link' 
})
export default router
