export const StorageKeys = {
  titlebar: {
    showMenubar: 'titlebar:show-menubar',
    showTabbar:  'titlebar:show-tabbar',
  },
  sidebar: {
    width: 'sidebar:width',
  },
  appearance: 'app:appearance',
  toolPermissions: 'tools:allow-always',
  language: 'app:language',
  keybindings: 'app:keybindings',
  tabs: 'app:tabs',
  tabsSettings: 'app:tabs-settings',
  auth: {
    tenantSlug: 'auth:tenant-slug',
  },
  branch: {
    selectedId:   'branch:selected-id',
    selectedName: 'branch:selected-name',
  },
} as const
