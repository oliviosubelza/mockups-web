export const StorageKeys = {
  titlebar: {
    showMenubar: 'titlebar:show-menubar',
  },
  sidebar: {
    width: 'sidebar:width',
  },
  appearance: 'app:appearance',
  toolPermissions: 'tools:allow-always',
  language: 'app:language',
  keybindings: 'app:keybindings',
  auth: {
    tenantSlug: 'auth:tenant-slug',
  },
  branch: {
    selectedId:   'branch:selected-id',
    selectedName: 'branch:selected-name',
  },
} as const
