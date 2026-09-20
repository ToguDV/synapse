import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/types'

const api: Api = {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node
  },
  pages: {
    list: () => ipcRenderer.invoke('pages:list'),
    get: (id) => ipcRenderer.invoke('pages:get', id),
    create: (input) => ipcRenderer.invoke('pages:create', input),
    rename: (id, title) => ipcRenderer.invoke('pages:rename', { id, title }),
    setIcon: (id, icon) => ipcRenderer.invoke('pages:setIcon', { id, icon }),
    move: (id, input) =>
      ipcRenderer.invoke('pages:move', {
        id,
        parentId: input.parentId,
        position: input.position
      }),
    remove: (id) => ipcRenderer.invoke('pages:remove', id)
  },
  blocks: {
    list: (pageId) => ipcRenderer.invoke('blocks:list', pageId),
    create: (input) => ipcRenderer.invoke('blocks:create', input),
    update: (id, patch) => ipcRenderer.invoke('blocks:update', { id, patch }),
    reorder: (pageId, orderedIds) => ipcRenderer.invoke('blocks:reorder', { pageId, orderedIds }),
    remove: (id) => ipcRenderer.invoke('blocks:remove', id)
  },
  search: {
    query: (term, limit) => ipcRenderer.invoke('search:query', { term, limit })
  },
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value })
  }
}

contextBridge.exposeInMainWorld('api', api)
